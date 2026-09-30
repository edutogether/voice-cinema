import { useEffect, useRef } from 'react';
import { CLIP_SECONDS } from '../config';
import type { Phase } from '../hooks/useDubbing';

function formatTime(seconds: number): string {
  const hundredths = Math.floor(Math.max(0, Math.min(CLIP_SECONDS, seconds)) * 100);
  return `${String(Math.floor(hundredths / 100)).padStart(2, '0')}:${String(hundredths % 100).padStart(2, '0')}`;
}

const total = formatTime(CLIP_SECONDS);

export function ClipClock({ phase, videoRef }: { phase: Phase; videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const waiting = phase === 'idle' || phase === 'ready';
  const initialText = waiting ? total : `${phase === 'recorded' ? total : '00:00'} / ${total}`;

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    text.textContent = initialText;
    if (phase !== 'preview' && phase !== 'recording' && phase !== 'replaying') return;
    let frame = 0;
    // 실제 영상 시계를 읽으므로 버퍼링·탐색 중에도 시간만 앞서가지 않는다.
    // 숫자만 갱신해 녹음 화면 전체를 매 프레임 다시 렌더링하지 않는다.
    const update = () => {
      const value = `${formatTime(videoRef.current?.currentTime ?? 0)} / ${total}`;
      if (text.textContent !== value) text.textContent = value;
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [phase, initialText, videoRef]);

  return <span className="clip-time" aria-hidden="true" ref={textRef}>{initialText}</span>;
}
