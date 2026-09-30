import { useLayoutEffect, useRef } from 'react';

const wrap = (value: number, count: number) => ((value + count / 2) % count + count) % count - count / 2;

/** 목표를 바꿔도 현재 위치·속도를 이어받는다. 프레임마다 React나 배치 계산을 실행하지 않는다. */
export function useSceneMotion(selected: number, count: number, active: boolean) {
  const shells = useRef<(HTMLDivElement | null)[]>([]);
  const motion = useRef({ position: selected, velocity: 0, target: selected });

  useLayoutEffect(() => {
    const state = motion.current;
    state.target += wrap(selected - state.target, count);
    const stage = shells.current[0]?.parentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previous = performance.now();
    const paint = () => {
      shells.current.forEach((shell, index) => {
        if (!shell) return;
        const offset = wrap(index - state.position, count);
        const depth = Math.abs(offset);
        // 순환 경계(±3)에 닿기 전에 숨겨 반대편으로 돌아가는 카드가 중앙을 횡단하지 않게 한다.
        const opacity = Math.max(0, Math.min(1, (2.8 - depth) / .55));
        shell.style.transform = `translateX(${-50 + offset * 48}%) translateZ(${-depth * 180}px)`;
        shell.style.opacity = String(opacity);
        shell.style.zIndex = String(Math.round((count - depth) * 100));
        shell.style.pointerEvents = opacity < .1 ? 'none' : '';
      });
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      state.position = state.target;
      state.velocity = 0;
      paint();
      stage?.setAttribute('data-moving', 'false');
    };
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, .05);
      previous = now;
      // 임계 감쇠의 해석해: 프레임 간격에 무관하게 과한 튕김 없이 속도를 연속적으로 잇는다.
      const omega = 18;
      const distance = state.position - state.target;
      const momentum = state.velocity + omega * distance;
      const decay = Math.exp(-omega * dt);
      state.position = state.target + (distance + momentum * dt) * decay;
      state.velocity = (state.velocity - omega * momentum * dt) * decay;
      if (Math.abs(state.position - state.target) < .001 && Math.abs(state.velocity) < .01) {
        settle();
        return;
      }
      paint();
      frame = requestAnimationFrame(tick);
    };
    const stopWhenHidden = () => { if (document.hidden) settle(); };
    const reduceMotion = () => { if (reduced.matches) settle(); };
    if (!active || reduced.matches || document.hidden || state.position === state.target) settle();
    else {
      stage?.setAttribute('data-moving', 'true');
      frame = requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', stopWhenHidden);
    reduced.addEventListener('change', reduceMotion);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', stopWhenHidden);
      reduced.removeEventListener('change', reduceMotion);
    };
  }, [selected, count, active]);

  return shells;
}
