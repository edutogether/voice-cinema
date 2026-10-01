import { useEffect, useRef, useState } from 'react';
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
  const pointerRef = useRef<number | null>(null);
  const seekFrameRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const canSeek = phase === 'preview';
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
      track.style.setProperty('--position', `${fraction * 100}%`);
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
      track.setAttribute('aria-valuetext', `${currentTime.toFixed(1)}초 / ${duration.toFixed(1)}초`);
      if (text.textContent !== value) text.textContent = value;
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [phase, moving, initialText, videoRef]);

  useEffect(() => {
    if (!canSeek) {
      pointerRef.current = null;
      setDragging(false);
    }
    return () => cancelAnimationFrame(seekFrameRef.current);
  }, [canSeek]);

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!canSeek || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    // 끝을 잡아끄는 중 ended 처리로 처음으로 돌아가지 않도록 마지막 프레임 안에 둔다.
    video.currentTime = Math.max(0, Math.min(video.duration - .001, time));
  };
  const seekAt = (clientX: number) => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video) return;
    const rect = track.getBoundingClientRect();
    seek((clientX - rect.left) / rect.width * video.duration);
  };
  const resume = () => {
    if (canSeek) void videoRef.current?.play().catch(() => {});
  };
  const finishDrag = () => {
    pointerRef.current = null;
    setDragging(false);
    cancelAnimationFrame(seekFrameRef.current);
    resume();
  };

  return <>
    <div className={`progress${canSeek ? ' is-seekable' : ''}${dragging ? ' is-dragging' : ''}${moving || phase === 'recorded' ? ' show' : ''}`} id="progress" ref={trackRef}
      role={canSeek ? 'slider' : 'progressbar'} aria-label={canSeek ? '미리보기 위치' : '영상 진행'}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase === 'recorded' ? 100 : 0}
      tabIndex={canSeek ? 0 : undefined}
      onPointerDown={event => {
        if (!canSeek || event.button !== 0 || pointerRef.current !== null) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current = event.pointerId;
        setDragging(true);
        videoRef.current?.pause();
        seekAt(event.clientX);
      }}
      onPointerMove={event => {
        if (pointerRef.current !== event.pointerId) return;
        cancelAnimationFrame(seekFrameRef.current);
        const x = event.clientX;
        seekFrameRef.current = requestAnimationFrame(() => seekAt(x));
      }}
      onPointerUp={event => {
        if (pointerRef.current !== event.pointerId) return;
        seekAt(event.clientX);
        finishDrag();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event => { if (pointerRef.current === event.pointerId) finishDrag(); }}
      onLostPointerCapture={event => { if (pointerRef.current === event.pointerId) finishDrag(); }}
      onKeyDown={event => {
        const video = videoRef.current;
        if (!canSeek || !video) return;
        const delta = { ArrowLeft: -.5, ArrowDown: -.5, ArrowRight: .5, ArrowUp: .5 }[event.key];
        if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        seek(event.key === 'Home' ? 0 : event.key === 'End' ? video.duration : video.currentTime + (delta ?? 0));
        resume();
      }}><i id="bar" ref={barRef} /></div>
    <span className="clip-time" aria-hidden="true" ref={textRef}>{initialText}</span>
  </>;
}
