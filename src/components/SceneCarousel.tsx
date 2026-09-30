import { useRef, useState, type CSSProperties } from 'react';
import { GENRES, thumbUrl, type Genre } from '../genres';
import { GenreTile } from './GenreTile';

const ignoreBlocked = () => {};

/** 중앙 작품은 앞으로, 이웃 작품은 뒤로 놓는다. 여섯 장면의 바로가기는 항상 보인다. */
export function SceneCarousel({ active, onSelect }: { active: boolean; onSelect: (genre: Genre) => void }) {
  const [selected, setSelected] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const hoverPoint = useRef<{ x: number; y: number } | null>(null);
  const choose = (index: number) => {
    setSelected(index);
    setPreviewing(true);
  };
  const choices = useRef<(HTMLButtonElement | null)[]>([]);
  const pointerStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const move = (step: number, keyboard = false) => {
    const next = (selected + step + GENRES.length) % GENRES.length;
    choose(next);
    if (keyboard) choices.current[next]?.focus();
  };

  return (
    <div className="scene-carousel" onMouseLeave={() => { setPreviewing(false); hoverPoint.current = null; }} onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1, true);
    }}>
      <div className="scene-stage" aria-label="장면 미리보기"
        onPointerMove={event => {
          if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
          const point = hoverPoint.current;
          // 카드가 이동하며 생기는 경계 이벤트·손떨림으로 연속 전환하지 않는다.
          if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) < 8) return;
          const shell = (event.target as HTMLElement).closest<HTMLElement>('.scene-shell');
          if (!shell) return;
          hoverPoint.current = { x: event.clientX, y: event.clientY };
          choose(Number(shell.dataset.index));
        }} onDragStart={event => event.preventDefault()}
        onPointerDown={event => { pointerStart.current = event.clientX; dragged.current = false; }}
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
          const depth = Math.abs(offset);
          return (
            <div key={genre.id} className={`scene-shell${offset === 0 ? ' is-current' : ''}`}
              data-index={index} data-offset={offset} aria-hidden={offset !== 0 || undefined}
              style={{ '--offset': offset, '--depth': depth, zIndex: GENRES.length - depth } as CSSProperties}>
              <GenreTile genre={genre} sceneNumber={index + 1} playing={active && previewing && offset === 0} delayMs={0} solo={false}
                previewOnly={offset !== 0} onBlocked={ignoreBlocked}
                onSelect={offset === 0 ? onSelect : () => choose(index)} />
            </div>
          );
        })}
      </div>
      <div className="scene-navigation">
        <button type="button" className="scene-arrow" aria-label="이전 장면" onClick={() => move(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m14 6-6 6 6 6" /></svg></button>
        <p className="scene-position" aria-live="polite"><strong>{String(selected + 1).padStart(2, '0')}</strong><span>/ 06</span><span className="scene-current-name">{GENRES[selected].name}</span></p>
        <button type="button" className="scene-arrow" aria-label="다음 장면" onClick={() => move(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m10 6 6 6-6 6" /></svg></button>
      </div>
      <div className="scene-choices" role="group" aria-label="여섯 장면 바로 고르기">
        {GENRES.map((genre, index) => (
          <button key={genre.id} type="button" className="scene-choice" aria-pressed={selected === index}
            aria-label={`${genre.name} 미리보기 선택`}
            aria-description="마우스를 올리거나 키보드로 선택하면 큰 장면이 바뀌고, 클릭하거나 엔터를 누르면 녹음실로 들어갑니다."
            ref={node => { choices.current[index] = node; }}
            onPointerEnter={event => { if (event.pointerType === 'mouse') choose(index); }}
            onFocus={() => choose(index)} onClick={() => onSelect(genre)}>
            <img src={thumbUrl(genre.id)} alt="" width="320" height="180" />
            <span><small>{String(index + 1).padStart(2, '0')}</small>{genre.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
