import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SceneEntrance } from '../lib/sceneEntrance';

export function StudioEntrance({ entry }: { entry: SceneEntrance }) {
  const layerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const frame = document.querySelector<HTMLElement>('.studio-video-frame');
    if (!layer || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const height = window.matchMedia('(orientation:portrait)').matches ? Math.min(bounds.height, bounds.width * 9 / 16) : bounds.height;
    const target = { x: bounds.x, y: bounds.y + (bounds.height - height) / 2, width: bounds.width, height };
    const source = entry.rect;
    if (!target.width || !target.height) return;
    // 16:9 원본 전체를 한 레이어에 놓고 창의 크기만 바꿔 인물이 늘어나지 않게 한다.
    const imageWidth = Math.max(target.width, target.height * 16 / 9);
    const imageHeight = imageWidth * 9 / 16;
    Object.assign(layer.style, { left: `${target.x + (target.width - imageWidth) / 2}px`, top: `${target.y + (target.height - imageHeight) / 2}px`, width: `${imageWidth}px`, height: `${imageHeight}px` });
    const scale = Math.max(source.width / imageWidth, source.height / imageHeight);
    const dx = source.x + source.width / 2 - target.x - target.width / 2;
    const dy = source.y + source.height / 2 - target.y - target.height / 2;
    const insetX = Math.max(0, (imageWidth - source.width / scale) / 2);
    const insetY = Math.max(0, (imageHeight - source.height / scale) / 2);
    const endX = (imageWidth - target.width) / 2;
    const endY = (imageHeight - target.height) / 2;
    // 한 장의 정지 프레임만 확대한다. 비디오·문구 전체를 늘리거나 매 프레임 배치하지 않는다.
    frame.style.visibility = 'hidden';
    const animation = layer.animate([
      { transform: `translate(${dx}px,${dy}px) scale(${scale})`, clipPath: `inset(${insetY}px ${insetX}px round ${16 / scale}px)` },
      { transform: 'translate(0,0) scale(1)', clipPath: `inset(${endY}px ${endX}px round 0px)` },
    ], { duration: 480, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    const chrome = [...document.querySelectorAll<HTMLElement>('.studio-heading,.studio-player-dock')].map(el =>
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 100, fill: 'backwards' }));
    const reveal = () => { frame.style.visibility = ''; layer.hidden = true; };
    animation.finished.then(reveal).catch(() => {});
    window.addEventListener('resize', reveal, { once: true });
    return () => {
      reveal();
      animation.cancel();
      chrome.forEach(a => a.cancel());
      window.removeEventListener('resize', reveal);
    };
  }, [entry]);
  return createPortal(<div className="studio-entrance" ref={layerRef} aria-hidden="true"><img src={entry.image} alt="" /></div>, document.body);
}
