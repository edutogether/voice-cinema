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
  // 새 서비스워커가 제어권을 넘겨받으면 한 번만 새로고침한다 — 안 그러면 이미 열려
  // 있던 탭은 수동으로 두 번 새로고침해야 새 버전이 반영된다(2026-09-03 실측).
  //
  // 단, 이 탭에 원래 제어자가 없었다면(=이 기기의 첫 방문, 캐시 비움 뒤 첫 방문)
  // 새로고침하지 않는다. 그 경우 화면은 방금 네트워크에서 받은 최신본이라 새로
  // 고칠 것이 없는데, 설치는 엔진 31MB를 다 받은 뒤에야 끝나므로 그 사이 이미
  // 녹음·합성·업로드 중인 학생의 작업을 아무 안내 없이 날려버릴 수 있다.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
