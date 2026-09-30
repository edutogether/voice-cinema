import { test, expect } from '@playwright/test';

test('PC: 겹친 여섯 카드의 더빙 버튼이 가려지지 않고 각각의 장면으로 들어간다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  for (const name of ['판타지', '애니메이션', '호러', '액션', '드라마', '시트콤']) {
    const tile = page.getByRole('button', { name: `${name} 더빙 시작`, exact: true });
    await expect(tile.locator('.gname')).toBeInViewport({ ratio: 1 });
    // 강제 클릭 없이 실제로 누를 수 있어야 한다. 이웃 카드의 겹침이 가리면 실패한다.
    await tile.locator('.tile-enter').click();
    await expect(page.locator('#chipName')).toHaveText(name);
    await page.locator('#studioBackBtn').click();
  }
});

test('PC: 설명은 항상 보이고 호버해도 영상 위치와 크기가 변하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const tile = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  const media = tile.locator('.tile-media');
  const body = tile.locator('.tile-body');
  await expect(body).toBeVisible();
  const before = await media.boundingBox();
  await tile.hover();
  await expect.poll(() => tile.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  const mediaBox = await media.boundingBox();
  const bodyBox = await body.boundingBox();
  // Bumm님이 채택한 무비차트 방향: 영상·설명 자리는 고정하고 재생만 바꾼다.
  for (const key of ['x', 'y', 'width', 'height']) expect(mediaBox[key]).toBeCloseTo(before[key], 0);
  expect(mediaBox.y + mediaBox.height).toBeLessThanOrEqual(bodyBox.y + 1);
  await tile.locator('.tile-enter').click();
  await expect(page.locator('#chipName')).toHaveText('판타지');
});

test('PC: 키보드로 마지막 장면을 선택한 뒤 돌아와도 그 카드가 보인다', async ({ page }) => {
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
