import { test, expect } from '@playwright/test';

for (const origin of ['중앙 카드', '아래 썸네일']) {
  test(`${origin}에서 누른 영상이 비율을 유지하며 녹음실로 확대된다`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '장면 흐름 일시정지', exact: true }).click();
    const button = origin === '중앙 카드' ? page.locator('.scene-shell.is-current .tile') : page.locator('.scene-choice').filter({ hasText: '드라마' }).first();
    const media = button.locator(origin === '중앙 카드' ? '.tile-media' : 'img');
    const source = await media.boundingBox();
    await button.click();
    const start = await page.locator('.studio-entrance').evaluate(el => {
      const animation = el.getAnimations()[0];
      animation.pause();
      animation.currentTime = 0;
      const style = getComputedStyle(el);
      const matrix = new window.DOMMatrixReadOnly(style.transform);
      const insets = style.clipPath.match(/inset\(([-\d.]+)px ([-\d.]+)px/);
      const rect = el.getBoundingClientRect();
      return { x: rect.x + Number(insets[2]) * matrix.a, y: rect.y + Number(insets[1]) * matrix.d,
        width: rect.width - 2 * Number(insets[2]) * matrix.a, height: rect.height - 2 * Number(insets[1]) * matrix.d,
        scaleX: matrix.a, scaleY: matrix.d };
    });
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(start[key] - source[key])).toBeLessThan(2);
    expect(start.scaleX).toBeCloseTo(start.scaleY, 5);
    const middle = await page.locator('.studio-entrance').evaluate(el => {
      el.getAnimations()[0].currentTime = 180;
      return new window.DOMMatrixReadOnly(getComputedStyle(el).transform).a;
    });
    expect(middle).toBeGreaterThan(start.scaleX);
    expect(middle).toBeLessThan(1);
    await page.locator('.studio-entrance').evaluate(el => el.getAnimations()[0].finish());
    await expect(page.locator('.studio-entrance')).toBeHidden();
    await expect(page.locator('.studio-video-frame')).toBeVisible();
    await expect(page.locator('#previewBtn')).toBeEnabled();
  });
}

test('움직임 줄이기에서는 확대 없이 표시하고 진입 도중 뒤로가기도 정리된다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  await expect(page.locator('.studio-entrance')).toHaveCount(0);
  await expect(page.locator('.studio-video-frame')).toBeVisible();
  await page.goBack();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  await page.goBack();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('.studio-entrance')).toHaveCount(0);
});
