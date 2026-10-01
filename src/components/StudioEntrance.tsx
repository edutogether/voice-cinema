import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SceneEntrance } from '../lib/sceneEntrance';

export function StudioEntrance({ entry }: { entry: SceneEntrance }) {
  const [finished, setFinished] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  const pixelsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const pixels = pixelsRef.current;
    const frame = document.querySelector<HTMLElement>('.studio-video-frame');
    if (!layer || !pixels || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const height = window.matchMedia('(orientation:portrait)').matches ? Math.min(bounds.height, bounds.width * 9 / 16) : bounds.height;
    const target = { x: bounds.x, y: bounds.y + (bounds.height - height) / 2, width: bounds.width, height };
    const source = entry.rect;
    if (!target.width || !target.height) { setFinished(true); return; }
    pixels.replaceChildren(entry.frame);
    layer.hidden = false;
    Object.assign(layer.style, { left: `${target.x}px`, top: `${target.y}px`, width: `${target.width}px`, height: `${target.height}px` });
    const imageWidth = Math.max(target.width, target.height * entry.frame.width / entry.frame.height);
    const imageHeight = imageWidth * entry.frame.height / entry.frame.width;
    Object.assign(pixels.style, { left: `${(target.width - imageWidth) / 2}px`, top: `${(target.height - imageHeight) / 2}px`, width: `${imageWidth}px`, height: `${imageHeight}px` });
    const sx = source.width / target.width;
    const sy = source.height / target.height;
    const dx = source.x + source.width / 2 - target.x - target.width / 2;
    const dy = source.y + source.height / 2 - target.y - target.height / 2;
    const outer: Keyframe[] = [];
    const inner: Keyframe[] = [];
    // 합성 레이어의 transform만 움직이고 역배율로 인물의 가로세로 비율을 유지한다.
    // 보간 표는 시작 때 한 번 계산하며 프레임마다 JS·레이아웃·clip-path를 갱신하지 않는다.
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const p = 1 - Math.pow(1 - t, 3);
      const x = sx + (1 - sx) * p;
      const y = sy + (1 - sy) * p;
      const uniform = Math.max(x, y);
      outer.push({ offset: t, transform: `translate3d(${dx * (1 - p)}px,${dy * (1 - p)}px,0) scale(${x},${y})` });
      inner.push({ offset: t, transform: `scale(${uniform / x},${uniform / y})` });
    }
    frame.style.opacity = '0';
    const options: KeyframeAnimationOptions = { duration: 420, easing: 'linear', fill: 'both' };
    const animation = layer.animate(outer, options);
    const imageAnimation = pixels.animate(inner, options);
    const chrome = [...document.querySelectorAll<HTMLElement>('.studio-heading,.studio-player-dock')].map(el =>
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 100, fill: 'backwards' }));
    let disposed = false;
    let dissolve: Animation | undefined;
    const reveal = () => { frame.style.opacity = ''; layer.hidden = true; };
    const finish = () => { if (!disposed) { reveal(); setFinished(true); } };
    void animation.finished.then(async () => {
      if (disposed) return;
      frame.style.opacity = '';
      // 크기가 완전히 맞은 뒤 투명도만 바꿔 실제 영상으로 이어진다.
      dissolve = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'both' });
      await dissolve.finished;
      finish();
    }).catch(() => {});
    window.addEventListener('resize', finish, { once: true });
    return () => {
      disposed = true;
      reveal();
      animation.cancel();
      imageAnimation.cancel();
      dissolve?.cancel();
      chrome.forEach(a => a.cancel());
      window.removeEventListener('resize', finish);
    };
  }, [entry]);
  if (finished) return null;
  return createPortal(<div className="studio-entrance" ref={layerRef} aria-hidden="true"><div className="studio-entrance-pixels" ref={pixelsRef} /></div>, document.body);
}
