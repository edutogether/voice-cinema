'use strict';
// 화면 비교 도구(layout-compare.mjs)의 세 번째 쪽 — 설치판과 같은 엔진(Electron 44의 크로미움)을 «그냥 브라우저»로 써서 웹(로컬 빌드 주소)을 연다.
// 설치판 껍데기(main.js · bundle.js — 정본 주소로 설치판 안의 파일을 내는 처리, 보안 헤더, 권한)를 빼고 엔진만 같게 한 것이다.
// 창은 숨기고(기준 12) 안쪽 크기는 VC_LAYOUT_SIZE, 주소는 VC_LAYOUT_URL.
const { app, BrowserWindow, session } = require('electron');

const [width, height] = (process.env.VC_LAYOUT_SIZE ?? '1366x768').split('x').map(Number);

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'media'));
  const win = new BrowserWindow({ show: false, useContentSize: true, width, height, backgroundColor: '#ffffff', webPreferences: { backgroundThrottling: false } });
  win.setContentSize(width, height);
  win.webContents.setAudioMuted(true);
  win.loadURL(process.env.VC_LAYOUT_URL);
});
app.on('window-all-closed', () => app.quit());
