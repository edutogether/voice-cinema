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

test('마우스 없이 첫 장면을 재생하고 여덟 장면을 순서대로 순환한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const current = page.locator('.scene-shell.is-current');
  await expect(current).toHaveAttribute('data-index', '0');
  await expect.poll(() => current.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  expect(await current.locator('video').evaluate(v => v.muted)).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  // 앱은 6초를 가운데 미리보기의 playing(또는 error) 이벤트부터 센다(SceneCarousel.tsx) — 검사도 그 이벤트의 가짜 시각부터 센다.
  // 재생이 시작된 것을 «검사가 본 때»부터 세면, 가짜 시계를 돌리는 사이(runFor) 실제 시간으로 재생이 시작된 장면은 6초가 이미 흘러 있어
  // 5.7초에 벌써 넘어가 있었다(10/24 · 10/26 전체 E2E, 7·8번째 장면). 앱과 같은 규칙(가운데 장면, 첫 이벤트)으로 적는다.
  await page.evaluate(() => {
    window.__previewStart = {};
    const mark = (event) => {
      const shell = event.target.closest?.('.scene-shell');
      if (shell?.classList.contains('is-current') && !(shell.dataset.index in window.__previewStart)) window.__previewStart[shell.dataset.index] = Date.now();
    };
    const stage = document.querySelector('.scene-stage');
    stage.addEventListener('playing', mark, true);
    stage.addEventListener('error', mark, true);
  });
  // 사용자 선택 뒤에는 그 장면을 볼 시간을 다시 부여한다.
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  await page.mouse.move(1, 1);
  await expect(current).toHaveAttribute('data-index', '1');
  for (const index of [2, 3, 4, 5, 6, 7, 0]) {
    // 6초는 가운데 미리보기가 실제로 재생된 때부터 센다(10/24 ⑧) — 그 이벤트의 가짜 시각에서 5.7초에는 아직, 6.3초에는 넘어가 있는지 본다.
    const showing = String((index + 7) % 8);
    await expect.poll(() => page.evaluate((i) => window.__previewStart[i] ?? null, showing)).not.toBeNull();
    await expect.poll(() => current.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.05);
    const counted = await page.evaluate((i) => Date.now() - window.__previewStart[i], showing);
    expect(counted).toBeLessThan(5700);
    await page.clock.runFor(5700 - counted);
    await expect(current).not.toHaveAttribute('data-index', String(index));
    await page.clock.runFor(600);
    await expect(current).toHaveAttribute('data-index', String(index));
    await page.clock.runFor(160);
    await expect(page.locator('.tile video[src]')).toHaveCount(1);
    await expect(current.locator('video')).toHaveAttribute('src', /\/clips\/previews\/.+\.mp4/);
  }
});

test('가운데 미리보기가 재생되기 전에는 6초가 지나도 넘기지 않고, 끝내 안 뜨면 30초 뒤에 넘긴다(10/24 ⑧)', async ({ browser }) => {
  // 서비스워커를 막아야 가로채기가 듣는다(서비스워커가 받는 요청은 page.route를 거치지 않는다)
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  // 첫 장면(SF)의 미리보기를 끝내 보내지 않는다 — 느린 와이파이에서 미리보기가 아직 안 뜬 모양
  await page.route('**/clips/previews/sf.mp4*', () => {});
  // 첫 장면의 타이머도 가짜 시계로 잡히게 시계를 먼저 단다
  await page.clock.install();
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.mouse.move(1, 1);
  const current = page.locator('.scene-shell.is-current');
  await expect(current).toHaveAttribute('data-index', '0');
  // 고른 때부터 세던 옛 방식은 6초에 넘겼다
  await page.clock.runFor(12000);
  await expect(current).toHaveAttribute('data-index', '0');
  await page.clock.runFor(18500);
  await expect(current).toHaveAttribute('data-index', '1');
  await context.close();
});

test('멈춤 단추는 없고, 녹음실에 들어가면 장면이 저절로 바뀌지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  // 10/20 대표님 «멈춤을 다 뺀다» — «02 / 08 ⏸»와 그림 띠 ⏸ 모두 없다
  await expect(page.locator('.scene-auto-toggle, .scene-flow-toggle')).toHaveCount(0);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  await page.mouse.move(1, 1);
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '1');
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).press('Enter');
  await page.clock.runFor(12000);
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '1');
  await expect(page.locator('.tile video[src]')).toHaveCount(0);
});
