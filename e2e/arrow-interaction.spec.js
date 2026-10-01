import { test, expect } from '@playwright/test';

test('자동 넘김 정지 중 화살표 호버는 이동하지 않고 클릭할 때만 한 장씩 순환한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '장면 자동 넘김 일시정지', exact: true }).click();
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

test('중앙 카드의 영상·제목·더빙하기 위에서만 자동 넘김을 멈추고 이탈 후 재개한다', async ({ page }) => {
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
  for (const selector of ['.gname', '.tile-enter']) {
    await current.locator(selector).hover();
    await page.clock.runFor(12000);
    await expect(current).toHaveAttribute('data-index', '0');
  }
  await page.mouse.move(1, 1);
  await page.clock.runFor(5900);
  await expect(current).toHaveAttribute('data-index', '0');
  await page.clock.runFor(100);
  await expect(current).toHaveAttribute('data-index', '1');
});

for (const area of ['left', 'right', 'top', 'bottom']) {
  test(`중앙 카드 밖 ${area} 영역에 마우스가 있어도 자동 순환한다`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.locator('.scene-shell.is-current .tile-media').hover();
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const point = await page.locator('.scene-stage').evaluate((el, area) => {
      const r = el.getBoundingClientRect();
      return {
        x: area === 'left' ? r.left + 4 : area === 'right' ? r.right - 4 : r.x + r.width / 2,
        y: area === 'top' ? r.top + 2 : area === 'bottom' ? r.bottom - 2 : r.y + r.height / 3,
      };
    }, area);
    await page.mouse.move(point.x, point.y);
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.scene-shell.is-current'), point)).toBe(false);
    const current = page.locator('.scene-shell.is-current');
    await page.clock.runFor(5900);
    await expect(current).toHaveAttribute('data-index', '0');
    await page.clock.runFor(100);
    await expect(current).toHaveAttribute('data-index', '1');
    await page.clock.runFor(6000);
    await expect(current).toHaveAttribute('data-index', '2');
  });
}

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
