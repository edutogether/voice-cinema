import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installFavicon } from './lib/favicon';
import { installSplash } from './lib/splash';
import './styles/base.css';
import './styles/splash.css';
import './styles/home.css';
import './styles/studio.css';
import './styles/result.css';

installFavicon();
installSplash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 서비스워커: 엔진(31MB)과 앱 셸을 캐시해 재부팅·캐시비움 이후에도 행사장
// 와이파이로 매번 다시 받지 않게 하고, 인터넷이 끊겨도 앱이 뜨게 한다.
// 캐시 목록은 빌드 시점에 자동 생성되므로(tools/precache-plugin.js) 사람이
// 목록을 갱신하는 걸 잊어 오프라인이 죽는 경로 자체가 없다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[서비스워커 등록 실패]', e));
  });
  // 새 서비스워커가 제어권을 넘겨받아도 **이 탭을 새로고침하지 않는다.**
  //
  // 예전에는 여기서 한 번 새로고침했다(열려 있던 탭에 새 버전을 바로 반영하려고).
  // 그런데 그 시점은 사용자가 고를 수 없다 — 부스에서 아이가 녹음·합성·업로드
  // 중일 때 일어나면 작업이 아무 안내 없이 통째로 날아간다. 실제로 대표가 화면을
  // 보고 있는 중에 스플래시가 다시 떴다 사라지는 것으로 이 동작이 드러났다
  // (2026-09-09). 화면이 저 혼자 다시 시작하는 것처럼 보인다.
  //
  // 새 버전은 다음에 탭을 새로 열 때 적용된다. 서비스워커는 skipWaiting()과
  // clients.claim()으로 이미 교체돼 있으므로 그때 바로 최신본이 뜬다. 행사 기간에는
  // 배포 동결이라 이 지연이 문제가 되지 않고, 동결 전 배포는 부스 기기를 한 번씩
  // 다시 여는 예열 절차가 이미 있다(.claude/rules/app.md의 배포 동결 절).
}
