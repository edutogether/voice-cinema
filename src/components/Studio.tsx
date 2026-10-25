import { useEffect, useRef, useState } from 'react';
import { clipUrl, sceneFor, stillUrl, type Genre } from '../genres';
import { idleHint, useDubbing, type Phase } from '../hooks/useDubbing';
import { STUDIO_COPY } from '../copy';
import { lastInputWasKeyboard } from '../lib/inputModality';
import { holdBackground } from '../lib/backgroundLoad';
import { prefetchFinalClip } from '../lib/ffmpeg';

import { ActionIcon } from './ActionIcon';
import { ClipTimeline } from './ClipTimeline';
import { SceneGuide } from './SceneGuide';
import { MicMeter } from './MicMeter';
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

// 장면 영상이 이 시간 안에 다 받히지 않아도 뒤에서 받던 엔진을 다시 받게 한다(저장이 마냥 늦어지지 않게)
const CLIP_FIRST_MAX_MS = 60000;

const TAKE_PHASES: readonly Phase[] = ['requesting', 'watching', 'cue', 'countdown', 'recording', 'checking', 'continuing'];
/** 영화가 멈춘 동안 — 안내 칸 대신 «차례» 문구 · 대사 · «지금 외쳐요 !» · 마이크 반응을 보인다 */
const HOLD_PHASES: readonly Phase[] = ['cue', 'countdown', 'recording'];
/** 3단계 중 지금 단계(1 «장면 시작» · 2 N초에 멈춤 · 3 3·2·1 뒤 외치기, 4는 모두 끝남) */
const STEP_AT: Record<Phase, number> = {
  idle: 1, previewing: 1, requesting: 1, watching: 2, cue: 3, countdown: 3, recording: 3, checking: 4, continuing: 4, recorded: 4,
};

