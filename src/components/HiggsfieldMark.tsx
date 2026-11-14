import { useState, type CSSProperties } from 'react';

// 장면 영상을 만든 도구(Higgsfield)의 흰 로고 — Poster Studio(CameraExample.tsx · studio.css «.camera-example-logo»)와 같은 그림 · 같은 자리 · 같은 크기 규칙이다
// (11/14 Bumm님, 팀장 전달). 영상에 굽지 않고 영상 칸의 보이는 오른쪽 위에 얹는다 — 녹음실(미리보기 · 녹음)과 첫 화면 장면 카드.
// 그림(public/brands/higgsfield.png)은 poster-studio의 src/studio/camera-logo.png를 바이트 그대로 복사한 것이고 보일 크기의 6배로 그려져 있어,
// 화면 크기 = 그림 폭(naturalWidth ÷ 6, 1920×1080 영상 기준 140px) × 영상이 칸을 덮는 배율이다(base.css «.higgsfield-mark»).
// 완성 화면(포스터 · 완성 영화)에는 두지 않는다 — 거기는 InKY · 교육청 로고 그대로다.
const LOGO_DENSITY = 6;

export function HiggsfieldMark() {
  const [width, setWidth] = useState(0);
  return (
    <span className="higgsfield-mark" aria-hidden="true">
      <img src="/brands/higgsfield.png" alt="" style={width ? { '--logo-px': width } as CSSProperties : undefined}
        onLoad={(e) => setWidth(e.currentTarget.naturalWidth / LOGO_DENSITY)} />
    </span>
  );
}
