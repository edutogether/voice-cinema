import { test, expect } from '@playwright/test';

for (const [width, height, touch] of [[1366, 768, false], [1920, 1080, false], [655, 760, false], [1024, 768, true], [375, 812, true], [360, 640, true]]) {
  test(`${width}×${height}: 여섯 장면 선택지와 이름이 첫 화면에 모두 보인다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // PC 입체 미리보기 아래의 여섯 바로가기가 모두 보여야 한다. 터치는 카드 자체를 고른다.
    const tiles = page.locator(touch ? '.tile' : '.scene-choice');
    await expect(tiles).toHaveCount(6);
    if (touch) {
      for (const tile of await tiles.all()) {
        await expect(tile).toBeInViewport({ ratio: 1 });
        await expect(tile.locator('.gname')).toBeInViewport({ ratio: 1 });
      }
    } else {
      // 흐르는 줄은 순환용 사본까지 포함해 각 장르의 온전한 선택지가 하나 이상 보여야 한다.
      expect(await page.locator('.scene-choices').evaluate(view => {
        const bounds = view.getBoundingClientRect();
        const visible = [...view.querySelectorAll('.scene-choice-card')].filter(card => {
          const r = card.getBoundingClientRect();
          return r.left >= bounds.left && r.right <= bounds.right && r.bottom <= window.innerHeight;
        });
        return new Set(visible.map(card => card.dataset.genre)).size;
      })).toBe(6);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    await page.close();
  });
}

test('PC: 선택한 카드만 경량 영상으로 재생하고 녹음실 진입 시 해제한다', async ({ page }) => {
  const clips = [];
  page.on('request', request => { if (/\/clips\/.*\.mp4/.test(request.url())) clips.push(request.url()); });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  expect(clips).toEqual([]);
  const tile = page.locator('.tile').first();
  await tile.hover();
  await expect.poll(() => tile.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  expect(clips.length).toBeGreaterThan(0);
  expect(clips.every(url => url.includes('/clips/previews/'))).toBe(true);
  expect(await tile.locator('video').evaluate(v => v.videoWidth)).toBe(640);
  await tile.click();
  await expect(page.locator('#clip')).toHaveAttribute('src', '/clips/fantasy.mp4');
  await expect(tile.locator('video')).not.toHaveAttribute('src');
});


for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
  test(`${width}×${height}: 왼쪽 제목은 한 줄이고 작은 마이크는 소개 위에 왼쪽 정렬된다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    const layout = await page.evaluate(() => {
      const title = document.querySelector('.chart-invitation em');
      const range = document.createRange();
      range.selectNodeContents(title);
      const img = document.querySelector('.chart-invitation img').getBoundingClientRect();
      const label = document.querySelector('.chart-label').getBoundingClientRect();
      const aside = document.querySelector('.chart-aside').getBoundingClientRect();
      return { lines: range.getClientRects().length, right: title.getBoundingClientRect().right, asideRight: aside.right, imgX: img.x, labelX: label.x, imgBottom: img.bottom, labelTop: label.top, size: img.width };
    });
    expect(layout.lines).toBe(1);
    expect(layout.right).toBeLessThan(layout.asideRight);
    expect(layout.imgX).toBeCloseTo(layout.labelX, 0);
    expect(layout.imgBottom).toBeLessThan(layout.labelTop);
    expect(layout.size).toBeLessThanOrEqual(72);
    await page.screenshot({ path: `tmp/apple-layout-${width}.png` });
  });
}
