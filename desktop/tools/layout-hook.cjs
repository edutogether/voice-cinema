'use strict';
// 화면 비교 도구(layout-compare.mjs)가 설치판 앱을 띄울 때 먼저 읽히는 파일(electron -r) — 앱 코드(main.js)는 그대로 두고 창만 다룬다.
//   - 창을 화면에 띄우지 않는다(show · maximize를 막는다 — 시험 창이 사람이 쓰는 모니터에 뜨지 않게, 기준 12).
//   - 앱이 하는 차례를 그대로 따르되 크기만 정해진 값으로: 앱이 «작업 영역 크기로 맞추기»(setBounds)를 할 때는 안쪽을 VC_LAYOUT_SIZE보다
//     테두리 · 제목줄만큼 작게(가로 16 · 세로 39px — 1366×860 창의 실제 차이), «최대화»(maximize)를 할 때 VC_LAYOUT_SIZE(«1366x768» 모양)로 넓힌다.
const { app } = require('electron');

const [width, height] = (process.env.VC_LAYOUT_SIZE ?? '1366x768').split('x').map(Number);

app.on('browser-window-created', (_event, win) => {
  win.webContents.setAudioMuted(true);
  // 숨은 창은 화면이 «안 보임»으로 잡혀 타이머 · 영상이 쉬고 그리기도 미뤄진다 — 보이는 창과 같이 돌게 한다(웹 쪽 헤드리스도 «보임»이다)
  win.webContents.setBackgroundThrottling(false);
  win.show = () => {};
  win.focus = () => {};
  win.setBounds = () => { win.setContentSize(width - 16, height - 39); };
  win.maximize = () => { win.setContentSize(width, height); };
});
