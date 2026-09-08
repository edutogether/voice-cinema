import { useRef } from 'react';
import { clipUrl, thumbUrl, type Genre } from '../genres';

// 마우스 호버가 실제로 되는 입력장치에서만 썸네일 호버 재생을 켠다 —
// 터치스크린(행사장 태블릿)은 hover 개념이 없어 클립을 미리 받을 이유가 없다.
const SUPPORTS_HOVER = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

interface Props {
  genre: Genre;
  onSelect: (genre: Genre) => void;
}

export function GenreTile({ genre, onSelect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoveringRef = useRef(false);

  // 유튜브 썸네일 방식: 평소엔 첫 프레임 이미지만 보여주다가, 마우스를 올리면
  // 그때 그 클립만 내려받아 재생한다. 6개를 미리 받으면 37MB라 첫 화면이 느려진다.
  const onEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    hoveringRef.current = true;
    if (!v.src) v.src = clipUrl(genre.id);
    v.currentTime = 0;
    v.muted = false;
    const reveal = () => {
      if (hoveringRef.current) v.classList.add('playing');
    };
    v.play().then(reveal).catch(() => {
      // 브라우저가 소리 있는 자동재생을 막으면 무음으로라도 재생을 시도한다.
      v.muted = true;
      v.play().then(reveal).catch(() => {});
    });
  };

  const onLeave = () => {
    const v = videoRef.current;
    if (!v) return;
    hoveringRef.current = false;
    v.pause();
    v.classList.remove('playing');
    // pause()만 하고 src를 남기면 여러 카드를 잇달아 호버할수록 디코더 자원을 쥔
    // <video>가 쌓여 브라우저의 동시 디코드 한도에 걸린다(2026-09-03 실사용에서 확인).
    v.removeAttribute('src');
    v.load();
  };

  return (
    <div
      className="tile"
      style={{ '--c': genre.color } as React.CSSProperties}
      onClick={() => onSelect(genre)}
      onMouseEnter={SUPPORTS_HOVER ? onEnter : undefined}
      onMouseLeave={SUPPORTS_HOVER ? onLeave : undefined}
    >
      <div className="tile-media">
        <img className="thumb" src={thumbUrl(genre.id)} alt="" />
        <video className="preview" ref={videoRef} muted playsInline preload="none" />
      </div>
      <div className="tile-tint" />
      <div className="tile-scrim" />
      <div className="tile-body">
        <div className="gname-row">
          <div className="ic" dangerouslySetInnerHTML={{ __html: iconSvg(genre) }} />
          <div className="gname">{genre.name}</div>
        </div>
        <div className="gsub">{genre.sub}</div>
      </div>
    </div>
  );
}

// 아이콘은 이 저장소가 직접 벤더링한 고정 문자열(genres.ts)이라 외부 입력이 아니다.
export function iconSvg(genre: Genre): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${genre.icon}</svg>`;
}
