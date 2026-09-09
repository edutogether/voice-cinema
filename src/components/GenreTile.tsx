import { useEffect, useRef } from 'react';
import { clipUrl, thumbUrl, type Genre } from '../genres';
import { SUPPORTS_HOVER } from '../lib/pointer';

interface Props {
  genre: Genre;
  /** 마우스가 없는 기기에서 "지금 보고 있는 카드"인지. 마우스가 있으면 항상 false다(호버가 그 역할을 한다). */
  active: boolean;
  onSelect: (genre: Genre) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

export function GenreTile({ genre, active, onSelect, registerRef }: Props) {
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

  // 마우스가 없는 기기: 활성 카드가 되면 재생하고, 벗어나면 멈춘다. 한 번에 한 장만
  // 재생되므로 PC에서 마우스를 옮길 때와 같은 모양이고, 클립도 그 한 장만 내려받는다.
  //
  // 음소거는 타협이 아니라 필수다. 소리가 있으면 브라우저가 자동재생을 막아 정지
  // 화면 그대로가 되고, 부스에서 여러 개가 동시에 소리를 내는 사고도 난다. 학생이
  // 원본 소리를 듣는 자리는 스튜디오 화면의 "미리 보기"이고 그건 그대로다.
  useEffect(() => {
    if (SUPPORTS_HOVER) return;
    const v = videoRef.current;
    if (!v) return;

    const stop = () => {
      v.pause();
      v.classList.remove('playing');
      // 호버 경로와 같은 이유로 자원을 놓아준다 — 보이지 않는 카드가 디코더를
      // 쥐고 있으면 정작 보이는 카드가 재생되지 못한다.
      v.removeAttribute('src');
      v.load();
    };

    if (!active) {
      stop();
      return;
    }

    if (!v.src) v.src = clipUrl(genre.id);
    v.muted = true; // 자동재생 정책을 통과하는 유일한 조건이다
    v.loop = true; // 10초짜리라 반복하지 않으면 곧 마지막 프레임에서 멈춘다
    v.play()
      .then(() => v.classList.add('playing'))
      .catch((e) => console.warn(`[카드 자동재생 실패] ${genre.id}`, e));

    return stop;
  }, [active, genre.id]);

  return (
    <div
      ref={registerRef}
      className={`tile${active ? ' is-active' : ''}`}
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
