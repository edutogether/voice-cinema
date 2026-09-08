import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installFavicon } from './lib/favicon';
import './styles/base.css';
import './styles/splash.css';
import './styles/home.css';
import './styles/studio.css';
import './styles/result.css';

installFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 서비스워커: 엔진(31MB)과 앱 셸을 캐시해 재부팅·캐시비움 이후에도 행사장
// 와이파이로 매번 다시 받지 않게 하고, 인터넷이 끊겨도 앱이 뜨게 한다.
// 캐시 목록은 빌드 시점에 자동 생성되므로(build/precache-plugin.js) 사람이
// 목록을 갱신하는 걸 잊어 오프라인이 죽는 경로 자체가 없다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[서비스워커 등록 실패]', e));
  });
  // 새 서비스워커가 제어권을 넘겨받으면 한 번만 새로고침한다 — 안 그러면 이미 열려
  // 있던 탭은 수동으로 두 번 새로고침해야 새 버전이 반영된다(2026-09-03 실측).
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
