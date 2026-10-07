// 탭·즐겨찾기 아이콘은 InKY 로고의 노란 카메라 하나로 고정한다(COMMON_STANDARDS §33, 2026-10-07 Bumm님 지시).
// 팀장이 InKY 로고 원본에서 원본 화소 그대로 잘라 둔 세 앱 공용 64px 파일이다 — 새로 그리지 않는다.
//
// 예전에는 탭이 가려지거나 창이 포커스를 잃으면 아이콘을 회색으로 바꿔 끼웠다. 그 동작은
// 폐기됐다. 즐겨찾기에 넣을 때와 탭에 뜰 때 늘 같은 아이콘이어야 하므로, 탭을 숨겼다
// 되돌리는 상황을 직접 만들어 아이콘 주소가 한 번도 바뀌지 않는지 본다.
import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

// 주소 끝의 ?v=는 아이콘 그림을 바꿀 때마다 올린다 — 주소가 그대로면 브라우저가 예전 아이콘을 한동안 쓴다.
const ICON = '/icons/favicon-inky.png?v=20261008';
// 공용 inky-camera-64.png(64×64 투명 PNG)의 SHA-256. Poster Studio·InKY Calculator도 같은 파일을 쓴다.
const ORIGINAL_SHA = 'f74e7e0a1dc21be7f003d691ae308396ccdee10d2a681af85c7cff5cad6558d5';

const icons = (page) =>
  page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute('href')));

const setHidden = (page, hidden) =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new window.Event('visibilitychange'));
    window.dispatchEvent(new window.Event(h ? 'blur' : 'focus'));
  }, hidden);

for (const path of ['/', '/privacy.html']) {
  test(`${path} — 탭 아이콘은 InKY 노란 카메라이고, 탭을 숨겼다 되돌려도 그대로다`, async ({ page }) => {
    await page.goto(path);
    if (path === '/') await page.locator('#splash').waitFor({ state: 'detached' });
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);
    expect(await icons(page)).toEqual([ICON]);

    await setHidden(page, true);
    await page.waitForTimeout(300);
    expect(await icons(page), '탭이 가려졌을 때 아이콘이 바뀌었다').toEqual([ICON]);

    await setHidden(page, false);
    await page.waitForTimeout(300);
    expect(await icons(page), '탭으로 돌아왔을 때 아이콘이 바뀌었다').toEqual([ICON]);
  });
}

test('아이콘 파일은 공용 원본과 같다', async ({ request }) => {
  const r = await request.get(ICON);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/png');
  expect(crypto.createHash('sha256').update(await r.body()).digest('hex')).toBe(ORIGINAL_SHA);
});
