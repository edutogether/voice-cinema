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
export function installServiceWorker(onUpdateReady: () => void): (() => void) | undefined {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  // load 이벤트가 이미 지났으면 리스너를 달아도 영영 안 불린다 — 이 함수는 리액트가
  // 붙은 뒤에 호출되므로 그 경우가 흔하다. 실제로 그렇게 만들었다가 등록 자체가 안 돼
  // 오프라인 부팅이 죽었고, e2e/offline-boot.spec.js가 잡았다(2026-09-09).
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[서비스워커 등록 실패]', e));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  // 이 탭에 원래 제어자가 없었다면 방금 첫 설치다 — 화면은 이미 최신본이라 알릴 것이 없다.
  let hadController = !!navigator.serviceWorker.controller;
  let disposed = false;
  const pending = new Set<() => void>();
  const onControllerChange = () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    const shouldCheck = hadController;
    hadController = true;
    if (!shouldCheck) return;

    // 새 문서를 먼저 불러온 뒤 SW가 따라 교체되는 경우는 업데이트가 아니다.
    // 현재 문서의 해시된 JS/CSS와 새 SW의 실제 프리캐시 목록을 비교한다.
    const assets = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[type="module"][src], link[rel="stylesheet"][href]'))
      .map(el => new URL(el instanceof HTMLScriptElement ? el.src : el.href, location.href))
      .filter(url => url.origin === location.origin && url.pathname.startsWith('/assets/'))
      .map(url => url.pathname);
    if (!assets.length) return;
    const channel = new MessageChannel();
    const finish = () => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      pending.delete(finish);
    };
    // 응답이 없는 이전 SW에는 기존 알림 동작을 유지한다. 자동 새로고침은 하지 않는다.
    const timeout = window.setTimeout(() => {
      finish();
      if (!disposed && navigator.serviceWorker.controller === controller) onUpdateReady();
    }, 3000);
    pending.add(finish);
    channel.port1.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== 'APP_VERSION_STATUS' || typeof event.data.updateAvailable !== 'boolean') return;
      finish();
      if (!disposed && navigator.serviceWorker.controller === controller && event.data.updateAvailable) onUpdateReady();
    };
    controller.postMessage({ type: 'CHECK_APP_VERSION', assets }, [channel.port2]);
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  return () => {
    disposed = true;
    window.removeEventListener('load', register);
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    pending.forEach(finish => finish());
  };
}
