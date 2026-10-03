import { useLayoutEffect, useRef } from 'react';

const wrap = (value: number, count: number) => ((value + count / 2) % count + count) % count - count / 2;
// 큰 화면에서 급하게 튀어나오는 인상을 줄이고, 끝은 천천히 감속한다. 반동은 없다.
const OMEGA = 14;
const DURATION = 900;
const SAMPLES = 24;
const spring = (position: number, velocity: number, target: number, seconds: number) => {
  const distance = position - target;
  const momentum = velocity + OMEGA * distance;
  const decay = Math.exp(-OMEGA * seconds);
  return {
    position: target + (distance + momentum * seconds) * decay,
    velocity: (velocity - OMEGA * momentum * seconds) * decay,
  };
};

function appearance(index: number, position: number, count: number) {
  const offset = wrap(index - position, count);
  const distance = Math.abs(offset);
  // abs의 중앙 꺾임을 없애 확대→축소의 방향도 연속적으로 바뀌게 한다.
  const depth = (Math.sqrt(offset * offset + .16) - .4) / (Math.sqrt(1.16) - .4);
  return {
    offset,
    transform: `translate3d(${-50 + offset * 48 / (1 + depth / 11)}%, 0, 0) scale(${1 / (1 + depth / 11)})`,
    opacity: Math.max(0, Math.min(1, (2.8 - distance) / .55)),
    layer: count - Math.round(distance),
  };
}

/** 경로는 선택할 때 한 번 계산하고, 실제 프레임 보간은 브라우저의 합성기에 맡긴다. */
export function useSceneMotion(selected: number, count: number, active: boolean) {
  const shells = useRef<(HTMLDivElement | null)[]>([]);
  const motion = useRef({ position: selected, velocity: 0, target: selected });

  useLayoutEffect(() => {
    const state = motion.current;
    state.target += wrap(selected - state.target, count);
    const start = { ...state };
    const stage = shells.current[0]?.parentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations: Animation[] = [];
    const timers: number[] = [];
    let settled = false;
    let disposed = false;
    const paint = (position: number) => {
      shells.current.forEach((shell, index) => {
        if (!shell) return;
        const value = appearance(index, position, count);
        shell.style.transform = value.transform;
        shell.style.opacity = String(value.opacity);
        shell.style.zIndex = String(value.layer);
        shell.style.pointerEvents = value.opacity < .1 ? 'none' : '';
      });
    };
    const clear = () => {
      animations.forEach(animation => animation.cancel());
      timers.forEach(timer => window.clearTimeout(timer));
    };
    const settle = () => {
      settled = true;
      state.position = state.target;
      state.velocity = 0;
      paint(state.position);
      clear();
      stage?.setAttribute('data-moving', 'false');
    };
    const stopWhenHidden = () => { if (document.hidden) settle(); };
    const reduceMotion = () => { if (reduced.matches) settle(); };

    if (!active || reduced.matches || document.hidden || Math.abs(state.position - state.target) < .0001) settle();
    else {
      stage?.setAttribute('data-moving', 'true');
      const positions = Array.from({ length: SAMPLES + 1 }, (_, sample) =>
        sample === SAMPLES ? state.target : spring(start.position, start.velocity, start.target, sample * DURATION / SAMPLES / 1000).position);
      const easings = positions.map((position, sample) => {
        const delta = positions[sample + 1] - position;
        if (!Number.isFinite(delta) || Math.abs(delta) < .000001) return 'linear';
        const dt = DURATION / SAMPLES / 1000;
        const from = spring(start.position, start.velocity, start.target, sample * dt).velocity;
        const to = sample + 1 === SAMPLES ? 0 : spring(start.position, start.velocity, start.target, (sample + 1) * dt).velocity;
        // 구간 경계의 속도까지 맞춰 드문 키프레임 사이에서도 꺾이지 않게 보간한다.
        return `cubic-bezier(.333333,${from * dt / (3 * delta)},.666667,${1 - to * dt / (3 * delta)})`;
      });
      const frames = positions.map(position => shells.current.map((_, index) => appearance(index, position, count)));
      for (let sample = 1; sample < frames.length; sample++) {
        frames[sample].forEach((value, index) => {
          const before = frames[sample - 1][index];
          if (Math.abs(value.offset - before.offset) > count / 2) {
            // 빠른 입력으로 순환 경계를 한 구간에 건너도 화면을 가로지르는 보간은 숨긴다.
            before.opacity = 0;
            value.opacity = 0;
          }
        });
      }
      // 같은 시점의 겹침 변경을 한 작업으로 묶어 스타일 계산이 분산되지 않게 한다.
      let previousOrder = '';
      frames.forEach((values, sample) => {
        const order = values.map(value => `${value.layer}:${value.opacity < .1}`).join(',');
        if (order === previousOrder) return;
        previousOrder = order;
        const updateLayers = () => shells.current.forEach((shell, index) => {
          if (!shell) return;
          shell.style.zIndex = String(values[index].layer);
          shell.style.pointerEvents = values[index].opacity < .1 ? 'none' : '';
        });
        if (sample === 0) updateLayers();
        else timers.push(window.setTimeout(updateLayers, sample * DURATION / SAMPLES));
      });
      shells.current.forEach((shell, index) => {
        if (!shell) return;
        const values = frames.map(frame => frame[index]);
        const animation = shell.animate(values.map((value, sample) => ({
          offset: sample / SAMPLES, transform: value.transform, opacity: value.opacity, easing: easings[sample],
        })), { duration: DURATION, easing: 'linear', fill: 'both' });
        animations.push(animation);
      });
      Promise.all(animations.map(animation => animation.finished)).then(() => { if (!disposed) settle(); }).catch(() => {});
    }
    document.addEventListener('visibilitychange', stopWhenHidden);
    reduced.addEventListener('change', reduceMotion);
    return () => {
      disposed = true;
      if (!settled) {
        // 합성기의 실제 진행 시각을 사용해 중단 직전 위치와 속도에서 다시 시작한다.
        const elapsed = Number(animations[0]?.currentTime ?? 0) / 1000;
        Object.assign(state, spring(start.position, start.velocity, start.target, elapsed));
        paint(state.position);
      }
      clear();
      document.removeEventListener('visibilitychange', stopWhenHidden);
      reduced.removeEventListener('change', reduceMotion);
    };
  }, [selected, count, active]);

  return shells;
}
