import { test, expect } from '@playwright/test';

// 아이가 외칠 말(V-g, 10/19 대표님 «띄워»): 멈춘 뒤 «내 차례»·3·2·1·녹음 중에만 크게 보인다.
// PC·태블릿·가로 화면은 영상 아래쪽 가운데, 세로 휴대폰은 영상이 작아 3·2·1과 겹치므로 영상 바로 아래 설명 자리에 둔다.
const LONGEST = ['드라마', '할머니, 사진 속 아빠 기억나요 ?'];

const visibleShout = (page, width, height) => {
  const dock = width <= 600 && height > width;
  return { shown: page.getByTestId(`studio-shout-${dock ? 'dock' : 'screen'}`), hidden: page.getByTestId(`studio-shout-${dock ? 'screen' : 'dock'}`), dock };
};

for (const [width, height] of [[1440, 900], [1280, 720], [768, 1024], [844, 390], [390, 664], [360, 640]]) {
  test(`${width}×${height}: 가장 긴 외칠 말도 두 줄 이내로 놓이고 3·2·1과 겹치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: `${LONGEST[0]} 더빙 시작`, exact: true }).click();
    await page.locator('#recBtn').click();
    const { shown, hidden, dock } = visibleShout(page, width, height);
    const overlaps = (target) => page.evaluate(([sel, place]) => {
      const s = document.querySelector(`[data-testid="studio-shout-${place}"]`).getBoundingClientRect();
      const c = document.querySelector(sel).getBoundingClientRect();
      return !(s.bottom <= c.top || s.top >= c.bottom || s.right <= c.left || s.left >= c.right);
    }, [target, dock ? 'dock' : 'screen']);
    await expect(page.locator('#cue')).toBeVisible({ timeout: 12000 });
    await expect(shown).toBeVisible();
    expect(await overlaps('#cue strong')).toBe(false);
    await expect(page.locator('#count')).toBeVisible({ timeout: 5000 });
    await expect(shown).toBeVisible();
    await expect(shown.locator('strong')).toHaveText(`“${LONGEST[1]}”`);
    await expect(hidden).toBeHidden();
    const box = await page.evaluate((dockPlace) => {
      const el = document.querySelector(`[data-testid="studio-shout-${dockPlace ? 'dock' : 'screen'}"]`);
      const s = el.getBoundingClientRect();
      const strong = el.querySelector('strong');
      const st = getComputedStyle(strong);
      const clip = document.querySelector('#clip');
      const v = clip.getBoundingClientRect();
      // 세로 화면은 영상이 16:9로 가운데 놓인다(contain) — 실제 그림이 그려지는 칸을 계산한다.
      const contain = getComputedStyle(clip).objectFit === 'contain';
      const ph = contain ? Math.min(v.height, v.width * 9 / 16) : v.height;
      const pw = contain ? ph * 16 / 9 : v.width;
      const video = { top: v.top + (v.height - ph) / 2, bottom: v.top + (v.height + ph) / 2, left: v.left + (v.width - pw) / 2, right: v.left + (v.width + pw) / 2 };
      const count = document.querySelector('#count').getBoundingClientRect();
      const recBtn = document.querySelector('#recBtn').getBoundingClientRect();
      const overlap = !(s.bottom <= count.top || s.top >= count.bottom || s.right <= count.left || s.left >= count.right);
      return {
        fontSize: parseFloat(st.fontSize), lines: Math.round(strong.getBoundingClientRect().height / parseFloat(st.lineHeight)),
        overlap, insideVideo: s.top >= video.top && s.bottom <= video.bottom && s.left >= video.left && s.right <= video.right,
        belowVideo: s.top >= video.bottom, pageWidth: document.documentElement.scrollWidth, recBtnBottom: recBtn.bottom,
      };
    }, dock);
    expect(box.fontSize).toBeGreaterThanOrEqual(18);
    expect(box.lines).toBeLessThanOrEqual(2);
    expect(box.overlap).toBe(false);
    expect(box.pageWidth).toBeLessThanOrEqual(width);
    if (dock) {
      expect(box.belowVideo).toBe(true);
      expect(box.recBtnBottom).toBeLessThanOrEqual(height);
    } else {
      expect(box.insideVideo).toBe(true);
    }
  });
}

test('외칠 말은 장면이 흐를 때는 없고, 멈춘 뒤부터 녹음이 끝날 때까지만 보인다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '애니메이션 더빙 시작', exact: true }).click();
  const shout = page.getByTestId('studio-shout-screen');
  await expect(shout).toHaveCount(0);
  await page.locator('#recBtn').click();
  await expect(page.getByTestId('scene-caption')).toHaveText('준비됐어 ? 하나, 둘…', { timeout: 6000 });
  await expect(shout).toHaveCount(0);
  await expect(page.locator('#cue')).toBeVisible({ timeout: 8000 });
  await expect(shout).toHaveText('외쳐 보세요“셋 ! 날아라, 미르 !”');
  await expect(page.locator('#count')).toBeVisible();
  await expect(shout).toBeVisible();
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 5000 });
  await expect(shout).toBeVisible();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  await expect(shout).toHaveCount(0);
});
