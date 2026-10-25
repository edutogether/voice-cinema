import { test, expect } from '@playwright/test';
import { installSyntheticMic } from './synthetic-mic.js';

// App Check 토큰이 끝내 오지 않아도 업로드는 시작한다(10/24 느린 회선 측정에서 발견).
// reCAPTCHA가 준비되지 않으면(학교 망이 구글을 막거나 느린 와이파이에서 스크립트가 안 오면) 토큰 약속이 끝나지 않아, 요청 하나 없이
// «내 영화를 저장하고 있어요»에 영영 멈췄다. 지금은 20초를 넘기면 토큰 없이 보내고 판단은 서버가 한다(src/lib/upload.ts).
// 옛 코드에서는 이 검사가 시간 초과로 떨어진다(토큰을 끝없이 기다린다).
test('App Check 토큰이 끝내 안 와도 20초 뒤에는 토큰 없이 업로드하고 QR까지 간다', async ({ browser }) => {
  test.setTimeout(120000);
  // 서비스워커를 막아야 가짜 App Check 모듈이 서비스워커 캐시를 거치지 않고 그대로 들어간다
  const context = await browser.newContext({ serviceWorkers: 'block', permissions: ['microphone'] });
  const page = await context.newPage();
  // 저장할 수 있는 녹음 — 크롬 내장 가짜 마이크의 «삐»는 3초를 넘어 이어지는 말로 보여 다시 녹음이 된다(10/26)
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await page.route('**/vendor/firebase/firebase-app-check.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'export const initializeApp = () => ({}); export const initializeAppCheck = () => ({}); export class ReCaptchaEnterpriseProvider {} export const getToken = () => new Promise(() => {});',
  }));
  const uploads = [];
  await page.route('**/voiceCinema/upload', (route) => {
    uploads.push(route.request().headers()['x-firebase-appcheck'] ?? null);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs/e2e-appcheck.mp4' }) });
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
  const saved = Date.now();
  await page.locator('#saveBtn').click();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
  expect(Date.now() - saved, '토큰을 기다리는 상한(20초)과 합성 시간 안에 끝나야 한다').toBeLessThan(55000);
  expect(uploads).toEqual(['']);
  await context.close();
});
