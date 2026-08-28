// E2E 테스트 설정(2026-08-27, 테스트 커버리지 완성도 향상 — 대표 지시).
// docs/를 정적으로 서빙해 실제 브라우저(Chromium)에서 녹음→합성→저장 흐름을 검증한다.
// Chromium의 내장 가짜 미디어 장치를 쓴다 — 오디오 데이터가 항상 잘 만들어진
// 유효한 스트림이라, 손으로 만든 AudioContext 트릭보다 훨씬 안정적이다.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'npx serve -l 4321 docs',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  use: {
    baseURL: 'http://localhost:4321',
    permissions: ['microphone'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
});
