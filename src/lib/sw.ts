// 서비스워커 등록.
//
// 엔진(31MB)과 앱 셸을 캐시해 재부팅·캐시비움 이후에도 행사장 와이파이로 매번 다시
// 받지 않게 하고, 인터넷이 끊겨도 앱이 뜨게 한다. 캐시 목록은 빌드가 자동 생성한다
// (tools/precache-plugin.js) — 사람이 목록 갱신을 잊어 오프라인이 죽는 경로가 없다.
//
// **새 버전이 와도 저절로 새로고침하지 않고, 화면에 알리지도 않는다.** 새로고침 시점은 사용자가 고를 수
// 없어서, 부스에서 아이가 녹음·합성·업로드 중이면 작업이 안내 없이 통째로 날아간다(2026-09-09에 스플래시가
// 다시 뜨는 모양으로 드러나 없앴다). 새 판은 다음에 탭을 열 때 적용된다 — 서비스워커는 이미 교체돼 있다.
// 오른쪽 아래 «새 버전이 있어요 · 새로고침» 알림은 2026-11-08 Bumm님 지시로 뺐다. 행사 기기는 행사 전에 한 대씩 새로고침한다.

// 등록이 끝났는가(실패면 false). 실패했으면 이 탭을 맡을 서비스워커가 없으니 엔진 받기가 그것을 기다리지 않는다(src/lib/ffmpeg.ts) —
// Windows 설치판은 파일을 전부 안에 싣고 있어 서비스워커를 등록하지 않는다(desktop/bundle.js).
let registering: Promise<boolean> | null = null;
export const serviceWorkerRegistering = () => registering;

export function installServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  // load 이벤트가 이미 지났으면 리스너를 달아도 영영 안 불린다 — 이 함수는 리액트가
  // 붙은 뒤에 호출되므로 그 경우가 흔하다. 실제로 그렇게 만들었다가 등록 자체가 안 돼
  // 오프라인 부팅이 죽었고, e2e/offline-boot.spec.js가 잡았다(2026-09-09).
  let settle: (ok: boolean) => void = () => {};
  registering = new Promise((resolve) => { settle = resolve; });
  const register = () => {
    navigator.serviceWorker.register('/sw.js').then(() => settle(true), (e) => {
      console.warn('[서비스워커 등록 실패]', e);
      settle(false);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
