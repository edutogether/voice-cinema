import { test, expect } from '@playwright/test';

// 장면 그림은 AVIF를 먼저 쓰고(약 24% 작다), AVIF를 못 읽는 기기는 같은 그림의 JPEG을 쓴다(10/24 와이파이 최적화 ⑥).
// 크로미움은 AVIF를 읽으므로 실제로 보이는 그림(currentSrc)이 .avif여야 하고, 대신 쓸 JPEG 주소도 그대로 있어야 한다.
const kind = (u) => (u || '').split('?')[0].split('.').pop();

test('첫 페이지 장면 카드 · 아래 그림 띠 · 완성 화면 그림이 AVIF로 보이고, JPEG을 대신 쓸 주소가 있다', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/voiceCinema/upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs/e2e-avif.mp4' }) }));
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const card = page.locator('.scene-shell.is-current img.thumb');
  await expect.poll(() => card.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  const cardImg = await card.evaluate((img) => ({ current: img.currentSrc, fallback: img.getAttribute('src'), source: img.parentElement.querySelector('source[type="image/avif"]')?.getAttribute('srcset') }));
  expect(kind(cardImg.current)).toBe('avif');
  expect(kind(cardImg.fallback)).toBe('jpg');
  expect(cardImg.source).toContain('.avif');
  const strip = await page.locator('.scene-choice img').first().evaluate((img) => ({ current: img.currentSrc, fallback: img.getAttribute('src') }));
  expect(kind(strip.current)).toBe('avif');
  expect(kind(strip.fallback)).toBe('jpg');

  await page.locator('.scene-shell.is-current .tile').dispatchEvent('click');
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
  const poster = page.locator('.result-poster img').first();
  await expect.poll(() => poster.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  const posterImg = await poster.evaluate((img) => ({ current: img.currentSrc, fallback: img.getAttribute('src'), box: img.getBoundingClientRect().width / img.closest('.result-poster').getBoundingClientRect().width }));
  expect(kind(posterImg.current)).toBe('avif');
  expect(kind(posterImg.fallback)).toBe('jpg');
  // 감싼 상자(<picture>)가 배치에 끼지 않아 그림이 액자를 꽉 채운다
  expect(posterImg.box).toBeCloseTo(1, 2);
});
