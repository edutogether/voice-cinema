import { test, expect } from '@playwright/test';

test('화살표 호버는 장면을 유지하며 클릭할 때만 한 장씩 순환한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const current = page.locator('.scene-shell.is-current');
  const next = page.getByRole('button', { name: '다음 장면', exact: true });
  await next.hover();
  await page.clock.runFor(12000);
  await expect(current).toHaveAttribute('data-index', '0');
  for (const index of [1, 2, 3, 4, 5, 0]) {
    await next.click();
    await page.clock.runFor(2000);
    await expect(current).toHaveAttribute('data-index', String(index));
  }
  const previous = page.getByRole('button', { name: '이전 장면', exact: true });
  await previous.hover();
  await page.clock.runFor(6000);
  await expect(current).toHaveAttribute('data-index', '0');
  await previous.click();
  await expect(current).toHaveAttribute('data-index', '5');
});

test('큰 장면에 머무르면 영상은 재생하고 자동 넘김만 멈추며 이탈 후 6초 뒤 재개한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const current = page.locator('.scene-shell.is-current');
  await expect.poll(() => current.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await current.locator('.tile-media').hover();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.clock.runFor(18000);
  await expect(current).toHaveAttribute('data-index', '0');
  expect(await current.locator('video').evaluate(v => !v.paused && v.muted)).toBe(true);
  await page.mouse.move(1, 1);
  await page.clock.runFor(5900);
  await expect(current).toHaveAttribute('data-index', '0');
  await page.clock.runFor(100);
  await expect(current).toHaveAttribute('data-index', '1');
});

test('키보드와 움직임 줄이기에서도 화살표를 눌러 장면을 고를 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const current = page.locator('.scene-shell.is-current');
  const next = page.getByRole('button', { name: '다음 장면', exact: true });
  await next.hover();
  await expect(current).toHaveAttribute('data-index', '0');
  await next.click();
  await expect(current).toHaveAttribute('data-index', '1');
  await next.press('Enter');
  await expect(current).toHaveAttribute('data-index', '2');
  await next.press('ArrowLeft');
  await expect(current).toHaveAttribute('data-index', '1');
});
