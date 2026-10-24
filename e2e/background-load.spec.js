import { test, expect } from '@playwright/test';

// 와이파이에서 너무 느리다(10/24 대표님) — 화면에 필요한 것을 먼저 받고, 뒤에서 받는 것은 한 번만 받는다.
// 라이브 Fast 3G 첫 방문에서 엔진(압축 7.1MB)을 서비스워커 설치와 앱이 따로 받아 두 번 받았고(14.2MB), 엔진 준비까지 165초가 걸렸다.

test('첫 방문에 엔진은 회선으로 한 번만 받고, 서비스워커가 그것을 캐시에 넣는다', async ({ page, context }) => {
  test.setTimeout(120000);
  const fromNetwork = [];
  context.on('requestfinished', async (r) => {
    if (!r.url().includes('/vendor/ffmpeg-core/ffmpeg-core.wasm')) return;
    const resp = await r.response();
    if (resp && !resp.fromServiceWorker()) fromNetwork.push(r.serviceWorker() ? '서비스워커' : '페이지');
  });
  // 서비스워커 설치 목록에 엔진이 없다(설치 때 받으면 첫 화면 영상과 회선을 다툰다)
  const sw = await (await page.request.get('/sw.js')).text();
  expect(sw.match(/const PRECACHE_URLS = (\[[^\]]*\])/)[1]).not.toContain('ffmpeg-core');
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  // 엔진을 다 받고, 서비스워커 캐시에 들어갈 때까지
  await expect.poll(() => page.evaluate(async () => !!(await caches.match('/vendor/ffmpeg-core/ffmpeg-core.wasm', { ignoreVary: true }))), { timeout: 90000 }).toBe(true);
  await page.waitForTimeout(500);
  expect(fromNetwork, '엔진을 회선으로 받은 횟수').toHaveLength(1);
});

test('첫 화면에 안 보이는 장면 카드(가운데에서 셋째 이상)는 그림을 아직 받지 않고, 가까이 오면 받는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const images = () => page.evaluate(() => [...document.querySelectorAll('.scene-shell')].map((s) => [Number(s.dataset.offset), !!s.querySelector('img.thumb')]));
  for (const [offset, hasImage] of await images()) expect(hasImage, `가운데에서 ${offset}번째`).toBe(Math.abs(offset) <= 2);
  // 한 장 넘기면 새로 가까워진 카드도 그림을 받는다(한 번 받은 것은 그대로 둔다)
  await page.locator('.scene-arrow-next').click();
  await expect.poll(async () => (await images()).filter(([o, has]) => Math.abs(o) <= 2 && !has).length).toBe(0);
});
