import { test, expect } from '@playwright/test';

// 완성 화면(10/20 대표님 PC 시사): 왼쪽 그림은 QR이 생기기 전·후 같은 크기이고 오른쪽 높이에 맞춘다. 그림 위에는
// 왼쪽 InKY Film Festival·오른쪽 인천광역시교육청 로고, 큰 글자는 영화 제목·그 아래는 장르. QR 위 두 줄과 «내 영화 받기»는
// 없고, «다른 더빙 하기»는 Lucide 아이콘을 앞에 단 좁은 단추다.
const UPLOAD_PATTERN = '**/voiceCinema/upload';

for (const [width, height] of [[1440, 900], [390, 664]]) {
  test(`${width}×${height}: 완성 화면 그림·로고·제목·단추`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(UPLOAD_PATTERN, async (route) => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_result.mp4' }) });
    });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.locator('.tile', { hasText: 'SF' }).first().click();
    const title = await page.locator('#studio h1').innerText();
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
    await page.locator('#saveBtn').click();

    const poster = page.locator('.result-poster');
    await expect(page.locator('#loading')).toBeVisible();
    const before = await poster.boundingBox();
    release();
    await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
    const after = await poster.boundingBox();
    expect(after.width).toBeGreaterThan(200);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);

    await expect(poster.locator('.poster-logo-inky')).toContainText('InKY Film Festival');
    await expect(poster.locator('.poster-logo-inky img')).toHaveAttribute('src', '/brands/inky.png');
    await expect(poster.locator('.poster-logo-education img')).toHaveAttribute('src', '/brands/education.png');
    await expect(poster).not.toContainText('Voice');
    await expect(poster.locator('.poster-credit strong')).toHaveText(title);
    await expect(poster.locator('.poster-credit > span')).toHaveText('SF');

    await expect(page.locator('#savemode')).toHaveCount(0);
    await expect(page.locator('#result')).not.toContainText('11월 30일');
    await expect(page.locator('#qrbox')).not.toContainText('내 영화 받기');
    const home = page.locator('#doneHomeBtn');
    await expect(home).toHaveText('다른 더빙 하기');
    await expect(home.locator('svg.action-icon')).toHaveCount(1);
    // «다른 더빙 하기»는 모든 폭에서 좁은 보조 단추(흰 바탕·테두리) — 빨간 주 단추는 «내 영화 열기» 하나(10/21 팀장 검수)
    const look = await home.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderTopWidth }; });
    expect(look.bg).toBe('rgb(255, 255, 255)');
    expect(parseFloat(look.border)).toBeGreaterThan(0);
    const detailsWidth = await page.locator('.result-details').evaluate((el) => el.clientWidth);
    expect((await home.boundingBox()).width).toBeLessThan(detailsWidth * .75);
    // QR 안내 문장은 한 줄(«있어요»만 아랫줄로 떨어지지 않게)
    const msgLines = await page.locator('#doneMsg').evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(msgLines).toBe(1);
    if (width > 760) {
      // 단추는 글자 폭만큼, 그림은 오른쪽 내용 높이에 맞춘다
      const details = await page.locator('.result-details').evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: el.clientWidth, content: el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) };
      });
      expect((await home.boundingBox()).width).toBeLessThan(details.width * .6);
      expect(Math.abs(after.height - details.content)).toBeLessThanOrEqual(40);
    }
  });
}
