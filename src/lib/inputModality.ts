// 마지막 입력이 키보드였는지. 앱이 스스로 초점을 옮기는 것(녹음실에서 돌아올 때 장면 카드, 녹음이 끝났을 때 저장하기 등)은
// 키보드로 다니는 사람에게만 한다 — 마우스·터치로 쓰는 사람에게 초점을 남기면 키 하나(캡처 단축키의 Shift 등)만 눌러도
// 그 자리에 초점 테두리가 생긴다(10/20 대표님 PC 캡처의 가운데 카드 검은 띠, «다시 듣기» 빨간 띠).
let keyboard = false;
window.addEventListener('keydown', () => { keyboard = true; }, true);
window.addEventListener('pointerdown', () => { keyboard = false; }, true);

export function lastInputWasKeyboard(): boolean {
  return keyboard;
}
