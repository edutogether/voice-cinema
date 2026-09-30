import { test, expect } from '@playwright/test';

for (const [width, height, touch] of [[1366, 768, false], [1920, 1080, false], [655, 760, false], [1024, 768, true], [375, 812, true], [360, 640, true]]) {
  test(`${width}×${height}: 여섯 장면 선택지와 이름이 첫 화면에 모두 보인다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // PC 입체 미리보기 아래의 여섯 바로가기가 모두 보여야 한다. 터치는 카드 자체를 고른다.
    const tiles = page.locator(touch ? '.tile' : '.scene-choice');
    await expect(tiles).toHaveCount(6);
    for (const tile of await tiles.all()) {
      await expect(tile).toBeInViewport({ ratio: 1 });
      const name = tile.locator(touch ? '.gname' : 'span');
      await expect(name).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    await page.close();
  });
}

test('PC: 스쳐간 카드는 다운로드하지 않고 머문 카드만 경량 영상을 사용한다', async ({ page }) => {
  const clips = [];
  page.on('request', request => { if (/\/clips\/.*\.mp4/.test(request.url())) clips.push(request.url()); });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const tile = page.locator('.tile').first();
  const box = await tile.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(200);
  expect(clips).toEqual([]);
  await tile.hover();
  await expect.poll(() => tile.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  expect(clips.length).toBeGreaterThan(0);
  expect(clips.every(url => url.includes('/clips/previews/'))).toBe(true);
  expect(await tile.locator('video').evaluate(v => v.videoWidth)).toBe(640);
  await tile.click();
  await expect(page.locator('#clip')).toHaveAttribute('src', '/clips/fantasy.mp4');
  await expect(tile.locator('video')).not.toHaveAttribute('src');
});
