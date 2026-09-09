import { useEffect, useRef } from 'react';
import { clipUrl, thumbUrl, type Genre } from '../genres';
import { SUPPORTS_HOVER } from '../lib/pointer';

// 재생이 멈췄는지 되돌아보는 간격. loop만으로는 실제 기기에서 계속 돈다는 보장이
// 없다 — 절전 모드, 동시 디코드 한도, 백그라운드 전환 등으로 브라우저가 임의로
// 멈추면 카드가 마지막 프레임에 굳는다(2026-09-09 대표가 실제 폰에서 발견).
// 원인을 하나씩 막는 대신 "멈춰 있으면 다시 튼다"로 한 곳에서 처리한다.
const WATCH_MS = 2000;

interface Props {
  genre: Genre;
  /** 이 카드가 지금 재생돼야 하는지. 마우스가 있는 기기에서는 호버가 정하므로 쓰이지 않는다. */
  playing: boolean;
  /** 재생을 이만큼 늦춰 시작한다 — 여섯 장이 한꺼번에 내려받기를 시작하지 않게 하려는 것이다. */
  delayMs: number;
  /** 한 장씩 돌려 재생하는 환경에서 "지금 이 카드"임을 알린다 — 강조가 함께 걸린다. */
  solo: boolean;
  /** 재생이 거부됐을 때 알린다. 동시 재생을 하나로 제한하는 환경을 알아내는 신호다. */
  onBlocked: () => void;
  onSelect: (genre: Genre) => void;
}

export function GenreTile({ genre, playing, delayMs, solo, onBlocked, onSelect }: Props) {
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

  // 마우스가 없는 기기: 여섯 장이 전부 재생된다. 한 장만 고르면 사용자는 "왜 저것만"이
  // 되고, 스크롤이 없는 화면에서는 그 한 장이 영영 바뀌지 않아 나머지가 죽은 것처럼
  // 보인다(2026-09-09 대표 지적). PC에서 한 장만 사는 건 거기에 마우스가 있어서다.
  //
  // 음소거는 타협이 아니라 필수다. 소리가 있으면 브라우저가 자동재생을 막아 정지
  // 화면 그대로가 되고, 부스에서 여섯 개가 동시에 소리를 내는 사고도 난다. 학생이
  // 원본 소리를 듣는 자리는 스튜디오 화면의 "미리 보기"이고 그건 그대로다.
  useEffect(() => {
    if (SUPPORTS_HOVER) return;
    const v = videoRef.current;
    if (!v) return;

    let timer: number | undefined;
    let watch: number | undefined;
    const stop = () => {
      window.clearTimeout(timer);
      window.clearInterval(watch);
      v.pause();
      v.classList.remove('playing');
      // 호버 경로와 같은 이유로 자원을 놓아준다 — 화면을 떠난 뒤에도 디코더를
      // 쥐고 있으면 다른 화면이 그만큼 느려진다.
      v.removeAttribute('src');
      v.load();
    };

    if (!playing) {
      stop();
      return;
    }

    // 처음 받을 때만 시차를 준다 — 여섯 장이 한꺼번에 내려받기를 시작하지 않게 하려는
    // 것이라, 이미 받아둔 뒤 반복될 때는 그냥 이어서 돌면 된다.
    timer = window.setTimeout(() => {
      if (!v.src) v.src = clipUrl(genre.id);
      v.muted = true; // 자동재생 정책을 통과하는 유일한 조건이다
      v.loop = true; // 10초짜리라 반복하지 않으면 곧 마지막 프레임에서 멈춘다
      v.play()
        .then(() => v.classList.add('playing'))
        .catch((e) => {
          // 거부는 곧 "이 환경은 이 카드를 지금 재생할 수 없다"는 뜻이다. 느린 회선과
          // 달리 시간이 지나도 저절로 풀리지 않으므로, 동시 재생 제한을 알아내는
          // 신호로 이것을 쓴다(재생 장수를 세는 방식은 회선이 느릴 때 오판한다).
          onBlocked();
          console.warn(`[카드 자동재생 실패] ${genre.id}`, e);
        });

      // loop를 걸어도 실제 기기에서는 브라우저가 임의로 멈출 수 있다. 멈춰 있으면
      // 다시 튼다 — 끝난 영상에 play()를 부르면 처음부터 다시 재생된다.
      watch = window.setInterval(() => {
        if (!v.paused || !v.isConnected) return;
        // 다시 시도해서 또 거부되면 일시적인 것이 아니다 — 그 사실을 알린다.
        v.play().catch(onBlocked);
      }, WATCH_MS);
    }, delayMs);

    return stop;
  }, [playing, delayMs, genre.id, onBlocked]);

  return (
    <div
      className={`tile${solo ? ' is-solo' : ''}`}
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
