// 설치판(Windows) 안에서 도는가. 설치판은 Electron 기본 브라우저 이름을 그대로 쓴다(desktop/main.js가 바꾸지 않는다).
// 첫 화면 표시(DownloadLink.tsx)와 메일 보관 자리(mailDelivery.ts)가 같은 판정을 쓴다.
export const IN_INSTALLER = navigator.userAgent.includes('Electron/');
