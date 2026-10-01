import { useEffect, useRef } from 'react';
import { previewUrl, thumbUrl, stillUrl, withAlpha, type Genre } from '../genres';
import { SUPPORTS_HOVER } from '../lib/pointer';

// 재생이 멈췄는지 되돌아보는 간격. loop만으로는 실제 기기에서 계속 돈다는 보장이
// 없다 — 절전 모드, 동시 디코드 한도, 백그라운드 전환 등으로 브라우저가 임의로
// 멈추면 카드가 마지막 프레임에 굳는다(2026-09-09 대표가 실제 폰에서 발견).
// 원인을 하나씩 막는 대신 "멈춰 있으면 다시 튼다"로 한 곳에서 처리한다.
const WATCH_MS = 2000;

interface Props {
  genre: Genre;
  sceneNumber: number;
  /** PC 입체 목록의 주변 카드는 재생·탭 이동 없이 가운데로 고르는 역할이다. */
  previewOnly?: boolean;
  /** 이 카드가 지금 재생돼야 하는지. PC에서는 선택된 중앙 장면만 재생한다. */
  playing: boolean;
  /** 재생을 이만큼 늦춰 시작한다 — 여섯 장이 한꺼번에 내려받기를 시작하지 않게 하려는 것이다. */
  delayMs: number;
  /** 한 장씩 돌려 재생하는 환경에서 "지금 이 카드"임을 알린다 — 강조가 함께 걸린다. */
  solo: boolean;
  /**
   * 재생이 거부됐을 때 장르 id와 함께 알린다. 동시 재생을 하나로 제한하는 환경을 알아내는 신호다.
   * 🟠 부모는 **렌더마다 새로 만들지 않은 함수**를 넘겨야 한다 — 아래 재생 효과가 이 함수에
   * 걸려 있어서, 매번 새 함수가 오면 부모가 다시 그려질 때마다 여섯 장이 멈췄다 다시 튼다.
   */
  onBlocked: (id: string) => void;
  onSelect: (genre: Genre, source?: HTMLElement) => void;
}

export function GenreTile({ genre, sceneNumber, previewOnly = false, playing, delayMs, solo, onBlocked, onSelect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const releaseTimer = useRef<number | undefined>(undefined);
  // PC는 선택 순간 재생한다. 장면 변경·탭 숨김·녹음실 진입 시 이전 요청까지 무효화한다.
  useEffect(() => {
    if (!SUPPORTS_HOVER || !playing) return;
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    window.clearTimeout(releaseTimer.current);
    // 짧게 왕복하면 마지막 프레임에서 이어 재생한다. 매번 첫 프레임으로 튀지 않는다.
    if (!v.getAttribute('src')) v.src = previewUrl(genre.id);
    // 홈에서는 조작 없이도 시작해야 하므로 음소거한다. 원본 소리는 녹음실 미리보기에서 듣는다.
    v.muted = true;
    v.loop = true;
    const reveal = () => {
      if (!cancelled) v.classList.add('playing');
    };
    v.play().then(reveal).catch(() => {});
    return () => {
      cancelled = true;
      v.pause();
      v.classList.remove('playing');
      // 140ms 페이드 동안 정지한 마지막 프레임을 보존한 뒤 디코더를 해제한다.
      releaseTimer.current = window.setTimeout(() => {
        v.removeAttribute('src');
        v.load();
      }, 160);
    };
  }, [playing, genre.id]);
  useEffect(() => {
    if (!SUPPORTS_HOVER) return;
    const v = videoRef.current;
    return () => {
      window.clearTimeout(releaseTimer.current);
      v?.pause();
      v?.removeAttribute('src');
      v?.load();
    };
  }, []);

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
    // 우리가 멈춘 것인지 가린다. stop()의 pause()·load()는 진행 중이던 play()를 끊어
    // 거부로 돌려보내는데, 그건 환경이 막은 것이 아니라 이 효과가 스스로 끝난 것이다.
    // 그것까지 "막혔다"로 세면 멀쩡한 브라우저가 한 장씩 돌리는 모드로 떨어진다.
    let 끝남 = false;
    const 막힘 = (e?: unknown) => {
      if (끝남) return;
      onBlocked(genre.id);
      if (e !== undefined) console.warn(`[카드 자동재생 실패] ${genre.id}`, e);
    };
    const stop = () => {
      끝남 = true;
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
      if (!v.src) v.src = previewUrl(genre.id);
      v.muted = true; // 자동재생 정책을 통과하는 유일한 조건이다
      v.loop = true; // 10초짜리라 반복하지 않으면 곧 마지막 프레임에서 멈춘다
      v.play()
        .then(() => v.classList.add('playing'))
        // 거부는 곧 "이 환경은 이 카드를 지금 재생할 수 없다"는 뜻이다. 느린 회선과
        // 달리 시간이 지나도 저절로 풀리지 않으므로, 동시 재생 제한을 알아내는
        // 신호로 이것을 쓴다(재생 장수를 세는 방식은 회선이 느릴 때 오판한다).
        .catch(막힘);

      // loop를 걸어도 실제 기기에서는 브라우저가 임의로 멈출 수 있다. 멈춰 있으면
      // 다시 튼다 — 끝난 영상에 play()를 부르면 처음부터 다시 재생된다.
      watch = window.setInterval(() => {
        if (!v.paused || !v.isConnected) return;
        // 다시 시도해서 또 거부되면 일시적인 것이 아니다 — 그 사실을 알린다.
        v.play().catch(() => 막힘());
      }, WATCH_MS);
    }, delayMs);

    return stop;
  }, [playing, delayMs, genre.id, onBlocked]);

  return (
    <button
      type="button"
      tabIndex={previewOnly ? -1 : 0}
      data-genre={genre.id}
      className={`tile${solo ? ' is-solo' : ''}`}
      aria-label={`${genre.name} 더빙 시작`}
      style={
        {
          '--c': genre.color,
          '--c-glow': withAlpha(genre.color, 0.45),
          // 색 덮기를 얹는 요소 없이 inset 그림자로 그리려면 미리 계산한 rgba가 필요하다.
          '--c-wash': withAlpha(genre.color, 0.12),
        } as React.CSSProperties
      }
      onClick={event => onSelect(genre, event.currentTarget)}
    >
      <span className="tile-media" aria-hidden="true">
        <span className="tile-visual">
          <img className="thumb" src={thumbUrl(genre.id)} srcSet={`${thumbUrl(genre.id)} 320w, ${stillUrl(genre.id)} 1280w`} sizes="(min-width: 1000px) 33vw, 50vw" alt="" />
          <video className="preview" ref={videoRef} muted playsInline preload="none" />
        </span>
        {SUPPORTS_HOVER && <span className="tile-number">{String(sceneNumber).padStart(2, '0')}</span>}
        {SUPPORTS_HOVER && <span className="tile-preview-label"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z" /></svg> 미리보기 재생 중</span>}
      </span>
      <span className="tile-body">
        <span className="tile-copy">
          <span className="gname">{genre.name}<span className="tile-length">10초</span></span>
          <span className="gsub">{genre.summary}</span>
        </span>
        <span className="tile-enter" aria-hidden="true">더빙하기 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span>
      </span>
    </button>
  );
}

// 아이콘은 이 저장소가 직접 벤더링한 고정 문자열(genres.ts)이라 외부 입력이 아니다.
export function iconSvg(genre: Genre): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${genre.icon}</svg>`;
}
