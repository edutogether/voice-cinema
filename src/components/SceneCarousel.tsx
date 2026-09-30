import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GENRES, thumbUrl, type Genre } from '../genres';
import { GenreTile } from './GenreTile';
import { useSceneMotion } from '../hooks/useSceneMotion';

const ignoreBlocked = () => {};
// 900ms 감속이 끝난 뒤 200ms 여유를 둔다. Apple의 지정 수치가 아닌 이 화면의 탐색 간격이다.
const ARROW_REPEAT_MS = 1100;

/** 중앙 작품은 앞으로, 이웃 작품은 뒤로 놓는다. 여섯 장면의 바로가기는 항상 보인다. */
export function SceneCarousel({ active, onSelect }: { active: boolean; onSelect: (genre: Genre) => void }) {
  const [selected, setSelected] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const shells = useSceneMotion(selected, GENRES.length, active);
  const hoverArrow = useRef<number | null>(null);
  const arrowTimer = useRef<number | null>(null);
  const stopArrow = useCallback(() => {
    if (arrowTimer.current !== null) window.clearInterval(arrowTimer.current);
    arrowTimer.current = null;
    hoverArrow.current = null;
  }, []);
  useEffect(() => {
    if (!active) stopArrow();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => { if (document.hidden || reduced.matches) stopArrow(); };
    document.addEventListener('visibilitychange', cancel);
    reduced.addEventListener('change', cancel);
    return () => {
      stopArrow();
      document.removeEventListener('visibilitychange', cancel);
      reduced.removeEventListener('change', cancel);
    };
  }, [active, stopArrow]);
  const choose = (index: number) => {
    setSelected(index);
    setPreviewing(true);
  };
  const [flowPaused, setFlowPaused] = useState(false);
  const [keyboardChoices, setKeyboardChoices] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const choiceViewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (keyboardChoices && choiceViewport.current) choiceViewport.current.scrollLeft = 0; }, [keyboardChoices]);
  useLayoutEffect(() => {
    const track = choiceViewport.current?.querySelector<HTMLElement>('.scene-choice-track');
    const set = track?.firstElementChild;
    if (!track || !set) return;
    // 좁은 화면에서도 지나치게 느려지지 않도록 초당 이동 거리를 고정한다.
    // 순환 거리도 실제 첫 묶음 너비와 맞춰 마지막 프레임의 위치 오차를 피한다.
    const measure = () => {
      const width = set.getBoundingClientRect().width;
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
    <div className="scene-carousel" onMouseLeave={() => { setPreviewing(false); stopArrow(); }} onKeyDown={event => {
      stopArrow();
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1, true);
    }}>
      <div className="scene-stage" aria-label="장면 미리보기"
        onPointerMove={event => {
          if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
          // 영상 위에서는 현재 장면만 재생한다. 방향 선택은 고정된 화살표 영역이 맡는다.
          if ((event.target as HTMLElement).closest('.scene-shell.is-current')) setPreviewing(true);
        }} onDragStart={event => event.preventDefault()}
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
        onPointerCancel={() => { pointerStart.current = null; }}
        onClickCapture={event => {
          if (!dragged.current) return;
          event.preventDefault(); event.stopPropagation(); dragged.current = false;
        }}>
        {GENRES.map((genre, index) => {
          const offset = ((index - selected + GENRES.length + 2) % GENRES.length) - 2;
          return (
            <div key={genre.id} className={`scene-shell${offset === 0 ? ' is-current' : ''}`}
              data-index={index} data-offset={offset} aria-hidden={offset !== 0 || undefined}
              ref={node => { shells.current[index] = node; }}>
              <GenreTile genre={genre} sceneNumber={index + 1} playing={active && previewing && offset === 0} delayMs={0} solo={false}
                previewOnly={offset !== 0} onBlocked={ignoreBlocked}
                onSelect={offset === 0 ? onSelect : () => choose(index)} />
            </div>
          );
        })}
        {[-1, 1].map(direction => (
          <button key={direction} type="button" className={`scene-arrow ${direction < 0 ? 'scene-arrow-prev' : 'scene-arrow-next'}`}
            aria-label={direction < 0 ? '이전 장면' : '다음 장면'}
            onPointerEnter={event => {
              if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
              stopArrow();
              hoverArrow.current = direction;
              move(direction);
              if (!active || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
              arrowTimer.current = window.setInterval(() => {
                setSelected(index => (index + direction + GENRES.length) % GENRES.length);
                setPreviewing(true);
              }, ARROW_REPEAT_MS);
            }}
            onPointerLeave={stopArrow}
            onPointerCancel={stopArrow}
            onClick={event => {
              // 마우스 진입으로 이미 한 칸 이동했으면 클릭으로 두 번 넘기지 않는다.
              if (event.detail === 0 || hoverArrow.current !== direction) move(direction);
            }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d={direction < 0 ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
            </svg>
          </button>
        ))}
      </div>
      <div className="scene-navigation">
        <p className="scene-position" aria-live="polite"><strong>{String(selected + 1).padStart(2, '0')}</strong><span>/ 06</span><span className="scene-current-name">{GENRES[selected].name}</span></p>
      </div>
      <div className="scene-choice-row">
        <div className="scene-choices" ref={choiceViewport} role="group" aria-label="여섯 장면 바로 고르기"
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
                    onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setKeyboardChoices(true); choose(index); }}
                    onClick={() => onSelect(genre)}>
                    <img src={thumbUrl(genre.id)} alt="" width="320" height="180" />
                    <span><small>{String(index + 1).padStart(2, '0')}</small>{genre.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="scene-flow-toggle" aria-label={flowPaused ? '장면 흐름 재생' : '장면 흐름 일시정지'}
          aria-pressed={flowPaused} onClick={() => setFlowPaused(value => !value)}>
          {flowPaused ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6z" /></svg>
            : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM12 4h3v12h-3z" /></svg>}
        </button>
      </div>
    </div>
  );
}
