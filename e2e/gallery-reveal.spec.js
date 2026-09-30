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


test('PC: 옆 장면에 올리면 전환·재생하고 정지한 마우스 아래에서 연속 이동하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  // 겹친 카드의 중심은 중앙 카드에 가려져 있다. 실제로 노출된 오른쪽 영상 위에 올린다.
  const point = await page.evaluate(() => {
    const stage = document.querySelector('.scene-stage').getBoundingClientRect();
    const y = stage.y + stage.height / 3;
    for (let x = stage.right - 2; x > stage.left; x -= 4) {
      if (document.elementFromPoint(x, y)?.closest('.scene-shell')?.dataset.index === '1') return { x, y };
    }
    return null;
  });
  expect(point, '오른쪽 장면이 가려져 호버할 수 없다').not.toBeNull();
  await page.mouse.move(point.x, point.y);
  const choice = page.getByRole('button', { name: '애니메이션 미리보기 선택' });
  const video = page.locator('[data-genre="animation"] video');
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  const before = await video.evaluate(v => v.currentTime);
  await page.waitForTimeout(700);
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThan(before);
  expect(await page.locator('.tile video[src]').count()).toBe(1);
});

test('PC: 썸네일 호버 즉시 재생을 요청하고 빠르게 훑은 뒤 마지막 선택만 재생한다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__previewTiming = [];
    let entered = 0;
    document.addEventListener('pointerover', event => {
      if (event.target.closest?.('.scene-choice')) entered = performance.now();
    }, true);
    const original = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = function () {
      if (this.closest('.tile') && entered) window.__previewTiming.push(performance.now() - entered);
      return original.call(this);
    };
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  for (const name of ['애니메이션', '호러', '액션', '드라마', '시트콤']) {
    await page.getByRole('button', { name: `${name} 미리보기 선택` }).hover();
    await expect(page.getByRole('button', { name: `${name} 미리보기 선택` })).toHaveAttribute('aria-pressed', 'true');
  }
  const video = page.locator('[data-genre="sitcom"] video');
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  const timing = await page.evaluate(() => window.__previewTiming);
  expect(timing.length).toBeGreaterThanOrEqual(5);
  // 기존 280ms 대기를 제거했다. 다운로드 완료 시간과 재생 요청 시점은 구분한다.
  expect(timing[0]).toBeLessThan(200);
  expect(await page.locator('.tile video[src]').count()).toBe(1);
  await expect(page.locator('.tile video[src]')).toHaveAttribute('src', '/clips/previews/sitcom.mp4');
  await page.getByRole('button', { name: '시트콤 더빙 시작', exact: true }).click();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('.tile video[src]')).toHaveCount(0);
  expect(await page.locator('.tile video').evaluateAll(videos => videos.every(v => v.paused))).toBe(true);
});
