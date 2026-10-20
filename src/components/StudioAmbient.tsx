import { useEffect, useRef } from 'react';

/**
 * 세로 휴대폰에서 영상 칸이 16:9보다 길 때, 장면 위아래 남는 칸을 그 장면의 색으로 채운다(10/20 대표님 «영상 칸을 키워 빈 곳을 없애고»).
 * 장면은 자르지 않는다 — 세로 휴대폰은 인물 양옆이 잘리지 않게 전체 구도를 보인다(10/01). 5:7로 덮으면 뮤지컬 사회자처럼
 * 말하는 상대가 반쯤 잘린다.
 * 장면을 가로 16칸으로 줄여 칸을 덮게 그리고 화면 크기로 늘리면 저절로 흐려진다 — CSS filter는 iOS에서 사각 얼룩을 만들어
 * 쓰지 않는다(app.md). 영상이 아직 한 번도 흐르지 않았으면 영상이 보여 주는 대표 그림(poster)을, 그 뒤로는 영상 시각이 바뀔 때마다
 * 지금 장면을 그린다. 다른 화면 배치에서는 CSS가 숨긴다.
 */
const COLUMNS = 16;

export function StudioAmbient({ videoRef, still }: { videoRef: React.RefObject<HTMLVideoElement | null>; still: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const v = videoRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !v || !ctx) return;
    const paint = (source: CanvasImageSource, width: number, height: number) => {
      if (!canvas.clientWidth || !canvas.clientHeight || !width || !height) return;
      canvas.width = COLUMNS;
      canvas.height = Math.max(1, Math.round(COLUMNS * canvas.clientHeight / canvas.clientWidth));
      // 칸을 덮도록 가운데를 잘라 그린다 — 늘려 그리면 세로 줄무늬가 생긴다
      const scale = Math.max(canvas.width / width, canvas.height / height);
      const sw = canvas.width / scale;
      const sh = canvas.height / scale;
      ctx.drawImage(source, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    const poster = new Image();
    const repaint = () => {
      if (v.played.length > 0 && v.readyState >= 2) paint(v, v.videoWidth, v.videoHeight);
      else if (poster.complete) paint(poster, poster.naturalWidth, poster.naturalHeight);
    };
    poster.onload = repaint;
    poster.src = still;
    const events = ['loadeddata', 'seeked', 'timeupdate'] as const;
    events.forEach((e) => v.addEventListener(e, repaint));
    // 녹음실이 화면에 나타나거나 칸 크기가 바뀔 때도 다시 그린다(숨어 있는 동안에는 크기가 0이라 그리지 않는다)
    const resize = new ResizeObserver(repaint);
    resize.observe(canvas);
    return () => {
      poster.onload = null;
      events.forEach((e) => v.removeEventListener(e, repaint));
      resize.disconnect();
    };
  }, [videoRef, still]);
  return <canvas ref={canvasRef} className="studio-ambient" aria-hidden="true" />;
}
