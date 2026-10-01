export interface SceneEntrance {
  frame: HTMLCanvasElement;
  rect: { x: number; y: number; width: number; height: number };
}

export function captureSceneEntrance(source?: HTMLElement): SceneEntrance | null {
  if (!source || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const media = source.querySelector<HTMLElement>('.tile-media') ?? source.querySelector('img');
  if (!media) return null;
  const rect = media.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const video = media.querySelector('video');
  const image = media instanceof HTMLImageElement ? media : media.querySelector('img');
  const pixels = video && video.readyState >= 2 ? video : image;
  if (!pixels) return null;
  const width = pixels instanceof HTMLVideoElement ? pixels.videoWidth : pixels.naturalWidth;
  const height = pixels instanceof HTMLVideoElement ? pixels.videoHeight : pixels.naturalHeight;
  if (!width || !height) return null;
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = height;
  const context = frame.getContext('2d');
  if (!context) return null;
  // 이미 디코드된 픽셀만 복사한다. 클릭 경로에서 JPEG 인코딩·재디코딩을 하지 않는다.
  context.drawImage(pixels, 0, 0);
  return { frame, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
}
