import { test, expect } from '@playwright/test';

// App Check 토큰이 끝내 오지 않아도 업로드는 시작한다(10/24 느린 회선 측정에서 발견).
// reCAPTCHA가 준비되지 않으면(학교 망이 구글을 막거나 느린 와이파이에서 스크립트가 안 오면) 토큰 약속이 끝나지 않아, 요청 하나 없이
// «내 영화를 저장하고 있어요»에 영영 멈췄다. 지금은 20초를 넘기면 토큰 없이 보내고 판단은 서버가 한다(src/lib/upload.ts).
// 옛 코드에서는 이 검사가 시간 초과로 떨어진다(토큰을 끝없이 기다린다).
test('App Check 토큰이 끝내 안 와도 20초 뒤에는 토큰 없이 업로드하고 QR까지 간다', async ({ browser }) => {
  test.setTimeout(120000);
  // 서비스워커를 막아야 가짜 App Check 모듈이 서비스워커 캐시를 거치지 않고 그대로 들어간다
  const context = await browser.newContext({ serviceWorkers: 'block', permissions: ['microphone'] });
  const page = await context.newPage();
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
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 60000 });
  const saved = Date.now();
  await page.locator('#saveBtn').click();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
  expect(Date.now() - saved, '토큰을 기다리는 상한(20초)과 합성 시간 안에 끝나야 한다').toBeLessThan(55000);
  expect(uploads).toEqual(['']);
  await context.close();
});

// 끊긴 채 연 창(11/8 실측) — App Check SDK는 reCAPTCHA 스크립트를 한 번만 넣고 받기 실패를 다루지 않아, 처음에 못 받으면 준비를 영영 기다렸다.
// 인터넷이 돌아와도 토큰 없이 올려 서버가 401로 거절했다(교환 0번 · 업로드 401 네 번). 와이파이 없이 켜는 설치판도 같다.
// 지금은 받지 못하면 흔적을 지우고 다음 요청 때 처음부터 다시 받는다. 첫 스크립트가 막힌 때 → 첫 스크립트는 왔는데 그것이 넣는 둘째 스크립트가
// 막힌 때 → 받아진 때를 차례로 겪게 하고, 진짜 App Check SDK가 토큰을 받아 업로드에 붙이는지 본다(reCAPTCHA와 교환 응답만 가짜다).
test('reCAPTCHA를 처음에 받지 못해도(끊긴 채 연 창) 다음 요청 때 다시 받아 App Check 토큰을 붙여 올린다', async ({ browser }) => {
  test.setTimeout(150000);
  const context = await browser.newContext({ serviceWorkers: 'block', permissions: ['microphone'] });
  const page = await context.newPage();
  let loads = 0;
  await page.route('**/recaptcha/enterprise.js*', (route) => {
    loads += 1;
    if (loads === 1) return route.abort('internetdisconnected');
    // 진짜 로더처럼 남은 grecaptcha를 이어 쓴다 — 실패 뒤 흔적을 지우지 않으면 셋째에도 둘째의 멈춘 ready가 남아 토큰이 오지 않는다
    const body = loads === 2
      ? `(() => { const c = window.___grecaptcha_cfg = window.___grecaptcha_cfg || {}; const g = window.grecaptcha = window.grecaptcha || {};
          const e = g.enterprise = g.enterprise || {}; e.ready = e.ready || ((f) => (c.fns = c.fns || []).push(f));
          const s = document.createElement('script'); s.src = 'https://www.gstatic.com/recaptcha/releases/e2e/recaptcha__ko.js'; document.head.appendChild(s); })();`
      : `(() => { const g = window.grecaptcha = window.grecaptcha || {}; const e = g.enterprise = g.enterprise || {}; let solved;
          e.ready = e.ready || ((f) => setTimeout(f)); e.render = e.render || ((_, o) => { solved = o.callback; return 0; });
          e.execute = e.execute || (() => { solved(); return Promise.resolve('e2e-recaptcha'); }); })();`;
    return route.fulfill({ status: 200, contentType: 'text/javascript', body });
  });
  await page.route('**/recaptcha/releases/**', (route) => route.abort('internetdisconnected'));
  const exchanges = [];
  await page.route(/exchangeRecaptchaEnterpriseToken/, (route) => {
    exchanges.push(route.request().postData() ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'e2e-app-check', ttl: '3600s' }) });
  });
  const uploads = [];
  await page.route('**/voiceCinema/upload', (route) => {
    const token = route.request().headers()['x-firebase-appcheck'] ?? null;
    uploads.push(token);
    if (token !== 'e2e-app-check') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'App Check 확인 실패' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs/e2e-appcheck-retry.mp4' }) });
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 60000 });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 90000 });
  // 앱이 미리 준비하는 때(첫 영상 뒤)와 저장의 몇 번째 시도가 겹치는지에 따라 실패한 업로드는 0~2번이다 — 마지막만 토큰을 단다
  expect(loads).toBe(3);
  expect(uploads.at(-1)).toBe('e2e-app-check');
  expect(uploads.slice(0, -1).every((token) => token === '')).toBe(true);
  expect(exchanges.length).toBeGreaterThanOrEqual(1);
  expect(exchanges.every((body) => body.includes('e2e-recaptcha'))).toBe(true);
  await context.close();
});
