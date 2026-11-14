import { useEffect, useMemo, useState } from 'react';
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
 * 미리보기의 아이 대사 구간 문구(11/7 Bumm님 «멈추고 321은 빼고 … 문구만 주고 그냥 쭉 멈춤없이 지나가게 해서 아 ~ 하게»).
 * 영상은 멈추지 않는다. 화면을 살짝 어둡게 하고 큰 흰 글씨로 띄운다 — 녹음 때의 3·2·1 화면과 같은 모양이다
 * (11/8 Bumm님 «빨간 둥근 막대는 없앱니다»). 구간은 장르 값(genre.turn)이다.
 */
export function SceneTurnCue({ genre, videoRef, enabled }: { genre: Genre; videoRef: VideoRef; enabled: boolean }) {
  const turns = useMemo(() => [genre.turn], [genre.turn]);
  if (useVideoWindow(videoRef, turns, enabled) < 0) return null;
  return <div className="scene-turn-cue" role="status"><strong>{STUDIO_COPY.lineNow}</strong></div>;
}
