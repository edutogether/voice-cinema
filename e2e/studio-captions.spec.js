import { test, expect } from '@playwright/test';

// 장면 더빙 2.0 상대 대사 자막(app-plan §2-3): 넷플릭스식 — 영상 안 아래 가운데, 영상 폭 80% 안, 두 줄 이내,
// 영상 높이의 약 5%(최소 14px). 멈춤 뒤 문구·카운트다운·녹음 중에는 없고, 미리보기에서는 1.6~3.4초에 나온다(10/20 «다시 듣기» 없앰).
const LONGEST = ['히어로', '왼쪽을 봐. 우리가 왔어 !'];

for (const [width, height] of [[1440, 900], [390, 844], [360, 640], [844, 390]]) {
  test(`${width}×${height}: 가장 긴 대사도 영상 안에 두 줄 이내로, 폭 80% 안에 놓인다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: `${LONGEST[0]} 더빙 시작`, exact: true }).click();
    await page.locator('#recBtn').click();
    const caption = page.getByTestId('scene-caption');
    await expect(caption).toHaveText(LONGEST[1], { timeout: 6000 });
    const box = await page.evaluate(() => {
      const video = document.querySelector('#clip');
      const v = video.getBoundingClientRect();
      // 세로 휴대폰은 영상이 16:9로 가운데 놓인다(contain) — 실제 그림이 그려지는 칸을 계산한다.
      const contain = getComputedStyle(video).objectFit === 'contain';
      const pictureHeight = contain ? Math.min(v.height, v.width * 9 / 16) : v.height;
      const pictureWidth = contain ? pictureHeight * 16 / 9 : v.width;
      const top = v.top + (v.height - pictureHeight) / 2;
      const el = document.querySelector('[data-testid="scene-caption"]');
      const c = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        fontSize: parseFloat(s.fontSize), lines: Math.round(c.height / parseFloat(s.lineHeight)),
        widthRatio: c.width / pictureWidth, inside: c.top >= top && c.bottom <= top + pictureHeight,
        bottomGap: (top + pictureHeight - c.bottom) / pictureHeight,
      };
    });
    expect(box.fontSize).toBeGreaterThanOrEqual(14);
    expect(box.lines).toBeLessThanOrEqual(2);
    expect(box.widthRatio).toBeLessThanOrEqual(.81);
    expect(box.inside).toBe(true);
    expect(box.bottomGap).toBeGreaterThan(.03);
    expect(box.bottomGap).toBeLessThan(.2);
  });
}

test('자막은 멈춘 뒤 문구·카운트다운·녹음 중에는 없고, 미리보기의 1.6~3.4초에 나온다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await page.locator('#recBtn').click();
  const caption = page.getByTestId('scene-caption');
  await expect(caption).toHaveText('인사해 봐… 크게 !', { timeout: 6000 });
  await expect(page.locator('#cue')).toBeVisible({ timeout: 8000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#count')).toBeVisible();
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 5000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  await page.locator('#resetBtn').click();
  await page.locator('#previewBtn').click();
  await expect(caption).toHaveText('인사해 봐… 크게 !', { timeout: 6000 });
});
