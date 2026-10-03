export interface SceneEntrance {
  rect: { x: number; y: number; width: number; height: number };
}

export function captureSceneEntrance(source?: HTMLElement): SceneEntrance | null {
  if (!source || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const media = source.querySelector<HTMLElement>('.tile-media') ?? source.querySelector('img');
  if (!media) return null;
  const rect = media.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  // 클릭한 위치만 전달한다. 화면 복사·이미지 변환·별도 전환 레이어는 만들지 않는다.
  return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
}
