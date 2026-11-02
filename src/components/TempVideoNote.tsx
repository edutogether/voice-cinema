import { videoSet } from '../lib/videoSet';

/**
 * 임시 영상(LEGACY_5S)일 때만 보이는 한 줄(11/2 대표님 «영상 빼고는 전체가 완성됐다는 걸 보여 주고, 영상은 교체될 예정이라고 알려라» —
 * 같은 날 L1로 짝 없는 세 장르를 숨기며 «장르도 더 늘어날 예정»을 같이교육 말투로 함께 알리게 됐다, 팀장 전달). 말투는 같이교육 앱들의
 * 안내(Portal «앞으로 추가될 플레이리스트를 기대해주세요 !»)에 맞추고, 휴대폰 머리줄 한 줄에 들게 짧게 쓴다.
 * 눈에 띄되 체험을 가리지 않게 — 첫 화면은 제목 아래, 녹음실은 머리줄 둘째 줄(녹음하는 동안은 머리줄과 함께 사라진다).
 * 영상 자리가 지금 원판이면(정식 주소 · 개발 주소 기본) 아무것도 그리지 않는다(src/lib/videoSet.ts).
 */
export function TempVideoNote({ className = '' }: { className?: string }) {
  if (videoSet !== 'legacy5s') return null;
  return <p className={`temp-video-note ${className}`.trim()} role="note">곧 최종 영상으로 바뀌고, 장르도 더 늘어날 거예요 !</p>;
}