const TIMELINE_STATE: Record<Phase, string> = {
  idle: '장면 대기',
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
  previewing: '녹음 없이 미리 보고 있어요',
  requesting: '마이크를 연결하고 있어요',
  watching: '장면을 보세요, 곧 내 차례예요',
  cue: '이제 내 차례 !',
  countdown: '잠시 후, 내 목소리로',
  recording: '지금, 목소리를 들려주세요',
  checking: '목소리를 확인하고 있어요',
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
  const scene = sceneFor(genre);
  const guide = scene.guide;
  const dub = useDubbing(genre.id, scene, videoRef, sampleMode);
  const { phase } = dub;
  const inTake = TAKE_PHASES.includes(phase);
  const holding = HOLD_PHASES.includes(phase);
  const step = STEP_AT[phase];
  const stepState = (n: number) => (n < step ? 'done' : n === step ? 'current' : 'next');
  // 오류 · 판정 알림이 아닌 기본 준비 안내 — 세로 화면에서는 같은 내용을 3단계로 보인다
  const defaultHint = dub.hint === idleHint(scene.pause);
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
            {/* 영상이 화면의 주인공 — 16:9 전체 구도를 자르지 않는다. 가로 화면은 영상이 화면을 채우고 머리줄·조작부가 그 위에 얹히며,
                세로 화면은 머리줄 → 영상 → 진행 막대 → 안내 칸 → 단추 순서로 붙는다(10/25 대표님 녹음실 재구성) */}
            <div className="studio-video-frame">
              <video id="clip" ref={videoRef} poster={stillUrl(genre.id)} playsInline muted preload="auto"
                onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onError={() => setBuffering(false)} />
              {/* 정지 동안만 화면을 살짝(22%) 누른다 — 멈춘 그림은 그대로 보이고, 영상·완성본에는 굽지 않는다(10/25 대표님) */}
              <div className="studio-hold-shade" aria-hidden="true" />
              {playing && buffering && <div className="studio-buffering" role="status">영상을 불러오고 있어요</div>}
              <SceneCaption scene={scene} videoRef={videoRef} enabled={phase === 'watching' || previewing} />
              {/* 3·2·1은 영상 한가운데에 크게 — 대사는 아래 안내 칸(가로 화면은 영상 아래쪽)에 둔다 */}
              {dub.countdown > 0 && <div className="overlay show" id="overlay"><div className="count" id="count" key={dub.countdown} aria-label={`${dub.countdown}초 뒤 녹음 시작`}>{dub.countdown}</div></div>}
              {phase === 'recording' && <div className="recpill show" id="recpill"><span className="d" /> {sampleMode ? '샘플 녹음 체험 중' : '녹음 중'}</div>}
            </div>
            <div className="studio-player-dock">
              <div className="studio-timeline">
                <ClipTimeline phase={phase} pause={scene.pause} videoRef={videoRef} />
              </div>
              <div className={`controls${inTake ? ' is-recording' : ''}${done ? ' is-recorded' : ''}`}>
                <div className="controls-copy">
                  {/* 자유 발화 안내(새 장면에 있을 때)는 멈춘 순간부터 보인다 — 숫자가 끝난 뒤에야 처음 보면 읽느라 머뭇거린다(10/25 대표님).
                      예시는 정답이 아니다(10/26 대표님) — 상황 안내가 크고, 예시는 작게 «예시»로, 그 아래 «내 말로 외쳐도 좋아요 !» */}
                  {phase === 'cue' && <div className="studio-cue" role="status" id="cue"><strong>{STUDIO_COPY.yourTurn}</strong>{guide && <SceneGuide guide={guide} />}</div>}
                  {phase === 'countdown' && <div className="studio-ready" role="status">{guide
                    ? <SceneGuide guide={guide} />
                    : <span className="studio-ready-copy">{STUDIO_COPY.speakNow}</span>}</div>}
                  {phase === 'recording' && <div className="studio-shout" role="status" id="shout">
                    <span className="studio-shout-row"><strong>{STUDIO_COPY.shoutNow}</strong><MicMeter level={dub.micLevel} /></span>
                    {guide && <SceneGuide guide={guide} />}
                    <small className="studio-shout-note">말을 마치면 영화가 바로 이어져요</small>
                  </div>}
                  {!holding && <h2>{sampleMode && done ? '샘플 체험을 마쳤어요' : HEADLINE[phase]}</h2>}
                  {/* 새 장면은 자유 발화 안내를 준비 화면에서 미리 보여 준다 — «외칠 대사»(정답처럼 읽힘)는 10/26 대표님 지시로 뺐다 */}
                  {phase === 'idle' && guide && <div className="studio-guide-preview"><SceneGuide guide={guide} /></div>}
                  <div className={`hint${defaultHint ? ' is-default' : ''}`} id="hint" role="status" data-mic-error={dub.micError ?? undefined} data-take-check={dub.takeCheck ?? undefined}>{dub.hint}</div>
                  <ol className="studio-steps" aria-label="더빙 순서">
                    <li data-state={stepState(1)}><b>{stepState(1) === 'done' ? '✓' : 1}</b><span>«장면 시작»을 눌러요</span></li>
                    <li data-state={stepState(2)}><b>{stepState(2) === 'done' ? '✓' : 2}</b><span>{Math.floor(scene.pause * 10) / 10}초에 영화가 멈춰요</span></li>
                    <li data-state={stepState(3)}><b>{stepState(3) === 'done' ? '✓' : 3}</b><span>3·2·1 뒤에 크게 외쳐요</span></li>
                  </ol>
                </div>
                {!done && <div className="record-actions">
                  {(phase === 'idle' || previewing) && <button className="btn btn-ghost" id="previewBtn" type="button" onClick={previewing ? dub.reset : dub.preview}>
                    <ActionIcon name={previewing ? 'stop' : 'play'} /> {previewing ? '미리보기 멈춤' : '녹음 없이 미리보기'}
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
