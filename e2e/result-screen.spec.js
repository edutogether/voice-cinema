import { test, expect } from '@playwright/test';

// 완성 화면(10/20 대표님 PC 시사): 왼쪽 그림은 QR이 생기기 전·후 같은 크기이고 오른쪽 높이에 맞춘다. 그림 위에는
// 왼쪽 InKY Film Festival·오른쪽 인천광역시교육청 로고, 큰 글자는 영화 제목·그 아래는 장르. QR 위 두 줄과 «내 영화 받기»는
// 없고, «다른 더빙 하기»는 Lucide 아이콘을 앞에 단 좁은 단추다.
const UPLOAD_PATTERN = '**/voiceCinema/upload';

for (const [width, height] of [[1440, 900], [768, 1024], [390, 664]]) {
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
    // «개인정보처리방침» 줄이 그림 위에 얹히지 않는다 — 휴대폰에서 글자가 그림 위 가장자리에 닿아 있었다(11/8 해상도 전수)
    const link = await page.locator('#result .privacylink').boundingBox();
    if (link.x + link.width > after.x && link.x < after.x + after.width) expect(after.y, '방침 링크 줄이 그림에 얹혔다').toBeGreaterThanOrEqual(link.y + link.height - 1);
    await expect(page.locator('#result .download-link'), '설치 파일 아이콘은 첫 화면에만 있다').toHaveCount(0);
    expect(after.width).toBeGreaterThan(200);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);

    await expect(poster.locator('.poster-logo-inky')).toContainText('InKY Film Festival');
    await expect(poster.locator('.poster-logo-inky img')).toHaveAttribute('src', '/brands/inky.png');
    await expect(poster.locator('.poster-logo-education img')).toHaveAttribute('src', '/brands/education-white.svg');
    // 두 로고는 흰 둥근 바탕 없이 흰 로고만 얹는다(11/8 Bumm님 «방송국 로고처럼») — 교육청은 공식 CI를 모양 그대로 흰색으로 반전한 벡터
    for (const logo of ['.poster-logo-inky', '.poster-logo-education']) {
      expect(await poster.locator(logo).evaluate((el) => getComputedStyle(el).backgroundColor), logo).toBe('rgba(0, 0, 0, 0)');
    }
    expect(await poster.locator('.poster-logo-inky').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await poster.locator('.poster-logo-education img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(poster).not.toContainText('Voice');
    await expect(poster.locator('.poster-credit strong')).toHaveText(title);
    await expect(poster.locator('.poster-credit > span')).toHaveText('SF');
    // 그림 위 두 로고는 겹치지 않는다 — 패드 세로(768)에서 교육청 로고가 «InKY Film Festival» 끝을 가렸다(11/2 해상도 전수)
    const inky = await poster.locator('.poster-logo-inky').boundingBox();
    const education = await poster.locator('.poster-logo-education').boundingBox();
    expect(inky.x + inky.width).toBeLessThan(education.x);

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
    if (width > 900) {
      // 넓은 두 칸 화면: 단추는 글자 폭만큼, 그림은 오른쪽 내용 높이에 맞춘다
      const details = await page.locator('.result-details').evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: el.clientWidth, content: el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) };
      });
      expect((await home.boundingBox()).width).toBeLessThan(details.width * .6);
      expect(Math.abs(after.height - details.content)).toBeLessThanOrEqual(40);
    }
    if (width > 600 && height > 700) {
      // 그림 · 글 덩어리는 머리글과 바닥글 글자 사이 세로 가운데에 있다 — 카드 위 1몫 · 아래 2몫으로 나뉘어 아래가 비었다
      // (11/8 Bumm님 «아래쪽이 너무 비어 보입니다», 2560×1369에서 위 170 · 아래 340px). 휴대폰 · 낮은 창은 위에서 시작한다
      const gap = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const footer = document.querySelector('#result .workflow-footer');
        const top = Math.min(r('#result .result-poster').top, r('#result .result-details').top);
        const bottom = Math.max(r('#result .result-poster').bottom, r('#result .result-details').bottom);
        return { above: top - r('#result .festival-header').bottom, below: footer.getBoundingClientRect().top + parseFloat(getComputedStyle(footer).paddingTop) - bottom };
      });
      expect(gap.above, '머리글 아래 간격').toBeGreaterThan(20);
      expect(Math.abs(gap.above - gap.below), `위 ${gap.above} · 아래 ${gap.below}`).toBeLessThanOrEqual(12);
    }
  });
}

