// 서비스워커 등록과 "새 버전 있음" 신호.
//
// 엔진(31MB)과 앱 셸을 캐시해 재부팅·캐시비움 이후에도 행사장 와이파이로 매번 다시
// 받지 않게 하고, 인터넷이 끊겨도 앱이 뜨게 한다. 캐시 목록은 빌드가 자동 생성한다
// (tools/precache-plugin.js) — 사람이 목록 갱신을 잊어 오프라인이 죽는 경로가 없다.
//
// **새 버전이 와도 저절로 새로고침하지 않는다.** 그 시점은 사용자가 고를 수 없어서,
// 부스에서 아이가 녹음·합성·업로드 중이면 작업이 안내 없이 통째로 날아간다
// (2026-09-09에 스플래시가 다시 뜨는 모양으로 드러나 없앴다).
//
// 그런데 안 하고 두기만 하면 열어둔 탭이 계속 옛 화면을 보여준다 — 무엇을 고쳐도
// 확인이 안 된다. 그래서 **알리기만 하고 새로고침은 사람이 누를 때** 한다.
export function installServiceWorker(onUpdateReady: () => void): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[서비스워커 등록 실패]', e));
  });

  // 이 탭에 원래 제어자가 없었다면 방금 첫 설치다 — 화면은 이미 최신본이라 알릴 것이 없다.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdateReady();
  });
}
