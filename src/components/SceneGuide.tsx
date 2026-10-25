import { STUDIO_COPY } from '../copy';
import type { SceneGuide as Guide } from '../genres';

/**
 * 새 장면(FINAL_7S)의 자유 발화 안내(10/26 대표님) — 상황 안내(크게) → 예시 대사(작게, «예시») → «내 말로 외쳐도 좋아요 !».
 * 예시는 정답이 아니다: 녹음은 무엇을 말했는지 보지 않고(소리 크기 · 길이만 본다, src/lib/voiceCheck.ts) 다른 말도 똑같이 저장된다.
 * 상황 안내는 `strong`이 아니라 `span`이다 — 녹음실의 `.studio-cue strong` · `.studio-shout strong`(차례 문구 · 빨간 띠) 꾸밈이 붙지 않게.
 */
export function SceneGuide({ guide }: { guide: Guide }) {
  return (
    <span className="scene-guide" data-testid="scene-guide">
      <span className="scene-guide-situation" data-testid="scene-situation">{guide.situation}</span>
      <span className="scene-guide-example" data-testid="scene-example"><small>{STUDIO_COPY.example}</small>{guide.example}</span>
      <small className="scene-guide-free" data-testid="scene-free">{STUDIO_COPY.freeSpeech}</small>
    </span>
  );
}
