import { test, expect } from '@playwright/test';

test('PC: 여섯 바로가기로 고른 중앙 장면에서 각각 더빙을 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  for (const name of ['판타지', '애니메이션', '호러', '액션', '드라마', '시트콤']) {
    await page.getByRole('button', { name: `${name} 미리보기 선택`, exact: true }).click();
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

test('PC: 화살표 키로 마지막 장면을 고른 뒤 녹음실에서 돌아와도 선택을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.keyboard.press('Tab');
  const first = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  await expect(first).toBeFocused();
  await expect(first.locator('.tile-body')).toHaveCSS('opacity', '1');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: '시트콤 미리보기 선택' })).toBeFocused();
  const last = page.getByRole('button', { name: '시트콤 더빙 시작', exact: true });
  await last.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#chipName')).toHaveText('시트콤');
  await page.locator('#studioBackBtn').click();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport({ ratio: .9 });
});

test('PC: 다음·이전·드래그로 넘기며 이전 장면의 재생 자원을 놓는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const first = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  await first.hover();
  await expect.poll(() => first.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  await expect(page.getByRole('button', { name: '애니메이션 미리보기 선택' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-genre="fantasy"] video')).not.toHaveAttribute('src');
  await page.getByRole('button', { name: '이전 장면', exact: true }).click();
  await expect(page.getByRole('button', { name: '판타지 미리보기 선택' })).toHaveAttribute('aria-pressed', 'true');
  const box = await first.boundingBox();
  await page.mouse.move(box.x + box.width * .65, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .35, box.y + 70, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: '애니메이션 미리보기 선택' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#home')).toHaveClass(/active/);
});
