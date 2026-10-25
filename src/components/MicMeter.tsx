import { useEffect, useRef } from 'react';

// 녹음 중 마이크가 아이 목소리를 받고 있다는 반응 — 막대 일곱 개가 음량에 따라 오르내린다(10/25 대표님 «마이크가 목소리를 받고 있다는 시각적 반응»).
// 남은 시간을 세지 않는다(녹음 시간을 채우라고 압박하지 않게). 프레임마다 음량을 읽어 CSS 값(--level)만 바꾼다 — React 렌더 없이.
const FLOOR_DB = -55; // 이보다 작으면 막대가 바닥(조용한 방)
const RANGE_DB = 40; // −15dBFS(크게 외침)에서 막대가 꽉 찬다

export function MicMeter({ level }: { level: () => number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let shown = 0;
    let frame = 0;
    const tick = () => {
      const rms = level();
      const target = rms > 0 ? Math.max(0, Math.min(1, (20 * Math.log10(rms) - FLOOR_DB) / RANGE_DB)) : 0;
      // 올라갈 때는 바로, 내려갈 때는 천천히 — 음절 사이에서 막대가 깜빡이지 않게
      shown = target > shown ? target : shown * 0.88 + target * 0.12;
      el.style.setProperty('--level', shown.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [level]);
  return <div className="mic-meter" data-testid="mic-meter" ref={ref} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>;
}
