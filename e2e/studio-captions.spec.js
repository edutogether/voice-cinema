import { test, expect } from '@playwright/test';

// 장면 더빙 2.0 상대 대사 자막(app-plan §2-3): 넷플릭스식 — 영상 안 아래 가운데, 영상 폭 80% 안, 두 줄 이내,
// 영상 높이의 약 5%(최소 14px). 멈춤 뒤 문구·카운트다운·녹음 중에는 없고, 미리보기 · 장면 · 다시 녹음의 1.6~3.4초에 나온다(10/20 «다시 듣기» 없앰).
// 11/14 히어로가 20.6초 완성본(«네가 멈춰, 지금 !», 4.5초)으로 바뀌어 가장 긴 대사는 스릴러다(한글 8자 + 쉼표 · 느낌표)
const LONGEST = ['스릴러', '레이저 바뀐다, 천천히 !'];

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

test('자막은 미리보기 · 장면 · 다시 녹음의 1.6~3.4초에 나오고, 멈춘 뒤 문구·카운트다운·녹음 중에는 없다', async ({ page }) => {
  test.setTimeout(120000); // 두 번 녹음한다(한 번에 약 18초)
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  const caption = page.getByTestId('scene-caption');
  // 들어가면 흐르는 미리보기(11/7)에서도 나온다
  await expect(caption).toHaveText('저 산… 움직여 !', { timeout: 6000 });
  await page.locator('#recBtn').click();
  await expect(caption).toHaveText('저 산… 움직여 !', { timeout: 6000 });
  // 문구 1초 · 숫자 1초씩(11/8) — 페이지 안에서 매 화면 확인하는 waitFor로 기다린다
  await page.locator('#cue').waitFor({ timeout: 8000 });
  await expect(caption).toHaveCount(0);
  await page.locator('#count').waitFor({ timeout: 3000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 8000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  // «다시 녹음»은 처음부터 다시 흐르므로(11/8) 자막도 다시 나온다
  await page.locator('#resetBtn').click();
  await expect(caption).toHaveText('저 산… 움직여 !', { timeout: 6000 });
});
