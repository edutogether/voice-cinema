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
    await expect(page.locator('.studio-entrance')).toHaveCount(0);
    await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && !v.muted && v.currentTime > 0)).toBe(true);
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


test('카드의 중간 장면은 확대에만 쓰고 실제 플레이어는 처음부터 계속 재생한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '장면 흐름 일시정지', exact: true }).click();
  const tile = page.locator('.scene-shell.is-current .tile');
  await tile.locator('video').evaluate(v => { v.currentTime = 6; });
  await expect.poll(() => tile.locator('video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(6);
  await tile.click();
  await expect(page.locator('.studio-entrance')).toHaveCount(0);
  const clip = page.locator('#clip');
  await expect.poll(() => clip.evaluate(v => !v.paused && !v.muted && v.currentTime > 0)).toBe(true);
  const first = await clip.evaluate(v => v.currentTime);
  expect(first).toBeLessThan(2);
  expect(await clip.getAttribute('poster')).not.toMatch(/^data:/);
  const frames = await clip.evaluate(v => new Promise(resolve => {
    const times = [];
    const frame = (_, metadata) => {
      times.push(metadata.mediaTime);
      if (times.length === 8) resolve(times);
      else v.requestVideoFrameCallback(frame);
    };
    v.requestVideoFrameCallback(frame);
  }));
  expect(frames.at(-1)).toBeGreaterThan(frames[0]);
  await clip.evaluate(v => { v.currentTime = v.duration - .15; });
  await expect(page.locator('#previewBtn')).toHaveText('다시 재생');
  await expect(clip).toHaveJSProperty('ended', true);
  expect(await clip.evaluate(v => v.currentTime)).toBeGreaterThan(10);
  await page.locator('#screenPlaybackBtn').click();
  await expect.poll(() => clip.evaluate(v => !v.paused && v.currentTime > 0 && v.currentTime < 2)).toBe(true);
});

test('자동재생이 거부되어도 재생 버튼으로 복구하고 확대 이미지가 남지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    const play = window.HTMLMediaElement.prototype.play;
    let rejected = false;
    window.HTMLMediaElement.prototype.play = function () {
      if (this.id === 'clip' && !rejected) {
        rejected = true;
        return Promise.reject(new window.DOMException('차단', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  await expect(page.locator('.studio-entrance')).toHaveCount(0);
  await expect(page.locator('#hint')).toHaveText('재생 버튼을 눌러 영상을 시작해 주세요.');
  await expect(page.locator('#previewBtn')).toHaveText('계속 재생');
  await page.locator('#previewBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && !v.muted && v.currentTime > 0)).toBe(true);
});
