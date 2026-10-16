// 영상의 실제 재생 시각을 프레임마다 읽는다. `timeupdate`는 약 250ms마다라 5.0초 멈춤과
// 1.6초 자막을 맞추기에 거칠다 — 화면에 프레임이 나갈 때마다 불리는 `requestVideoFrameCallback`을
// 쓰고, 없는 브라우저는 `requestAnimationFrame`으로 `currentTime`을 읽는다(app-plan §2-1·2-3).

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** 재생 중인 영상의 시각을 프레임마다 알린다. 돌려준 함수를 부르면 멈춘다. */
export function watchVideoTime(video: HTMLVideoElement, onTime: (seconds: number) => void): () => void {
  const v = video as FrameVideo;
  let handle = 0;
  let stopped = false;
  if (typeof v.requestVideoFrameCallback === 'function') {
    const tick = (_now: number, meta: { mediaTime: number }) => {
      if (stopped) return;
      onTime(meta.mediaTime);
      handle = v.requestVideoFrameCallback!(tick);
    };
    handle = v.requestVideoFrameCallback(tick);
    // 프레임 콜백은 영상이 멈춰 있으면 오지 않는다 — 탐색·정지 뒤의 시각도 알리도록 rAF를 함께 돌린다.
    let frame = 0;
    const poll = () => {
      if (stopped) return;
      if (v.paused) onTime(v.currentTime);
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => {
      stopped = true;
      v.cancelVideoFrameCallback?.(handle);
      cancelAnimationFrame(frame);
    };
  }
  const poll = () => {
    if (stopped) return;
    onTime(v.currentTime);
    handle = requestAnimationFrame(poll);
  };
  handle = requestAnimationFrame(poll);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}

/**
 * 영상이 `seconds`에 닿으면 멈추고 그 시각에 정확히 맞춘다. 넘어간 한두 프레임(최대 약 33ms,
 * 프레임 콜백이 없으면 한 화면 갱신)은 목소리 칸의 BGM이라 거의 들리지 않는다.
 * 5.0초는 원판의 키프레임이라 되돌리는 탐색이 정확하고 빠르다.
 */
export function stopVideoAt(video: HTMLVideoElement, seconds: number, onStop: () => void): () => void {
  // 한 프레임(30fps)의 절반만큼 일찍 멈춰 다음 프레임이 화면에 나가기 전에 잡는다.
  const threshold = seconds - 1 / 60;
  let done = false;
  const stop = watchVideoTime(video, time => {
    if (done || time < threshold) return;
    done = true;
    stop();
    video.pause();
    video.currentTime = seconds;
    onStop();
  });
  return () => {
    done = true;
    stop();
  };
}
