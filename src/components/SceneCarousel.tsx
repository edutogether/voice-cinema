import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GENRES, thumbUrl, type Genre } from '../genres';
import { GenreTile } from './GenreTile';
import { useSceneMotion } from '../hooks/useSceneMotion';
import { fitScale } from '../lib/fit';

// 대기 화면은 한 장면을 충분히 본 뒤 다음 장면을 소개한다. 직접 조작하는 간격과 구분한다.
const AUTO_ADVANCE_MS = 6000;

/** 중앙 작품은 앞으로, 이웃 작품은 뒤로 놓는다. 여덟 장면의 바로가기는 항상 보인다. */
export function SceneCarousel({ active, onSelect }: { active: boolean; onSelect: (genre: Genre, source?: HTMLElement) => void }) {
  const [selected, setSelected] = useState(0);
  const [ready, setReady] = useState(() => !document.getElementById('splash'));
  const [autoPaused, setAutoPaused] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const currentCardHovered = hoveredCard === selected;
  const [keyboardPaused, setKeyboardPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(reduced.matches);
    reduced.addEventListener('change', update);
    const observer = new MutationObserver(() => {
      if (!document.getElementById('splash')) { setReady(true); observer.disconnect(); }
    });
    if (!document.getElementById('splash')) setReady(true);
    else observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); reduced.removeEventListener('change', update); };
  }, []);
  const shells = useSceneMotion(selected, GENRES.length, active);
  useEffect(() => {
    if (!active) setHoveredCard(null);
  }, [active]);
  const choose = (index: number) => {
    setSelected(index);
  };
  const [flowPaused, setFlowPaused] = useState(false);
  const [keyboardChoices, setKeyboardChoices] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (!active || !ready || !visible || autoPaused || currentCardHovered || keyboardPaused || reducedMotion) return;
    const timer = window.setTimeout(() => {
      setSelected(index => (index + 1) % GENRES.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, ready, visible, autoPaused, currentCardHovered, keyboardPaused, reducedMotion, selected]);
  const choiceViewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (keyboardChoices && choiceViewport.current) choiceViewport.current.scrollLeft = 0; }, [keyboardChoices]);
  useLayoutEffect(() => {
    const track = choiceViewport.current?.querySelector<HTMLElement>('.scene-choice-track');
    const set = track?.firstElementChild;
    if (!track || !set) return;
    // 좁은 화면에서도 지나치게 느려지지 않도록 초당 이동 거리를 고정한다.
    // 순환 거리도 실제 첫 묶음 너비와 맞춰 마지막 프레임의 위치 오차를 피한다.
    const measure = () => {
      const width = set.getBoundingClientRect().width / fitScale();
      if (width <= 0) return;
      track.style.setProperty('--flow-distance', `${-width}px`);
      track.style.setProperty('--flow-duration', `${width / 22}s`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(set);
    return () => observer.disconnect();
  }, []);
  const choices = useRef<(HTMLButtonElement | null)[]>([]);
  const pointerStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const move = (step: number, keyboard = false) => {
    const next = (selected + step + GENRES.length) % GENRES.length;
    choose(next);
    if (keyboard) choices.current[next]?.focus({ preventScroll: true });
  };

  return (
    <div className="scene-carousel"
      onPointerDownCapture={event => {
        setKeyboardPaused(false);
        // 휴대폰에는 멈춤 단추가 없다(10/19 대표님) — 손가락으로 한 번 밀거나 누르면 자동 넘김과 아래 그림 띠의 흐름을 멈춘다(10/19 V-h).
        if (event.pointerType === 'touch') { setAutoPaused(true); setFlowPaused(true); }
      }}
      onFocusCapture={event => { if ((event.target as HTMLElement).matches(':focus-visible')) setKeyboardPaused(true); }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardPaused(false); }}
      onKeyDown={event => {
      setKeyboardPaused(true);
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1, true);
    }}>
      <div className="scene-stage" aria-label="장면 미리보기"
        onDragStart={event => event.preventDefault()}
        onPointerDown={event => {
          if ((event.target as HTMLElement).closest('.scene-arrow')) return;
          pointerStart.current = event.clientX; dragged.current = false;
        }}
        onPointerUp={event => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (start === null || Math.abs(event.clientX - start) < 50) return;
          dragged.current = true;
          move(event.clientX < start ? 1 : -1);
        }}
        onPointerCancel={() => { pointerStart.current = null; setHoveredCard(null); }}
        onClickCapture={event => {
          if (!dragged.current) return;
          event.preventDefault(); event.stopPropagation(); dragged.current = false;
        }}>
        {GENRES.map((genre, index) => {
          const offset = ((index - selected + GENRES.length + 2) % GENRES.length) - 2;
          return (
            <div key={genre.id} className={`scene-shell${offset === 0 ? ' is-current' : ''}`}
              data-index={index} data-offset={offset} aria-hidden={offset !== 0 || undefined}
              onPointerEnter={event => { if (event.pointerType === 'mouse' && offset === 0) setHoveredCard(index); }}
              onPointerMove={event => { if (event.pointerType === 'mouse' && offset === 0) setHoveredCard(index); }}
              onPointerLeave={() => setHoveredCard(previous => previous === index ? null : previous)}
              ref={node => { shells.current[index] = node; }}>
              <GenreTile genre={genre} sceneNumber={index + 1} playing={active && ready && visible && offset === 0}
                previewOnly={offset !== 0}
                onSelect={offset === 0 ? onSelect : () => choose(index)} />
            </div>
          );
        })}
        {[-1, 1].map(direction => (
          <button key={direction} type="button" className={`scene-arrow ${direction < 0 ? 'scene-arrow-prev' : 'scene-arrow-next'}`}
            aria-label={direction < 0 ? '이전 장면' : '다음 장면'}
            onClick={() => move(direction)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d={direction < 0 ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
            </svg>
          </button>
        ))}
      </div>
      <div className="scene-navigation">
        {/* 멈춤 단추는 없다(10/20 대표님 «멈춤을 다 뺀다»). 자동 넘김은 가운데 장면에 마우스를 올리거나, 키보드로 다니거나,
            손가락으로 한 번 밀거나 누르면(10/19 V-h) 멈춘다. */}
        <p className="scene-position" aria-live={autoPaused || keyboardPaused ? 'polite' : 'off'}><strong>{String(selected + 1).padStart(2, '0')}</strong><span>/ {String(GENRES.length).padStart(2, '0')}</span><span className="scene-current-name">{GENRES[selected].name}</span></p>
      </div>
      <div className="scene-choice-row">
        <div className="scene-choices" ref={choiceViewport} role="group" aria-label="여덟 장면 바로 고르기"
          data-paused={!active || !visible || flowPaused} data-keyboard={keyboardChoices}
          onKeyDownCapture={() => setKeyboardChoices(true)}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardChoices(false); }}>
          <div className="scene-choice-track">
            {[0, 1, 2].map(copy => (
              <div className="scene-choice-set" key={String(copy)} aria-hidden={copy > 0 || undefined}>
                {GENRES.map((genre, index) => (
                  <button key={genre.id} type="button" className={`scene-choice-card ${copy ? 'scene-choice-copy' : 'scene-choice'}`}
                    data-genre={genre.id} aria-pressed={selected === index} tabIndex={copy ? -1 : undefined}
                    aria-label={`${genre.name} 미리보기 선택`}
                    aria-description="마우스를 올리거나 키보드로 선택하면 큰 장면이 바뀌고, 클릭하거나 엔터를 누르면 녹음실로 들어갑니다."
                    ref={copy ? undefined : node => { choices.current[index] = node; }}
                    onPointerDown={copy ? event => event.preventDefault() : undefined}
                    onPointerEnter={event => { if (event.pointerType === 'mouse') choose(index); }}
                    onPointerMove={event => { if (event.pointerType === 'mouse') choose(index); }}
                    onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setKeyboardChoices(true); choose(index); }}
                    onClick={event => onSelect(genre, event.currentTarget)}>
                    <img src={thumbUrl(genre.id)} alt="" width="320" height="180" />
                    <span><small>{String(index + 1).padStart(2, '0')}</small>{genre.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
