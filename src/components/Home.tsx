import { useCallback, useEffect, useRef, useState } from 'react';
import { GENRES, type Genre } from '../genres';
import { SUPPORTS_HOVER } from '../lib/pointer';
import { GenreTile } from './GenreTile';

interface Props {
  active: boolean;
  enginePercent: number;
  engineLoading: boolean;
  engineFailed: boolean;
  onSelect: (genre: Genre) => void;
}

/**
 * 마우스가 없는 기기에서 "지금 보고 있는 카드"를 정한다 — 화면 세로 가운데에 가장
 * 가까운 카드다. 스크롤하면 자연스럽게 따라오고, PC에서 마우스가 옮겨갈 때와 같은
 * 모양이 된다. 활성 카드는 언제나 하나뿐이라 클립도 그 한 장만 내려받는다.
 *
 * 마우스가 있는 기기에서는 -1을 돌려준다 — 거기서는 호버가 이 역할을 하므로
 * 두 경로가 겹치면 안 된다.
 */
function useCenterTile(enabled: boolean, count: number) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [index, setIndex] = useState(-1);

  const register = useCallback(
    (i: number) => (el: HTMLDivElement | null) => {
      refs.current[i] = el;
    },
    []
  );

  useEffect(() => {
    if (!enabled) {
      setIndex(-1);
      return;
    }
    let raf = 0;
    const pick = () => {
      raf = 0;
      const middle = window.innerHeight / 2;
      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < count; i += 1) {
        const el = refs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight) continue; // 화면 밖
        const distance = Math.abs((r.top + r.bottom) / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      setIndex(best);
    };
    // 스크롤마다 계산하면 낭비라 다음 프레임에 한 번만 모아서 한다.
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    // 첫 화면에서 이미 한 장은 활성이어야 한다 — 아무것도 강조되지 않은 채로
    // 시작하면 마우스가 없는 사용자에게는 예전과 똑같은 정지 화면으로 보인다.
    pick();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [enabled, count]);

  return { index, register };
}

export function Home({ active, enginePercent, engineLoading, engineFailed, onSelect }: Props) {
  // 홈이 보이지 않을 때는 활성 카드를 두지 않는다 — 스튜디오에 들어간 뒤에도
  // 뒤에서 영상이 계속 돌면 소리는 없어도 자원을 붙잡는다.
  const { index: activeIndex, register } = useCenterTile(!SUPPORTS_HOVER && active, GENRES.length);

  return (
    <section id="home" className={`view${active ? ' active' : ''}`}>
      <div className="brand">
        <h1>
          InKY <span className="gold">Voice Cinema</span>
        </h1>
        <p className="tagline-top">상상을 현실로 — 내 목소리로 완성하는 영화</p>
      </div>

      {/* 배너는 항상 DOM에 두고 `.show`로만 여닫는다(전환 전과 동일).
          문구도 그대로 — 앞의 "엔진 준비 중…"은 고정이고 굵은 부분만 바뀐다. */}
      <div
        id="enginebar"
        className={`enginebar${engineLoading || engineFailed ? ' show' : ''}${engineFailed ? ' err' : ''}`}
      >
        엔진 준비 중… <b id="engineProg">{engineFailed ? '실패 — 저장 시 다시 시도됩니다' : `${enginePercent}%`}</b>
      </div>

      <div className="grid" id="grid">
        {GENRES.map((genre, i) => (
          <GenreTile
            key={genre.id}
            genre={genre}
            active={i === activeIndex}
            registerRef={register(i)}
            onSelect={onSelect}
          />
        ))}
      </div>

      <a className="privacylink" href="./privacy.html" target="_blank" rel="noopener">
        개인정보처리방침
      </a>
    </section>
  );
}
