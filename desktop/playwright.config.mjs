// 설치판 검사 — 빌드한 앱(release/win-unpacked, 또는 VC_DESKTOP_EXE로 설치된 exe)을 직접 띄운다. 웹 E2E(루트 e2e/)와 달리 웹 서버가 없다.
// @playwright/test는 루트에 설치된 것을 쓴다(루트에서 npm ci 먼저).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
