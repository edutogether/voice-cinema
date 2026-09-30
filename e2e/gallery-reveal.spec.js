import { test, expect } from '@playwright/test';

test('PC: 호버하면 영상 옆에 설명 자리가 생기고 패널을 눌러도 같은 장면으로 들어간다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const tile = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  const media = tile.locator('.tile-media');
  const body = tile.locator('.tile-body');
  await expect(body).toHaveCSS('opacity', '0');
  const fullWidth = (await media.boundingBox()).width;
  await tile.hover();
  await expect(body).toHaveCSS('opacity', '1');
  await expect.poll(async () => (await media.boundingBox()).width).toBeLessThan(fullWidth * .7);
  await media.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
  const mediaBox = await media.boundingBox();
  const bodyBox = await body.boundingBox();
  expect(mediaBox.x + mediaBox.width).toBeLessThanOrEqual(bodyBox.x + 1);
  await tile.locator('.gname').click();
  await expect(page.locator('#chipName')).toHaveText('판타지');
});

test('PC: 키보드로 설명을 열고 마지막 장면을 선택한 뒤 돌아와도 그 카드가 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.keyboard.press('Tab');
  const first = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  await expect(first).toBeFocused();
  await expect(first.locator('.tile-body')).toHaveCSS('opacity', '1');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  const last = page.getByRole('button', { name: '시트콤 더빙 시작', exact: true });
  await expect(last).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#chipName')).toHaveText('시트콤');
  await page.locator('#studioBackBtn').click();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport({ ratio: .9 });
});
