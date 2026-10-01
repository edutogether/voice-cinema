export interface SceneEntrance {
  image: string;
  time: number | null;
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
  let url = image?.currentSrc ?? '';
  if (video && video.readyState >= 2) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      try {
        context.drawImage(video, 0, 0);
        url = canvas.toDataURL('image/jpeg', .92);
      } catch { /* 이미지가 다른 출처라 캡처할 수 없으면 이미 표시된 포스터를 사용한다. */ }
    }
  }
  return url ? { image: url, time: video && video.readyState >= 2 ? video.currentTime : null, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } : null;
}
