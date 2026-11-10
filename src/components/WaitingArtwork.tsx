import { useEffect, useRef, useState } from 'react';

// 저장 대기 화면의 그림 한 장면 — Poster Studio(src/studio/WaitingArtwork.tsx, 2806349)의 동작 그대로다(11/9 Bumm님 «로딩 화면 포스터에서 갖다가 쓰라니까», 팀장 전달).
// 정지 그림(그 편 영상의 첫 프레임)을 먼저 보이고, 영상이 실제로 재생되기 시작하면 영상으로 넘긴다. 4초 정체 · 자동 재생 거부 · 오류면 정지 그림으로
// 돌아간다. «움직임 줄이기» 신호가 있어도 영상을 그대로 튼다(11/11 Bumm님, 팀장 전달). 소리 없이 한 번만 재생한다(반복 없음 — 마지막 프레임에 머문다). 장면이 바뀌면 부모의 key로 버린다.
// onLoaded: 이 장면 영상을 끝까지 받았거나 받을 영상이 없을 때(실패 포함) 한 번 — 다음 장면 영상을 받기 시작하는 신호.
interface Props { image: string; theme: string; video?: string; onLoaded?: () => void }

export function WaitingArtwork({ image, theme, video, onLoaded }: Props) {
  const player = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const enabled = Boolean(video) && !failed;
  const loaded = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; });
  const markLoaded = () => { if (!loaded.current) { loaded.current = true; onLoadedRef.current?.(); } };
  // 끝까지 받았거나, 브라우저가 «충분히 받았다»며 받기를 쉰 때(suspend + 끝까지 재생 가능)
  const checkLoaded = (element: HTMLVideoElement, suspended = false) => {
    const range = element.buffered;
    const end = range.length ? range.end(range.length - 1) : 0;
    if ((Number.isFinite(element.duration) && element.duration > 0 && end >= element.duration - 0.1)
      || (suspended && element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA)) markLoaded();
  };

  useEffect(() => { if (!enabled) markLoaded(); }, [enabled]);

  useEffect(() => {
    const element = player.current;
    if (enabled && element && video) {
      // 같은 주소가 이미 걸려 있으면 다시 넣지 않는다 — 다시 넣으면 받던 요청을 끊고 캐시에 있던 영상을 망에서 또 받는다(Poster Studio 10/26 측정)
      if (element.getAttribute('src') !== video) element.src = video;
      setVisible(false);
      setBuffering(true);
    }
    return () => {
      if (!element) return;
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [enabled, video]);

  useEffect(() => {
    const element = player.current;
    if (!enabled || !element) return;
    let cancelled = false;
    if (!element.ended) {
      element.muted = true;
      // 자동 재생이 거부되면 검은 화면 대신 정지 그림을 보인다
      void element.play().catch(() => { if (!cancelled) setFailed(true); });
    }
    return () => { cancelled = true; element.pause(); };
  }, [enabled, video]);

  useEffect(() => {
    if (!enabled || !buffering) return;
    const timer = window.setTimeout(() => setFailed(true), 4_000);
    return () => window.clearTimeout(timer);
  }, [enabled, buffering]);

  return (
    <>
      {/* 영상이 다 나타난 뒤(0.18초)에 정지 그림을 숨겨 흰 바탕이 번쩍이지 않게 한다(generation-wait.css) */}
      <img className="generation-robot-film generation-robot-still" data-active={!(enabled && visible)} src={image} width={704} height={704} alt={theme} />
      {enabled && (
        <video
          ref={player}
          className="generation-robot-film generation-robot-video"
          data-active={visible}
          src={video}
          poster={image}
          width={704}
          height={704}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          disablePictureInPicture
          onPlaying={() => { setVisible(true); setBuffering(false); }}
          onWaiting={() => setBuffering(true)}
          onStalled={() => setBuffering(true)}
          onProgress={(event) => checkLoaded(event.currentTarget)}
          onCanPlayThrough={(event) => checkLoaded(event.currentTarget)}
          onSuspend={(event) => checkLoaded(event.currentTarget, true)}
          onEnded={() => { setBuffering(false); markLoaded(); }}
          onError={() => setFailed(true)}
        />
      )}
    </>
  );
}
