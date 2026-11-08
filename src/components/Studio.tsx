import { useEffect, useRef, useState } from 'react';
import { clipUrl, stillUrl, type Genre } from '../genres';
import { useDubbing, type Phase } from '../hooks/useDubbing';
import { RECORD_BASE_SECONDS } from '../config';
import { STUDIO_COPY } from '../copy';
import { lastInputWasKeyboard } from '../lib/inputModality';
import { holdBackground } from '../lib/backgroundLoad';
import { prefetchFinalClip } from '../lib/ffmpeg';

import { ActionIcon } from './ActionIcon';
import { ClipTimeline } from './ClipTimeline';
import { SceneCaption, SceneTurnCue } from './SceneCaption';
import { StudioEntrance } from './StudioEntrance';
import type { SceneEntrance } from '../lib/sceneEntrance';
import type { RecordingSource } from './Result';

interface Props {
  active: boolean;
  genre: Genre;
  onHome: () => void;
  onSave: (recording: RecordingSource) => void;
  sampleMode: boolean;
  entrance: SceneEntrance | null;
  /** «더빙하기»를 눌러 들어온 녹음실 — 장면을 바로 소리와 함께 튼다. 앞으로·뒤로 이동으로 돌아온 녹음실은 false다. */
  autoPreview: boolean;
}

// 장면 영상이 이 시간 안에 다 받히지 않아도 뒤에서 받던 엔진을 다시 받게 한다(저장이 마냥 늦어지지 않게)
const CLIP_FIRST_MAX_MS = 60000;

const TAKE_PHASES: readonly Phase[] = ['requesting', 'watching', 'cue', 'countdown', 'recording', 'checking', 'continuing'];

const TIMELINE_STATE: Record<Phase, string> = {
  idle: '시작 전',
  previewing: '장면 미리보기',
  requesting: '마이크 연결 중',
  watching: '장면 재생',
  cue: '내 차례',
  countdown: '녹음 준비',
  recording: '녹음 중',
  checking: '목소리 확인',
  continuing: '내 목소리로 이어 보기',
  recorded: '녹음 완료',
};

const HEADLINE: Record<Phase, string> = {
  idle: '준비됐나요 ?',
  previewing: '먼저 장면을 한 번 봐요',
  requesting: '마이크를 연결하고 있어요',
  watching: '장면을 보세요, 곧 내 차례예요',
  cue: '이제 내 차례 !',
  countdown: '잠시 후, 내 목소리로',
  recording: '지금, 목소리를 들려주세요',
  checking: '목소리를 확인하고 있어요',
  continuing: '내 목소리가 들어간 장면',
  recorded: '내 목소리, 마음에 드나요 ?',
};

