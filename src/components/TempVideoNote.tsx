import { videoSet } from '../lib/videoSet';

/**
 * 임시 5초 영상(LEGACY_5S)일 때만 보이는 한 줄 — «영상은 최종 영상으로 교체될 예정입니다»(11/2 대표님 «영상 빼고는 전체가 완성됐다는 걸 보여 주고,
 * 영상은 교체될 예정이라고 알려라», 팀장 전달). 눈에 띄되 체험을 가리지 않게 — 첫 화면은 제목 아래, 녹음실은 머리줄(녹음하는 동안은 머리줄과 함께 사라진다).
 * 영상 자리가 지금 원판이면(정식 주소 · 개발 주소 기본) 아무것도 그리지 않는다(src/lib/videoSet.ts).
 */
export function TempVideoNote({ className = '' }: { className?: string }) {
  if (videoSet !== 'legacy5s') return null;
  return <p className={`temp-video-note ${className}`.trim()} role="note">영상은 최종 영상으로 교체될 예정입니다</p>;
}
