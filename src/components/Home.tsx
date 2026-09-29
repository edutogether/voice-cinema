import { useCallback, useEffect, useRef, useState } from 'react';
import { GENRES, type Genre } from '../genres';
import { SUPPORTS_HOVER } from '../lib/pointer';
import { GenreTile } from './GenreTile';
import { CinemaHeader } from './CinemaHeader';

interface Props {
  active: boolean;
  enginePercent: number;
  engineLoading: boolean;
  engineFailed: boolean;
  onSelect: (genre: Genre) => void;
}

// 여섯 장이 한꺼번에 내려받기를 시작하면 행사장 와이파이에서 첫 화면이 한참 멈춘다
// (클립 6개 합쳐 약 37MB). 카드마다 이만큼씩 늦춰 시작해 요청이 줄을 서게 한다.
const STAGGER_MS = 250;

// 한 장씩 돌려 재생할 때 다음 카드로 넘어가는 간격. 클립이 10초라 한 바퀴(6장)에
// 21초가 걸린다 — 더 빠르면 산만하고, 더 느리면 멈춰 있는 것처럼 보인다.
const ROTATE_MS = 3500;

// 같은 카드가 이만큼 거부되면 일시적인 것이 아니라고 본다. 카드가 2초마다 다시
// 시도하므로 대략 4~6초 안에 판별된다.
const BLOCK_STREAK = 3;

/**
 * 이 환경이 영상 여러 장을 동시에 재생할 수 있는지 판별한다.
 *
 * 카카오톡 같은 인앱 브라우저(안드로이드 WebView·iOS WKWebView 계열)는 동시 디코딩을
 * 하나로 제한하는 경우가 있다 — 여섯 장에 play()를 걸어도 하나만 살아남고 나머지는
 * 조용히 거부된다. 그러면 "왜 호러만 재생되지"로 보인다(2026-09-09 대표가 카카오톡
 * 브라우저에서 발견). 그런 환경에서는 한 장씩 돌려 재생한다.
 *
 * 판별에 **play()가 거듭 거부된 사실**을 쓴다. 처음에는 일정 시간 뒤 재생 중인 장수를
 * 세는 방식으로 만들었는데, 회선이 느려 아직 못 시작한 것과 환경이 막은 것을 구별하지
 * 못해 멀쩡한 브라우저를 순환 모드로 떨어뜨렸다(로컬 테스트에서 실제로 재현).
 * 한 번의 거부로 판단하는 것도 안 된다 — 기기가 잠깐 바쁘면 한 번쯤 거부될 수 있고,
 * 그때마다 순환 모드로 굳으면 그게 더 나쁘다(테스트가 간헐적으로 흔들려 드러났다).
 * 카드가 2초마다 다시 시도하므로, **같은 카드가 세 번 거부되면** 일시적인 것이 아니다.
 *
 * 브라우저 이름으로 판별하지 않는다 — user agent 문자열은 위장되기도 하고 새 인앱
 * 브라우저가 나올 때마다 목록을 늘려야 한다.
 */
function usePlaybackMode(enabled: boolean) {
  const [solo, setSolo] = useState(false);
  const [index, setIndex] = useState(0);
  const blocked = useRef(new Map<string, number>());

  // 두 장 이상이 "거듭 거부" 상태가 되면 우연이 아니라 환경의 제약으로 본다.
  const onBlocked = useCallback((id: string) => {
    const count = (blocked.current.get(id) ?? 0) + 1;
    blocked.current.set(id, count);
    const 확실히막힘 = [...blocked.current.values()].filter((n) => n >= BLOCK_STREAK).length;
    if (확실히막힘 >= 2) setSolo(true);
  }, []);

  useEffect(() => {
    if (!enabled || !solo) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % GENRES.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [enabled, solo]);

  return { solo, index, onBlocked };
}

export function Home({ active, enginePercent, engineLoading, engineFailed, onSelect }: Props) {
  // 마우스가 있는 기기에서는 호버가 재생을 정하므로 이 경로를 켜지 않는다.
  // 홈이 보이지 않을 때도 끈다 — 스튜디오에 들어간 뒤 뒤에서 계속 돌 이유가 없다.
  const 자동재생 = !SUPPORTS_HOVER && active;
  const { solo, index: soloIndex, onBlocked } = usePlaybackMode(자동재생);

  return (
    <section id="home" className={`view${active ? ' active' : ''}`}>
      <CinemaHeader step={1} />

      <div className="brand mobile-home">
        <h1>
          InKY <span className="gold">Voice Cinema</span>
        </h1>
        <p className="tagline-top">상상을 현실로 — 내 목소리로 완성하는 영화</p>
      </div>

      <div className="cinema-intro desktop-home">
        <div className="cinema-intro-copy">
          <h1>내 목소리로 <span>완성하는 영화</span></h1>
          <p className="cinema-description">어떤 영화의 주인공이 될까요? 마음에 드는 장면을 골라주세요.</p>
        </div>
        <div className="cinema-preview-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4" /><path d="m10 8 6 4-6 4z" /></svg>
          <p>마우스를 올리면 미리보기<span>장면을 누르면 더빙이 시작돼요</span></p>
        </div>
      </div>

      {/* 준비 상태가 장면 선택을 가로막지 않게 같은 배너에서 진행률만 갱신한다. */}
      <div
        id="enginebar"
        role="status"
        className={`enginebar${engineLoading || engineFailed ? ' show' : ''}${engineFailed ? ' err' : ''}`}
      >
        영상 저장 준비 중… <b id="engineProg">{engineFailed ? '저장할 때 다시 시도할게요' : `${enginePercent}%`}</b>
      </div>

      <div className="grid" id="grid" role="group" aria-label="더빙할 장면 선택">
        {GENRES.map((genre, i) => (
          <GenreTile
            key={genre.id}
            genre={genre}
            playing={자동재생 && (!solo || i === soloIndex)}
            delayMs={solo ? 0 : i * STAGGER_MS}
            solo={solo && i === soloIndex}
            // 여기서 `() => onBlocked(genre.id)`처럼 감싸 넘기지 않는다 — 렌더마다 새 함수가
            // 되어, 엔진 내려받기 진행률(0~100%)이 바뀔 때마다 여섯 장이 전부 멈췄다 다시
            // 틀었다. 그 끊김이 "거부"로 세어져 멀쩡한 브라우저가 한 장씩 돌리는 모드로
            // 떨어졌고(E2E가 가끔 1/6으로 실패), 경고가 수십 건씩 찍혔다(2026-09-27).
            onBlocked={onBlocked}
            onSelect={onSelect}
          />
        ))}
      </div>

      <footer className="cinema-footer">
        <p className="desktop-home">제4회 인천어린이청소년영화제 <span>나만의 목소리, 나만의 영화.</span></p>
        <a className="privacylink" href="./privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>
      </footer>
    </section>
  );
}
