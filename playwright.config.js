// 실사용 흐름 E2E 설정. 소스가 아니라 **빌드 결과(dist/)** 를 서빙해서,
// 실제 배포되는 것과 같은 산출물로 녹음→합성→저장 흐름을 검증한다.
// Chromium의 내장 가짜 미디어 장치를 쓴다 — 오디오 데이터가 항상 유효한
// 스트림이라 손으로 만든 AudioContext 트릭보다 안정적이다.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'npm run build && npx vite preview --port 4321 --strictPort',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    // 서버 기동이 실패하면 원인을 바로 볼 수 있어야 한다 — CI에서 출력 없이
    // "Exit code 1"만 남아 원인을 못 찾은 적이 있다(2026-09-08).
    stdout: 'pipe',
    stderr: 'pipe',
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
