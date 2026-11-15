import { useEffect, useState } from 'react';
import { watchVideoTime } from '../lib/videoClock';
import { STUDIO_COPY } from '../copy';
import type { Genre } from '../genres';

type VideoRef = React.RefObject<HTMLVideoElement | null>;
type Span = { start: number; end: number };

/** 영상 시각이 든 구간 [start, end)의 번호를 프레임마다 본다(없으면 -1). 페이드 없이 그 시각에 정확히 나타났다 사라진다. */
function useVideoWindow(videoRef: VideoRef, spans: readonly Span[], enabled: boolean): number {
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    const v = videoRef.current;
    if (!enabled || !v) {
      setIndex(-1);
      return;
    }
    return watchVideoTime(v, (time) => setIndex(spans.findIndex((s) => time >= s.start && time < s.end)));
  }, [enabled, spans, videoRef]);
  return enabled ? index : -1;
}

/**
 * 상대 대사 자막 — 넷플릭스식으로 영상 위에 띄운다(app-plan §2-3, 대표님 10/11
 * «넷플릭스 자막하고 똑같게, 당연히 영상은 클리어해야 된다»). 원판·완성본에는 굽지 않는다.
 * 영상 시각에 정확히 맞춰 나타났다 사라진다(페이드 없음). 브라우저 기본 자막(`<track>`)은
 * 쓰지 않는다 — iOS 사파리·인앱 브라우저마다 그림자·위치가 달라 모양을 고정할 수 없다.
 */
export function SceneCaption({ genre, videoRef, enabled }: { genre: Genre; videoRef: VideoRef; enabled: boolean }) {
  const at = useVideoWindow(videoRef, genre.lines, enabled);
  if (at < 0) return null;
  return <div className="scene-caption" data-testid="scene-caption"><span>{genre.lines[at].text}</span></div>;
}

/**
 * 미리보기 끝 문구 — 미리보기가 끝 시각(genre.previewEnd)에 멈추면 그 마지막 프레임 위로 멈춤 장면처럼 화면을 살짝 어둡게 하고
 * «당신의 목소리가 들어갈 자리예요 !»를 큰 흰 글씨로 띄운다. 녹음 때의 «이제 당신의 차례입니다 !» · 3·2·1 화면과 같은 모양이다(11/8 Bumm님 «빨간 둥근 막대는 없앱니다»).
 * 영상이 흐르는 동안에는 가리지 않는다 — 끝 1.5초 전부터 덮었더니 «말한 초보다 다 조금씩 짧아졌다»(11/16 Bumm님 정정, 팀장 전달).
 * 띄워 두는 시간(PREVIEW_HOLD_SECONDS)이 지나면 준비 화면으로 넘어간다(useDubbing의 playPreview).
 */
export function SceneTurnCue({ show }: { show: boolean }) {
  if (!show) return null;
  return <div className="scene-turn-cue" role="status"><strong>{STUDIO_COPY.lineNow}</strong></div>;
}