// 가로로 눕힌 휴대폰: 낮은 창 규칙이 그림을 쪼그리지 않는다 — 폭이 233px로 줄어 두 로고가 겹치고 포스터 글이 위로 잘렸다(11/8 해상도 전수)
for (const [width, height] of [[932, 380], [844, 340], [780, 304], [667, 331], [640, 300]]) {
  test(`${width}×${height} 가로 휴대폰: 완성 화면 그림 위 로고 · 글이 겹치거나 잘리지 않는다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await page.route(UPLOAD_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_result.mp4' }) }));
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.locator('.tile', { hasText: 'SF' }).first().click();
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
    await page.locator('#saveBtn').click();
    await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
    const poster = await page.locator('.result-poster').boundingBox();
    const inky = await page.locator('.poster-logo-inky').boundingBox();
    const education = await page.locator('.poster-logo-education').boundingBox();
    expect(inky.x + inky.width, '두 로고가 겹쳤다').toBeLessThan(education.x);
    const top = await page.locator('.poster-credit').evaluate((el) => {
      const first = [...el.children].find((c) => getComputedStyle(c).display !== 'none');
      return first.getBoundingClientRect().top;
    });
    expect(top, '포스터 글이 위로 잘렸다').toBeGreaterThanOrEqual(poster.y);
    expect(top, '포스터 글이 로고 줄까지 올라왔다').toBeGreaterThanOrEqual(inky.y + inky.height);
    // 그림과 글이 같은 높이에서 시작한다 — 그림이 긴 글의 가운데로 내려가 첫 화면 왼쪽이 비어 있었다
    const details = await page.locator('.result-details').boundingBox();
    expect(Math.abs(poster.y - details.y), '그림이 글보다 아래에서 시작한다').toBeLessThanOrEqual(1);
    await page.close();
  });
}

// 낮은 세로 휴대폰: 합성이 실패한 화면의 «돌아가기»가 첫 화면 안에 든다 — 그림 위 여백을 30px로 늘린 뒤 375×553(주소창까지 뺀 높이)에서 7px 밀려났다(11/8 해상도 전수)
for (const [width, height] of [[375, 553], [360, 640], [390, 664]]) {
  test(`${width}×${height} 세로 휴대폰: 합성 실패 화면의 «돌아가기»가 첫 화면에 든다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/clips/final/sf.mp4')) return Promise.reject(new Error('시뮬레이션된 네트워크 실패'));
        return originalFetch(input, init);
      };
    });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.locator('.tile', { hasText: 'SF' }).first().click();
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
    await page.locator('#saveBtn').click();
    await expect(page.locator('#errbox')).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(() => window.scrollY), '화면이 첫 화면이 아니다').toBe(0);
    const back = await page.locator('#errBackBtn').boundingBox();
    expect(back.y + back.height, '«돌아가기»가 첫 화면 아래로 밀렸다').toBeLessThanOrEqual(height);
    // 그림 위 여백은 그대로다 — «개인정보처리방침» 글자가 그림 위 가장자리에 닿지 않는다
    const link = await page.locator('#result .privacylink').boundingBox();
    const poster = await page.locator('.result-poster').boundingBox();
    expect(poster.y - (link.y + link.height), '방침 링크가 그림에 붙었다').toBeGreaterThanOrEqual(2);
    await page.close();
  });
}
