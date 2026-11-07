'use strict';
// 설치판 화면과 메일 대기열을 잇는 다리. 웹에는 이 다리가 없어 메일 화면이 나오지 않는다(src/lib/mailDelivery.ts).
// 대기열을 열 수 없는 기기(암호화 키를 쓸 수 없을 때)에도 다리를 놓지 않는다 — 그때는 지금까지처럼 «이 기기에 저장»으로 간다.
const { contextBridge, ipcRenderer } = require('electron');

if (ipcRenderer.sendSync('mail:available')) {
  contextBridge.exposeInMainWorld('vcDesktop', {
    mail: {
      add: (info, bytes) => ipcRenderer.invoke('mail:add', info, bytes),
      list: () => ipcRenderer.invoke('mail:list'),
      video: (id) => ipcRenderer.invoke('mail:video', id),
      update: (id, patch) => ipcRenderer.invoke('mail:update', id, patch),
      remove: (id) => ipcRenderer.invoke('mail:remove', id),
    },
  });
}
