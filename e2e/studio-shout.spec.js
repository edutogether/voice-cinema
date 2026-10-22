import { test, expect } from '@playwright/test';

// 아이가 외칠 말(V-g, 10/19 대표님 «띄워»): 멈춘 뒤 «내 차례»·3·2·1·녹음 중에만 크게 보인다.
// PC·태블릿·가로 화면은 영상 아래쪽 가운데. 세로 휴대폰은 영상이 화면 폭 16:9라 안내 글 자리에 덮어 보이고,
// 멈춘 뒤에도 영상·단추 덩어리가 움직이지 않는다(10/22).
const LONGEST = ['드라마', '할머니, 사진 속 아빠 기억나요 ?'];

for (const [width, height] of [[1440, 900], [1280, 720], [768, 1024], [844, 390], [390, 664], [360, 640], [430, 932]]) {
  test(`${width}×${height}: 가장 긴 외칠 말도 두 줄 이내로 놓이고 3·2·1과 겹치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: `${LONGEST[0]} 더빙 시작`, exact: true }).click();
    const phone = width <= 600 && height > width;
    const place = phone ? 'dock' : 'screen';
    const layout = () => page.evaluate(() => { const f = document.querySelector('.studio-video-frame').getBoundingClientRect(); const a = document.querySelector('.record-actions').getBoundingClientRect(); return { frameTop: Math.round(f.top), frameHeight: Math.round(f.height), actionsTop: Math.round(a.top) }; });
    // 녹음실에 들어가는 효과(크기 변화)가 끝난 뒤에 잰다
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    const idle = await layout();
    await page.locator('#recBtn').click();
    const shown = page.getByTestId(`studio-shout-${place}`);
    const hidden = page.getByTestId(`studio-shout-${phone ? 'screen' : 'dock'}`);
    const overlaps = (target) => page.evaluate(([sel, place]) => {
      const s = document.querySelector(`[data-testid="studio-shout-${place}"]`).getBoundingClientRect();
      const c = document.querySelector(sel).getBoundingClientRect();
      return !(s.bottom <= c.top || s.top >= c.bottom || s.right <= c.left || s.left >= c.right);
    }, [target, place]);
    await expect(page.locator('#cue')).toBeVisible({ timeout: 12000 });
    await expect(shown).toBeVisible();
    expect(await overlaps('#cue strong')).toBe(false);
    await expect(page.locator('#count')).toBeVisible({ timeout: 5000 });
    await expect(shown).toBeVisible();
    await expect(shown.locator('strong')).toHaveText(`“${LONGEST[1]}”`);
    await expect(hidden).toBeHidden();
    const box = await page.evaluate((where) => {
      const el = document.querySelector(`[data-testid="studio-shout-${where}"]`);
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
      const copy = document.querySelector('.controls-copy').getBoundingClientRect();
      const overlap = !(s.bottom <= count.top || s.top >= count.bottom || s.right <= count.left || s.left >= count.right);
      return {
        fontSize: parseFloat(st.fontSize), lines: Math.round(strong.getBoundingClientRect().height / parseFloat(st.lineHeight)),
        overlap, insideVideo: s.top >= video.top && s.bottom <= video.bottom && s.left >= video.left && s.right <= video.right,
        // 안내 글 자리를 덮되 밖으로 넘치지 않는다(가장 긴 외칠 말 두 줄까지)
        insideCopy: s.top >= copy.top - 1 && s.bottom <= copy.bottom + 1 && s.left >= copy.left - 1 && s.right <= copy.right + 1,
        clipped: el.scrollHeight > el.clientHeight + 1,
        pageWidth: document.documentElement.scrollWidth, recBtnBottom: recBtn.bottom,
      };
    }, place);
    expect(box.fontSize).toBeGreaterThanOrEqual(18);
    expect(box.lines).toBeLessThanOrEqual(2);
    expect(box.overlap).toBe(false);
    expect(box.pageWidth).toBeLessThanOrEqual(width);
    if (phone) {
      // 안내 글 자리 안에 들고, 멈춘 뒤에도 영상·단추 자리가 그대로이며, 단추는 화면 안이다
      expect(box.insideCopy).toBe(true);
      expect(box.clipped).toBe(false);
      expect(await layout()).toEqual(idle);
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
