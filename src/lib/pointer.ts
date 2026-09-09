// 마우스 호버가 실제로 되는 입력장치인지. 여기서 갈리는 건 "미리보기를 보여줄지"가
// 아니라 "무엇이 활성 카드를 정하는지"다 — 마우스가 있으면 포인터가, 없으면 화면
// 가운데가 그 역할을 한다. 터치 기기에서 카드가 정지 이미지로만 남으면 그건 설계가
// 아니라 그 사용자에게는 고장난 화면이다(2026-09-09 대표 지적).
export const SUPPORTS_HOVER =
  window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
