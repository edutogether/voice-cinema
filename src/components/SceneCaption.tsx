import { useEffect, useState } from 'react';
import { watchVideoTime } from '../lib/videoClock';
import type { Genre } from '../genres';

/**
 * 상대 대사 자막 — 넷플릭스식으로 영상 위에 띄운다(app-plan §2-3, 대표님 10/11
 * «넷플릭스 자막하고 똑같게, 당연히 영상은 클리어해야 된다»). 원판·완성본에는 굽지 않는다.
 * 영상 시각에 정확히 맞춰 나타났다 사라진다(페이드 없음). 브라우저 기본 자막(`<track>`)은
 * 쓰지 않는다 — iOS 사파리·인앱 브라우저마다 그림자·위치가 달라 모양을 고정할 수 없다.
 */
export function SceneCaption({ genre, videoRef, enabled }: { genre: Genre; videoRef: React.RefObject<HTMLVideoElement | null>; enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!enabled || !v) {
      setVisible(false);
      return;
    }
    const { start, end } = genre.line;
    return watchVideoTime(v, (time) => setVisible(time >= start && time < end));
  }, [enabled, genre, videoRef]);
  if (!enabled || !visible) return null;
  return <div className="scene-caption" data-testid="scene-caption"><span>{genre.line.text}</span></div>;
}
