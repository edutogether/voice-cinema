import { useEffect, useRef } from 'react';
import { CLIP_SECONDS } from '../config';
import { clipUrl, thumbUrl, type Genre } from '../genres';
import { useDubbing } from '../hooks/useDubbing';
import { iconSvg } from './GenreTile';
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
      <div className="workflow-heading">
        <div><p className="workflow-eyebrow">내 목소리로 완성하는 한 장면</p><h1 ref={titleRef} tabIndex={-1}>{genre.name} 더빙</h1></div>
        <button className="back" id="studioBackBtn" onClick={onHome}><ActionIcon name="back" /> 처음으로</button>
      </div>
      <div className="studio-workspace">
      <div className="studio-screen">
      <div className="stage">
        <video id="clip" ref={videoRef} poster={thumbUrl(genre.id)} playsInline muted preload="auto" />
        {phase === 'recording' && (
          <div className="recpill show" id="recpill"><span className="d" /> 녹음 중</div>
        )}
        {dub.countdown > 0 && (
          <div className="overlay show" id="overlay">
            <div className="count" id="count" key={dub.countdown} aria-label={`${dub.countdown}초 뒤 녹음 시작`}>{dub.countdown}</div>
          </div>
        )}
      </div>

      <div className={`progress${dub.showProgress ? ' show' : ''}`} id="progress" role="progressbar" aria-label="영상 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(displayProgress)}>
        <i id="bar" style={{ width: `${displayProgress}%` }} />
      </div>
      <div className="screen-tools">
        <span className="chip"><span className="e" id="chipEmoji" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg(genre) }} /><span id="chipName">{genre.name}</span><span className="clip-duration">약 {CLIP_SECONDS}초</span></span>
        {!recording && !done && (
          <button className="btn btn-lg btn-ghost" id="previewBtn" onClick={dub.togglePreview}>
            <ActionIcon name={phase === 'preview' ? 'stop' : 'play'} />{phase === 'preview' ? '미리보기 정지' : '미리 보기'}
          </button>
        )}
        {dub.showProgress && <span className="clip-time" aria-hidden="true">{phase === 'recorded' ? '녹음 완료' : `${Math.round(dub.progress * CLIP_SECONDS / 100)} / ${CLIP_SECONDS}초`}</span>}
      </div>
      <p className="studio-scene-summary">{genre.summary}</p>
      </div>

      <div className={`controls${recording ? ' is-recording' : ''}${done ? ' is-recorded' : ''}`}>
        <span className="control-symbol" aria-hidden="true"><ActionIcon name={done ? 'check' : 'mic'} /></span>
        <h2>{done ? '내 목소리를 확인해요' : phase === 'countdown' ? '곧 녹음이 시작돼요' : phase === 'recording' ? '지금, 주인공이 되어봐요' : '준비되면 시작해요'}</h2>
        <div className="hint" id="hint" role="status">{dub.hint}</div>

        {!done && (
          <button className="btn btn-rec" id="recBtn" ref={recordButtonRef} disabled={recording} onClick={dub.startRecord}>
            <ActionIcon name="mic" />
            <span>{phase === 'countdown' ? '녹음 준비 중' : phase === 'recording' ? '녹음 중' : '녹음 시작'}</span>
          </button>
        )}

        {done && (
          <div className="row" id="afterRow">
            <button className="btn btn-lg btn-ghost" id="replayBtn" ref={replayButtonRef} onClick={dub.replay}><ActionIcon name="play" /> 다시 듣기</button>
            <button className="btn btn-lg btn-ghost" id="resetBtn" onClick={dub.reset}><ActionIcon name="retry" /> 다시 녹음</button>
            <button
              className="btn btn-lg btn-save"
              id="saveBtn"
              onClick={() => dub.recordedBlob && onSave(dub.recordedBlob, dub.recordedMime)}
            >
              저장하기 <ActionIcon name="arrow" />
            </button>
          </div>
        )}
        <p className="studio-note" id="studioFoot">{done ? '저장하면 QR로 내 영화를 받을 수 있어요.' : `녹음 시작을 누르면 3·2·1 후 시작해요. 약 ${CLIP_SECONDS}초 뒤 자동으로 끝나요.`}</p>
      </div>
      </div>
      <p className="workflow-footer">틀려도 괜찮아요. 마음에 들 때까지 다시 녹음할 수 있어요.</p>
    </section>
  );
}
