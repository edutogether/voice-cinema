import { useEffect, useRef } from 'react';
import { CLIP_SECONDS } from '../config';
import { clipUrl, stillUrl, type Genre } from '../genres';
import { useDubbing } from '../hooks/useDubbing';

import { CinemaHeader } from './CinemaHeader';
import { ActionIcon } from './ActionIcon';

interface Props {
  active: boolean;
  genre: Genre;
  onHome: () => void;
  onSave: (blob: Blob, mime: string) => void;
}

export function Studio({ active, genre, onHome, onSave }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const replayButtonRef = useRef<HTMLButtonElement>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const previousPhaseRef = useRef('idle');
  const dub = useDubbing(genre.id, videoRef);
  const { phase } = dub;
  const recording = phase === 'countdown' || phase === 'recording';
  const done = phase === 'recorded' || phase === 'replaying';
  const displayProgress = phase === 'recorded' ? 100 : dub.progress;

  useEffect(() => {
    if (active) titleRef.current?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => {
    if (active && phase === 'recorded') replayButtonRef.current?.focus({ preventScroll: true });
    if (active && phase === 'idle' && previousPhaseRef.current !== 'idle') recordButtonRef.current?.focus({ preventScroll: true });
    previousPhaseRef.current = phase;
  }, [active, phase]);

  // 클립을 바꿀 때마다 로드한다. src를 리액트 속성으로 두면 되지만, 장르를 바꿔도
  // 브라우저가 이전 디코드 상태를 들고 있는 경우가 있어 명시적으로 load()를 부른다.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.src = clipUrl(genre.id);
    v.muted = true;
    v.currentTime = 0;
    v.load();
  }, [genre.id]);

  return (
    <section id="studio" className={`view${active ? ' active' : ''}`}>
      <CinemaHeader step={2} />
      <div className="studio-heading">
        <button className="back" id="studioBackBtn" onClick={onHome}><ActionIcon name="back" /> 장면 바꾸기</button>
        <div className="studio-title"><p className="eyebrow">나만의 녹음 부스</p><h1 ref={titleRef} tabIndex={-1}><span id="chipName">{genre.name}</span> <span>더빙</span></h1></div>
        <p className="studio-scene-summary">{genre.summary}<span>약 {CLIP_SECONDS}초 · 자유롭게 연기해요</span></p>
      </div>
      <div className="studio-workspace">
        <div className="studio-screen">
          <div className="stage">
            <video id="clip" ref={videoRef} poster={stillUrl(genre.id)} playsInline muted preload="auto" />
            {phase === 'recording' && <div className="recpill show" id="recpill"><span className="d" /> 녹음 중</div>}
            {dub.countdown > 0 && <div className="overlay show" id="overlay"><div className="count" id="count" key={dub.countdown} aria-label={`${dub.countdown}초 뒤 녹음 시작`}>{dub.countdown}<span>곧 내 목소리가 시작돼요</span></div></div>}
          </div>
          <div className="studio-timeline">
            <span className="timeline-state">{phase === 'recorded' ? '녹음 완료' : recording ? '목소리를 담는 중' : phase === 'replaying' ? '내 목소리 다시 듣기' : '장면 미리보기'}</span>
            <div className={`progress${dub.showProgress ? ' show' : ''}`} id="progress" role="progressbar" aria-label="영상 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(displayProgress)}><i id="bar" style={{ width: `${displayProgress}%` }} /></div>
            <span className="clip-time" aria-hidden="true">{Math.round(displayProgress * CLIP_SECONDS / 100)} / {CLIP_SECONDS}초</span>
          </div>
        </div>
        <div className={`controls${recording ? ' is-recording' : ''}${done ? ' is-recorded' : ''}`}>
          <div className="controls-copy">
            <h2>{done ? '내 목소리, 마음에 드나요?' : phase === 'countdown' ? '마이크에 목소리를 준비해요' : phase === 'recording' ? '지금, 나만의 대사를 들려주세요' : '이 장면에 내 목소리를 입혀보세요'}</h2>
            <div className="hint" id="hint" role="status">{dub.hint}</div>
          </div>
          {!done && <div className="record-actions">
            {!recording && <button className="btn btn-ghost" id="previewBtn" onClick={dub.togglePreview}><ActionIcon name={phase === 'preview' ? 'stop' : 'play'} />{phase === 'preview' ? '미리보기 정지' : '미리 보기'}</button>}
            <button className="btn btn-rec" id="recBtn" ref={recordButtonRef} disabled={recording} onClick={dub.startRecord}><span className="record-dot" aria-hidden="true" /><span>{phase === 'countdown' ? '녹음 준비 중' : phase === 'recording' ? '녹음 중' : '녹음 시작'}</span></button>
          </div>}
          {done && <div className="row" id="afterRow">
            <button className="btn btn-ghost" id="replayBtn" ref={replayButtonRef} onClick={dub.replay}><ActionIcon name="play" /> 다시 듣기</button>
            <button className="btn btn-ghost" id="resetBtn" onClick={dub.reset}><ActionIcon name="retry" /> 다시 녹음</button>
            <button className="btn btn-save" id="saveBtn" onClick={() => dub.recordedBlob && onSave(dub.recordedBlob, dub.recordedMime)}>저장하기 <ActionIcon name="arrow" /></button>
          </div>}
        </div>
        <p className="studio-note" id="studioFoot">{done ? '저장하면 영상과 목소리를 합쳐 QR로 전달해요.' : `녹음 시작 → 3·2·1 → 약 ${CLIP_SECONDS}초 뒤 자동으로 끝나요.`}</p>
      </div>
      <p className="workflow-footer">한 번에 잘하지 않아도 괜찮아요. 마음에 들 때까지 다시 녹음해보세요.</p>
    </section>
  );
}