export function Studio({ active, genre, onHome, onSave, entrance, sampleMode, autoPreview }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [buffering, setBuffering] = useState(false);
  // 받는 중 표시는 카드에서 녹음실로 커지는 동안(메인 화면처럼 보이는 때)에는 띄우지 않고, 다 열린 뒤 받은 만큼을 퍼센트로 붙인다
  // (11/9 Bumm님 «메인화면에선 띄우지말고 영상 골라서 누른 화면에서는 필요하면 지금거에서 퍼센트까지 띄워도 될듯»)
  const [settled, setSettled] = useState(!entrance);
  const [loaded, setLoaded] = useState(0);
  const measureLoaded = (v: HTMLVideoElement) => {
    if (!Number.isFinite(v.duration) || v.duration <= 0) { setLoaded(0); return; }
    let end = 0;
    for (let i = 0; i < v.buffered.length; i += 1) if (v.buffered.start(i) <= v.currentTime + 0.1) end = Math.max(end, v.buffered.end(i));
    setLoaded(Math.min(100, Math.floor((end / v.duration) * 100)));
  };
  const titleRef = useRef<HTMLHeadingElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const previousPhaseRef = useRef<Phase>('idle');
  const dub = useDubbing(genre.id, videoRef, sampleMode, autoPreview);
  const { phase } = dub;
  const inTake = TAKE_PHASES.includes(phase);
  const done = phase === 'recorded';
  const previewing = phase === 'previewing';
  const playing = phase === 'watching' || phase === 'continuing' || previewing;

  useEffect(() => {
    if (active) titleRef.current?.focus({ preventScroll: true });
  }, [active]);
  // 단계가 바뀔 때 다음에 누를 단추로 초점을 옮기는 것은 키보드로 다니는 사람에게만 한다 — 마우스로 쓰면 그 단추에
  // 빨간 초점 띠가 남는다(10/20 대표님 «다시 듣기» 빨간 띠, src/lib/inputModality.ts).
  useEffect(() => {
    if (active && lastInputWasKeyboard()) {
      if (phase === 'recorded' && previousPhaseRef.current === 'continuing') saveButtonRef.current?.focus({ preventScroll: true });
      if (phase === 'idle' && previousPhaseRef.current !== 'idle') startButtonRef.current?.focus({ preventScroll: true });
    }
    previousPhaseRef.current = phase;
  }, [active, phase]);

  // 클립을 바꿀 때마다 로드한다. 장르를 바꿔도 브라우저가 이전 디코드 상태를 들고 있는
  // 경우가 있어 명시적으로 load()를 부른다. «더빙하기»로 들어왔으면 바로 튼다 — App이 그 누름 안에서 이 화면을 동기로 그리므로
  // (flushSync) 여기까지가 누름과 같은 호출이다. 아이폰은 그래야 소리를 허용한다(e2e/studio-autoplay.spec.js가 고정한다).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.src = clipUrl(genre.id);
    v.load();
    v.pause();
    v.currentTime = 0;
    v.muted = true;
    if (autoPreview) dub.playPreview();
  }, [genre.id]);

  // 느린 와이파이에서는 이 장면 영상이 먼저 받히게 뒤에서 받던 엔진은 그동안 쉰다(src/lib/backgroundLoad.ts). 다 받히거나 브라우저가
  // 그만 받으면(suspend) 놓고, 저장할 때 쓰는 완성용 원판을 미리 받아 둔다 — 녹음하는 동안 받아 «저장하기» 뒤에 기다리지 않게.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || sampleMode) return;
    const release = holdBackground();
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      release();
      prefetchFinalClip(genre.id);
    };
    const check = () => {
      const b = v.buffered;
      if (v.duration > 0 && b.length && b.end(b.length - 1) >= v.duration - 0.25) settle();
    };
    v.addEventListener('progress', check);
    v.addEventListener('canplaythrough', check);
    v.addEventListener('suspend', settle);
    const safety = window.setTimeout(settle, CLIP_FIRST_MAX_MS);
    return () => {
      v.removeEventListener('progress', check);
      v.removeEventListener('canplaythrough', check);
      v.removeEventListener('suspend', settle);
      window.clearTimeout(safety);
      release();
    };
  }, [genre.id, sampleMode]);

  const save = () => {
    if (sampleMode) onSave({ kind: 'sample' });
    else if (dub.recording) onSave({ kind: 'recording', ...dub.recording });
  };

  return (
    <section id="studio" className={`view${active ? ' active' : ''}`} data-phase={phase}>
      <div className="studio-workspace">
        <div className="studio-screen">
          <div className="stage">
            <div className="studio-heading">
              <button className="back" id="studioBackBtn" onClick={onHome}><ActionIcon name="back" /> 다른 영화 고르기</button>
              <div className="studio-scene-title">
                <span className="studio-scene-label"><span id="chipName">{genre.name}</span>{sampleMode && ' · 녹음 샘플 체험'}</span>
                <h1 ref={titleRef} tabIndex={-1}>{genre.summary}</h1>
              </div>
              <span className="studio-brand"><img src="/icons/studio-microphone.png" width="34" height="34" alt="" /><span>Voice <em>Cinema</em></span></span>
            </div>
            <div className={`studio-video-frame${phase === 'idle' ? ' is-paused' : ''}`}>
              <video id="clip" ref={videoRef} poster={stillUrl(genre.id)} playsInline muted preload="auto"
                onWaiting={(e) => { measureLoaded(e.currentTarget); setBuffering(true); }} onPlaying={() => setBuffering(false)} onError={() => setBuffering(false)}
                onProgress={(e) => measureLoaded(e.currentTarget)} onLoadedMetadata={(e) => measureLoaded(e.currentTarget)} />
              <div className="studio-pause-shade" aria-hidden="true" />
              <div className="studio-pause-title" aria-hidden="true">
                <small>장면 더빙</small>
                <strong>{genre.summary}</strong>
                <p>{genre.name}<span>10초</span></p>
              </div>
              {settled && playing && buffering && <div className="studio-buffering" role="status">영상을 불러오고 있어요 {loaded}%</div>}
              <SceneCaption genre={genre} videoRef={videoRef} enabled={phase === 'watching' || previewing} />
              <SceneTurnCue genre={genre} videoRef={videoRef} enabled={previewing} />
              {previewing && dub.soundBlocked && <button type="button" className="studio-sound-on" id="soundOnBtn" onClick={dub.soundOn}><ActionIcon name="soundOff" /> 소리 켜기</button>}
              {phase === 'cue' && <div className="studio-cue" role="status" id="cue"><strong>{STUDIO_COPY.yourTurn}</strong></div>}
              {/* 3·2·1은 숫자만(11/8 Bumm님 «뭘 3·2·1에 계속 밑에 주저리 나오냐»), 말할 차례 문구는 녹음기가 켜질 때 «녹음 중»과 함께 떠 숫자 하나만큼(1초) 있다 */}
              {dub.countdown > 0 && <div className="overlay show" id="overlay"><div className="count" id="count" key={dub.countdown} aria-label={`${dub.countdown}초 뒤 녹음 시작`}>{dub.countdown}</div></div>}
              {phase === 'recording' && <>
                {dub.speakNow && <div className="studio-cue studio-speak" role="status" id="speakCue"><strong>{STUDIO_COPY.speakNow}</strong></div>}
                <div className="recpill show" id="recpill"><span className="d" /> {sampleMode ? '샘플 녹음 체험 중' : '녹음 중'}</div>
                <div className="record-left" role="progressbar" aria-label={`녹음 ${RECORD_BASE_SECONDS}초 중 남은 시간`} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.round(dub.recordLeft * 100)}><i style={{ transform: `scaleX(${dub.recordLeft})` }} /></div>
              </>}
            </div>
            <div className="studio-player-dock">
              <div className="studio-timeline">
                {/* 단계 이름을 모두 한 칸에 겹쳐 두고 지금 것만 보인다 — 칸 폭이 가장 긴 이름에 고정돼, 단계가 바뀌어도 오른쪽 진행 막대가
                    좌우로 튀지 않는다(11/8 Bumm님 «시작할 때 버벅임» — «녹음 준비»→«녹음 중»에서 막대가 11px 움직였다). */}
                <span className="timeline-state">{(Object.keys(TIMELINE_STATE) as Phase[]).map((p) => (
                  <span key={p} className={p === phase ? 'on' : undefined}>{TIMELINE_STATE[p]}</span>
                ))}</span>
                <ClipTimeline phase={phase} videoRef={videoRef} />
              </div>
              <div className={`controls${inTake ? ' is-recording' : ''}${done ? ' is-recorded' : ''}`}>
                <div className="controls-copy">
                  <h2>{sampleMode && done ? '샘플 체험을 마쳤어요' : HEADLINE[phase]}</h2>
                  <div className="hint" id="hint" role="status" data-mic-error={dub.micError ?? undefined} data-take-check={dub.takeCheck ?? undefined}>{dub.hint}</div>
                </div>
                {!done && <div className="record-actions">
                  {(phase === 'idle' || previewing) && <button className="btn btn-ghost" id="previewBtn" type="button" onClick={previewing ? dub.reset : dub.preview}>
                    <ActionIcon name={previewing ? 'stop' : 'play'} /> {previewing ? '미리보기 멈춤' : '미리보기'}
                  </button>}
                  <button className="btn btn-rec" id="recBtn" ref={startButtonRef} disabled={inTake} onClick={dub.startTake}>
                    <span className="record-dot" aria-hidden="true" /><span>{inTake ? TIMELINE_STATE[phase] : '장면 시작'}</span>
                  </button>
                </div>}
                {done && <div className="row" id="afterRow">
                  <button className="btn btn-ghost" id="resetBtn" onClick={dub.startTake}><ActionIcon name="retry" /> 다시 녹음</button>
                  <button className="btn btn-save" id="saveBtn" ref={saveButtonRef} onClick={save}>{sampleMode ? '다운로드' : '저장하기'} <ActionIcon name="arrow" /></button>
                </div>}
              </div>
            </div>
          </div>
        </div>
      </div>
      {active && entrance && <StudioEntrance entry={entrance} onDone={() => setSettled(true)} />}
    </section>
  );
}
