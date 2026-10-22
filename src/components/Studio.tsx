import { useEffect, useRef, useState } from 'react';
import { clipUrl, stillUrl, type Genre } from '../genres';
import { useDubbing, type Phase } from '../hooks/useDubbing';
import { RECORD_SECONDS } from '../config';
import { STUDIO_COPY } from '../copy';
import { lastInputWasKeyboard } from '../lib/inputModality';

import { ActionIcon } from './ActionIcon';
import { ClipTimeline } from './ClipTimeline';
import { SceneCaption } from './SceneCaption';
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
}

const TAKE_PHASES: readonly Phase[] = ['requesting', 'watching', 'cue', 'countdown', 'recording', 'continuing'];

const TIMELINE_STATE: Record<Phase, string> = {
  idle: '장면 대기',
  previewing: '장면 미리보기',
  requesting: '마이크 연결 중',
  watching: '장면 재생',
  cue: '내 차례',
  countdown: '녹음 준비',
  recording: '녹음 중',
  continuing: '내 목소리로 이어 보기',
  recorded: '녹음 완료',
};

const HEADLINE: Record<Phase, string> = {
  idle: '준비됐나요 ?',
  previewing: '장면을 미리 보고 있어요',
  requesting: '마이크를 연결하고 있어요',
  watching: '장면을 보세요, 곧 내 차례예요',
  cue: '이제 내 차례 !',
  countdown: '잠시 후, 내 목소리로',
  recording: '지금, 목소리를 들려주세요',
  continuing: '내 목소리가 들어간 장면',
  recorded: '내 목소리, 마음에 드나요 ?',
};

export function Studio({ active, genre, onHome, onSave, entrance, sampleMode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [buffering, setBuffering] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const previousPhaseRef = useRef<Phase>('idle');
  const dub = useDubbing(genre.id, videoRef, sampleMode);
  const { phase } = dub;
  const inTake = TAKE_PHASES.includes(phase);
  const done = phase === 'recorded';
  const previewing = phase === 'previewing';
  const playing = phase === 'watching' || phase === 'continuing' || previewing;
  const shouting = phase === 'cue' || phase === 'countdown' || phase === 'recording';
  // 외칠 말은 두 자리에 두고 CSS가 하나만 보인다 — 영상 아래쪽 가운데(PC·태블릿·가로), 세로 휴대폰은 안내 글 자리에 덮어서
  // (10/22 — 화면 폭 16:9 영상 안에서는 3·2·1과 겹치고, 조작부에 끼우면 영상·단추 덩어리가 움직인다)
  const shout = (place: 'screen' | 'dock') => shouting && (
    <p className={`studio-shout studio-shout-${place}`} data-testid={`studio-shout-${place}`}>
      <small>{STUDIO_COPY.shoutLabel}</small><strong>“{genre.shout}”</strong>
    </p>
  );

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
  // 경우가 있어 명시적으로 load()를 부른다. 진입은 첫 장면에서 대기한다.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.src = clipUrl(genre.id);
    v.load();
    v.pause();
    v.currentTime = 0;
    v.muted = true;
  }, [genre.id]);

  const save = () => {
    if (sampleMode) onSave({ kind: 'sample' });
    else if (dub.recordedBlob) onSave({ kind: 'recording', blob: dub.recordedBlob, mime: dub.recordedMime });
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
                onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onError={() => setBuffering(false)} />
              <div className="studio-pause-shade" aria-hidden="true" />
              <div className="studio-pause-title" aria-hidden="true">
                <small>장면 더빙</small>
                <strong>{genre.summary}</strong>
                <p>{genre.name}<span>10초</span></p>
              </div>
              {/* 화면 가운데 재생 단추는 녹음 없이 장면을 미리 본다(10/20 대표님) — 녹음은 아래 «장면 시작»으로만 시작한다 */}
              {phase === 'idle' && <button type="button" className="studio-screen-playback" id="screenPlaybackBtn"
                aria-label="장면 미리보기" onClick={dub.preview}>
                <span aria-hidden="true"><ActionIcon name="play" /></span>
              </button>}
              {playing && buffering && <div className="studio-buffering" role="status">영상을 불러오고 있어요</div>}
              <SceneCaption genre={genre} videoRef={videoRef} enabled={phase === 'watching' || previewing} />
              {shout('screen')}
              {phase === 'cue' && <div className="studio-cue" role="status" id="cue"><strong>{STUDIO_COPY.yourTurn}</strong></div>}
              {dub.countdown > 0 && <div className="overlay show" id="overlay"><div className="count" id="count" key={dub.countdown} aria-label={`${dub.countdown}초 뒤 녹음 시작`}>{dub.countdown}<span>{STUDIO_COPY.speakNow}</span></div></div>}
              {phase === 'recording' && <>
                <div className="recpill show" id="recpill"><span className="d" /> {sampleMode ? '샘플 녹음 체험 중' : '녹음 중'}</div>
                <div className="record-left" role="progressbar" aria-label={`녹음 ${RECORD_SECONDS}초 중 남은 시간`} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.round(dub.recordLeft * 100)}><i style={{ transform: `scaleX(${dub.recordLeft})` }} /></div>
              </>}
            </div>
            <div className="studio-player-dock">
              <div className="studio-timeline">
                <span className="timeline-state">{TIMELINE_STATE[phase]}</span>
                <ClipTimeline phase={phase} videoRef={videoRef} />
              </div>
              <div className={`controls${inTake ? ' is-recording' : ''}${done ? ' is-recorded' : ''}`}>
                <div className="controls-copy">
                  <h2>{sampleMode && done ? '샘플 체험을 마쳤어요' : HEADLINE[phase]}</h2>
                  <div className="hint" id="hint" role="status" data-mic-error={dub.micError ?? undefined}>{dub.hint}</div>
                  {shout('dock')}
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
                  <button className="btn btn-ghost" id="resetBtn" onClick={dub.reset}><ActionIcon name="retry" /> 다시 녹음</button>
                  <button className="btn btn-save" id="saveBtn" ref={saveButtonRef} onClick={save}>{sampleMode ? '다운로드' : '저장하기'} <ActionIcon name="arrow" /></button>
                </div>}
              </div>
            </div>
          </div>
        </div>
      </div>
      {active && entrance && <StudioEntrance entry={entrance} />}
    </section>
  );
}
