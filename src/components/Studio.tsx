import { useEffect, useRef } from 'react';
import { CLIP_SECONDS } from '../config';
import { clipUrl, type Genre } from '../genres';
import { useDubbing } from '../hooks/useDubbing';
import { iconSvg } from './GenreTile';

interface Props {
  active: boolean;
  genre: Genre;
  onHome: () => void;
  onSave: (blob: Blob, mime: string) => void;
}

export function Studio({ active, genre, onHome, onSave }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dub = useDubbing(genre.id, videoRef);
  const { phase } = dub;
  const recording = phase === 'countdown' || phase === 'recording';
  const done = phase === 'recorded' || phase === 'replaying';

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
      <div className="topbar">
        <button className="back" id="studioBackBtn" onClick={onHome}>← 처음으로</button>
        <span className="chip">
          <span className="e" id="chipEmoji" style={{ color: genre.color }} dangerouslySetInnerHTML={{ __html: iconSvg(genre) }} />
          <span id="chipName">{genre.name}</span>
        </span>
      </div>

      <div className="stage">
        <video id="clip" ref={videoRef} playsInline muted preload="auto" />
        {phase === 'recording' && (
          <div className="recpill show" id="recpill"><span className="d" /> REC</div>
        )}
        {dub.countdown > 0 && (
          <div className="overlay show" id="overlay">
            <div className="count" id="count" key={dub.countdown}>{dub.countdown}</div>
          </div>
        )}
      </div>

      <div className={`progress${dub.showProgress ? ' show' : ''}`} id="progress">
        <i id="bar" style={{ width: `${dub.progress}%` }} />
      </div>

      <div className="controls">
        <div className="hint" id="hint">{dub.hint}</div>

        {!recording && !done && (
          <button className="btn btn-lg btn-ghost" id="previewBtn" onClick={dub.togglePreview}>
            {phase === 'preview' ? '⏹ 미리보기 정지' : '▶ 미리 보기'}
          </button>
        )}

        {!done && (
          <button className="btn btn-rec" id="recBtn" disabled={recording} onClick={dub.startRecord}>
            <span className="ic">🎤</span>
            <span>녹음 시작</span>
          </button>
        )}

        {done && (
          <div className="row" id="afterRow">
            <button className="btn btn-lg btn-ghost" id="replayBtn" onClick={dub.replay}>▶ 다시 듣기</button>
            <button className="btn btn-lg btn-gold" id="resetBtn" onClick={dub.reset}>🔄 다시 녹음</button>
            <button
              className="btn btn-lg btn-save"
              id="saveBtn"
              onClick={() => dub.recordedBlob && onSave(dub.recordedBlob, dub.recordedMime)}
            >
              💾 저장하기
            </button>
          </div>
        )}
      </div>

      <div className="footer" id="studioFoot">약 {CLIP_SECONDS}초 동안 녹음돼요</div>
    </section>
  );
}
