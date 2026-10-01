import { test, expect } from '@playwright/test';

test('아무 입력 없이 실제 시간으로 01·02·03 장면이 자동 재생된다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  for (const index of [0, 1, 2]) {
    const current = page.locator('.scene-shell.is-current');
    await expect(current).toHaveAttribute('data-index', String(index), { timeout: 8500 });
    await expect.poll(() => current.locator('video').evaluate(v => !v.paused && v.currentTime > .1)).toBe(true);
    expect(await current.locator('video').evaluate(v => v.muted)).toBe(true);
  }
});

test('마우스 없이 첫 장면을 재생하고 여섯 장면을 순서대로 순환한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const current = page.locator('.scene-shell.is-current');
  await expect(current).toHaveAttribute('data-index', '0');
  await expect.poll(() => current.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  expect(await current.locator('video').evaluate(v => v.muted)).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  // 사용자 선택 뒤에는 그 장면을 볼 시간을 다시 부여한다.
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  await page.mouse.move(1, 1);
  await expect(current).toHaveAttribute('data-index', '1');
  let elapsed = 0;
  for (const index of [2, 3, 4, 5, 0]) {
    await page.clock.runFor(5900 - elapsed);
    await expect(current).not.toHaveAttribute('data-index', String(index));
    await page.clock.runFor(100);
    await expect(current).toHaveAttribute('data-index', String(index));
    await page.clock.runFor(160);
    await expect(page.locator('.tile video[src]')).toHaveCount(1);
    await expect(current.locator('video')).toHaveAttribute('src', /\/clips\/previews\/.+\.mp4/);
    // 다음 간격에서 자원 해제 확인에 쓴 시간을 제외한다.
    elapsed = 160;
  }
});

test('자동 넘김을 멈추거나 녹음실에 들어가면 장면이 저절로 바뀌지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: '장면 자동 넘김 일시정지', exact: true }).click();
  await page.mouse.move(1, 1);
  await page.clock.runFor(12000);
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '0');
  await page.getByRole('button', { name: '장면 자동 넘김 재생', exact: true }).click();
  await page.mouse.move(1, 1);
  await page.clock.runFor(6000);
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '1');
  await page.getByRole('button', { name: '애니메이션 더빙 시작', exact: true }).press('Enter');
  await page.clock.runFor(12000);
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '1');
  await expect(page.locator('.tile video[src]')).toHaveCount(0);
});
