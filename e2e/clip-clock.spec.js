import { test, expect } from '@playwright/test';

test('대기는 전체 길이, 장면·이어 재생은 영상 시계를 표시하고 5.0초 멈춤에서는 05:00에 선다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  const clock = page.locator('.clip-time');
  await expect(clock).toHaveText('10:00');
  await page.locator('#recBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  await expect(clock).toHaveText(/^\d{2}:\d{2} \/ 10:00$/);
  await expect(page.locator('#cue')).toBeVisible({ timeout: 10000 });
  await expect(clock).toHaveText('05:00 / 10:00');
  await expect.poll(() => page.locator('#bar').evaluate(bar => new window.DOMMatrixReadOnly(getComputedStyle(bar).transform).a)).toBeCloseTo(.5, 2);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 6000 });
  await expect(clock).toHaveText('05:00 / 10:00');
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'continuing', { timeout: 6000 });
  await expect.poll(async () => (await clock.textContent()) !== '05:00 / 10:00').toBe(true);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 10000 });
  await expect(clock).toHaveText('10:00 / 10:00');
  await expect(page.locator('#progress')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#bar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.locator('#replayBtn').click();
  await expect.poll(async () => (await clock.textContent()).startsWith('00:')).toBe(true);
  await page.locator('#resetBtn').click();
  await expect(clock).toHaveText('10:00');
});

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`${width}×${height}: 진행 막대가 프레임을 따라 움직이고 정지한 영상보다 앞서가지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
    await page.locator('#recBtn').click();
    await expect.poll(() => page.locator('#clip').evaluate(video => video.currentTime)).toBeGreaterThan(.5);
    const sample = await page.evaluate(() => new Promise(resolve => {
      const video = document.querySelector('#clip');
      const bar = document.querySelector('#bar');
      const start = performance.now();
      let frames = 0, changes = 0, previous = -1, maxLag = 0;
      const read = now => {
        const fraction = new window.DOMMatrixReadOnly(getComputedStyle(bar).transform).a;
        frames++;
        if (Math.abs(fraction - previous) > .00001) changes++;
        previous = fraction;
        maxLag = Math.max(maxLag, Math.abs(fraction * video.duration - video.currentTime));
        if (now - start < 1800) requestAnimationFrame(read);
        else resolve({ frames, changes, maxLag });
      };
      requestAnimationFrame(read);
    }));
    // 0.25초 단위 점프가 되살아나면 대부분의 프레임에서 값이 같아져 실패한다.
    expect(sample.changes / sample.frames).toBeGreaterThan(.5);
    expect(sample.maxLag).toBeLessThan(.1);
    // 5.0초 멈춤 동안 막대는 움직이지 않는다.
    await expect(page.locator('#cue')).toBeVisible({ timeout: 8000 });
    const read = () => page.locator('#bar').evaluate(bar => getComputedStyle(bar).transform);
    const paused = await read();
    await page.waitForTimeout(300);
    expect(await read()).toBe(paused);
  });
}
