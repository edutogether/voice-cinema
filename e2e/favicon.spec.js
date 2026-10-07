// 탭·즐겨찾기 아이콘은 같이교육 로고 하나로 고정한다(COMMON_STANDARDS §33, 2026-10-07 Bumm님 지시).
// 원본은 Calendar의 favicon-black.png 그대로다 — 새로 그리지 않는다.
//
// 예전에는 탭이 가려지거나 창이 포커스를 잃으면 아이콘을 회색으로 바꿔 끼웠다. 그 동작은
// 폐기됐다. 즐겨찾기에 넣을 때와 탭에 뜰 때 늘 같은 아이콘이어야 하므로, 탭을 숨겼다
// 되돌리는 상황을 직접 만들어 아이콘 주소가 한 번도 바뀌지 않는지 본다.
import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

const ICON = '/icons/favicon-edutogether.png';
// Calendar dist/favicon-black.png(64×64 투명 PNG)의 SHA-256. 라이브 Calendar 파일과도 같다(2026-10-07 대조).
const ORIGINAL_SHA = '31cb992ece2227d4884dc6947a603f07ce0d64b4b2e06025c8cdf78b08c5faf2';

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
  test(`${path} — 탭 아이콘은 같이교육 로고이고, 탭을 숨겼다 되돌려도 그대로다`, async ({ page }) => {
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

test('아이콘 파일은 Calendar와 같은 원본이다', async ({ request }) => {
  const r = await request.get(ICON);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/png');
  expect(crypto.createHash('sha256').update(await r.body()).digest('hex')).toBe(ORIGINAL_SHA);
});
