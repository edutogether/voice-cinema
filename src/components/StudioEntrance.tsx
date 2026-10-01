import { useLayoutEffect } from 'react';
import type { SceneEntrance } from '../lib/sceneEntrance';

export function StudioEntrance({ entry }: { entry: SceneEntrance }) {
  useLayoutEffect(() => {
    const frame = document.querySelector<HTMLElement>('.studio-video-frame');
    if (!frame) return;
    const target = frame.getBoundingClientRect();
    const source = entry.rect;
    if (!target.width || !target.height) return;
    // 실제 플레이어 하나를 균일 확대한다. 화면을 교체하거나 두 레이어를 역보정하지 않는다.
    // 시작 위치는 누른 카드의 중심, 비율은 처음부터 최종 영상 비율로 고정한다.
    const scale = Math.min(source.width / target.width, source.height / target.height, 1);
    const dx = source.x + source.width / 2 - target.x - target.width / 2;
    const dy = source.y + source.height / 2 - target.y - target.height / 2;
    frame.classList.add('is-entering');
    const animation = frame.animate([
      { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` },
      { transform: 'translate3d(0,0,0) scale(1)' },
    ], { duration: 360, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both' });
    const finish = () => {
      animation.cancel();
      frame.classList.remove('is-entering');
    };
    animation.finished.then(finish).catch(() => {});
    window.addEventListener('resize', finish, { once: true });
    return () => {
      finish();
      window.removeEventListener('resize', finish);
    };
  }, [entry]);
  return null;
}
