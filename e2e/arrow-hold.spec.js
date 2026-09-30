import { test, expect } from '@playwright/test';

test('화살표에 머무르면 일정한 간격으로 순환하고 벗어나면 멈춘다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const current = page.locator('.scene-shell.is-current');
  await page.getByRole('button', { name: '다음 장면', exact: true }).hover();
  await expect(current).toHaveAttribute('data-index', '1');
  await page.clock.runFor(1700);
  await expect(current).toHaveAttribute('data-index', '1');
  await page.clock.runFor(100);
  await expect(current).toHaveAttribute('data-index', '2');
  for (const index of [3, 4, 5, 0]) {
    await page.clock.runFor(1800);
    await expect(current).toHaveAttribute('data-index', String(index));
  }
  await page.mouse.move(1, 1);
  await page.clock.runFor(5400);
  await expect(current).toHaveAttribute('data-index', '0');
  await page.getByRole('button', { name: '이전 장면', exact: true }).hover();
  await expect(current).toHaveAttribute('data-index', '5');
  await page.clock.runFor(1800);
  await expect(current).toHaveAttribute('data-index', '4');
});

test('움직임 줄이기와 키보드 전환은 화살표 연속 넘김을 멈춘다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const current = page.locator('.scene-shell.is-current');
  await page.getByRole('button', { name: '다음 장면', exact: true }).hover();
  await expect(current).toHaveAttribute('data-index', '1');
  await page.getByRole('button', { name: '다음 장면', exact: true }).press('ArrowRight');
  await expect(current).toHaveAttribute('data-index', '2');
  await page.clock.runFor(3600);
  await expect(current).toHaveAttribute('data-index', '2');
  await page.mouse.move(1, 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '다음 장면', exact: true }).hover();
  await expect(current).toHaveAttribute('data-index', '3');
  await page.clock.runFor(5400);
  await expect(current).toHaveAttribute('data-index', '3');
});
