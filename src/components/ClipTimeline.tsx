import { useEffect, useRef } from 'react';
import { CLIP_SECONDS } from '../config';
import type { Phase } from '../hooks/useDubbing';

function formatTime(seconds: number): string {
  const hundredths = Math.floor(Math.max(0, Math.min(CLIP_SECONDS, seconds)) * 100);
  return `${String(Math.floor(hundredths / 100)).padStart(2, '0')}:${String(hundredths % 100).padStart(2, '0')}`;
}

const total = formatTime(CLIP_SECONDS);

export function ClipTimeline({ phase, videoRef }: { phase: Phase; videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const waiting = phase === 'idle' || phase === 'ready';
  const moving = phase === 'preview' || phase === 'recording' || phase === 'replaying';
  const initialText = waiting ? total : `${phase === 'recorded' ? total : '00:00'} / ${total}`;

  useEffect(() => {
    const text = textRef.current;
    const bar = barRef.current;
    const track = trackRef.current;
    if (!text || !bar || !track) return;
    text.textContent = initialText;
    const setProgress = (fraction: number) => {
      const transform = `scaleX(${fraction})`;
      if (bar.style.transform !== transform) bar.style.transform = transform;
      const percent = String(Math.round(fraction * 100));
      if (track.getAttribute('aria-valuenow') !== percent) track.setAttribute('aria-valuenow', percent);
    };
    setProgress(phase === 'recorded' ? 1 : 0);
    if (!moving) return;
    let frame = 0;
    // 실제 영상 시계를 읽으므로 버퍼링·탐색 중에도 시간만 앞서가지 않는다.
    // 막대와 숫자를 같은 프레임에 갱신한다. width 대신 transform을 써 배치 변경을 피한다.
    const update = () => {
      const video = videoRef.current;
      const currentTime = video?.currentTime ?? 0;
      const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : CLIP_SECONDS;
      setProgress(Math.max(0, Math.min(1, currentTime / duration)));
      const value = `${formatTime(currentTime)} / ${total}`;
      if (text.textContent !== value) text.textContent = value;
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [phase, moving, initialText, videoRef]);

  return <>
    <div className={`progress${moving || phase === 'recorded' ? ' show' : ''}`} id="progress" ref={trackRef} role="progressbar" aria-label="영상 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase === 'recorded' ? 100 : 0}><i id="bar" ref={barRef} /></div>
    <span className="clip-time" aria-hidden="true" ref={textRef}>{initialText}</span>
  </>;
}
