import { test, expect } from '@playwright/test';

// 완성 화면(10/20 대표님 PC 시사): 왼쪽 그림은 오른쪽 높이에 맞춘다 — 넓은 화면은 글 맨 위부터 «다른 더빙하기» 아래 끝까지(11/10 Bumm님),
// 그 사이 크기가 바뀌는 것은 흰 대기 화면이 덮어 보이지 않는다. 900 이하는 QR이 생기기 전·후 같은 크기다. 그림 위에는
// 왼쪽 InKY Film Festival·오른쪽 인천광역시교육청 로고, 큰 글자는 영화 제목·그 아래는 장르. QR 위 두 줄과 «내 영화 받기»는
// 없고, «다른 더빙하기»는 Lucide 아이콘을 앞에 단 빨간 주 단추다 — 메일 칸 «다음»과 같은 크기 · 높이 · 모서리 · 글자(11/9 Bumm님).
const UPLOAD_PATTERN = '**/voiceCinema/upload';

// 휴대폰(11/9 시안 — 팀장 제안 A~D, 팀장 전달)은 QR 대신 포스터를 눌러 보기 · «내 폰에 저장하기» · 보관 기한 한 줄이고,
// «다른 더빙하기»는 흰 바탕 · 빨간 테두리다. PC · 패드는 QR 그대로다.
for (const [width, height] of [[1440, 900], [1024, 768], [1180, 820], [768, 1024], [390, 664], [390, 724], [390, 844]]) {
  test(`${width}×${height}: 완성 화면 그림·로고·제목·단추`, async ({ page }) => {
    const phone = width <= 600;
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
    // 저장하는 동안은 흰 대기 화면(11/9)이 화면 전체를 덮는다 — 그 뒤에서 그림이 오른쪽 글 높이로 커져도(11/10) 보이지 않는다
    const covered = await page.locator('#loading').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.open && r.left <= 0 && r.top <= 0 && r.right >= window.innerWidth && r.bottom >= window.innerHeight && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)';
    });
    expect(covered, '저장하는 동안 흰 대기 화면이 화면 전체를 덮지 않는다').toBe(true);
    const before = await poster.boundingBox();
    release();
    await expect(page.locator(phone ? '#phoneSaveBtn' : '#qrbox')).toBeVisible({ timeout: 60000 });
    const after = await poster.boundingBox();
    // «개인정보처리방침» 줄이 그림 위에 얹히지 않는다 — 휴대폰에서 글자가 그림 위 가장자리에 닿아 있었다(11/8 해상도 전수)
    const link = await page.locator('#result .privacylink').boundingBox();
    if (link.x + link.width > after.x && link.x < after.x + after.width) expect(after.y, '방침 링크 줄이 그림에 얹혔다').toBeGreaterThanOrEqual(link.y + link.height - 1);
    await expect(page.locator('#result .download-link'), '설치 파일 아이콘은 첫 화면에만 있다').toHaveCount(0);
    expect(after.width).toBeGreaterThan(200);
    if (width <= 900) {
      // 900 이하(패드 세로 · 휴대폰)는 그림이 폭으로만 크기를 정해 QR이 생기기 전·후 같은 크기다(10/20)
      expect(after.width).toBeCloseTo(before.width, 0);
      expect(after.height).toBeCloseTo(before.height, 0);
    }
    if (phone) {
      // 키 큰 휴대폰(기준 화면 높이 720 이상)은 포스터를 화면 폭 끝까지, PC와 같은 5:4로, 모서리 없이 둔다(11/10 MA 확정 — 10/20 «휴대폰 16:9»를 바꿈).
      // 낮은 휴대폰은 16:9 그대로다. 높이가 모자라면 5:4에서 16:9 쪽으로 줄여 «다른 더빙하기»까지 첫 화면에 든다 — 390×724는 주소창을 뺀
      // 갤럭시 크롬 360×668과 기준 화면 크기(390×724)가 같다(이 시험의 px 값이 비율 1을 전제해 390 폭으로 잰다). 5:4 그대로였을 때 문서가 화면보다 92px 길었다
      if (height / (width / 390) >= 720) {
        expect(Math.abs(after.width - width), '포스터가 화면 폭 끝까지가 아니다').toBeLessThanOrEqual(1);
        if (height / (width / 390) >= 844) expect(Math.abs(after.height - width * 4 / 5), '포스터가 5:4가 아니다').toBeLessThanOrEqual(1);
        else expect(after.height, '포스터가 16:9보다 낮다').toBeGreaterThanOrEqual(width * 9 / 16 - 1);
        expect(await poster.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('0px');
        const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
        expect(fits, '완성 화면이 첫 화면보다 길다 — «다른 더빙하기»가 화면 끝에 걸린다').toBe(true);
      } else expect(Math.abs(after.height - after.width * 9 / 16), '포스터가 16:9가 아니다').toBeLessThanOrEqual(1);
    }

    await expect(poster.locator('.poster-logo-inky')).toContainText('InKY Film Festival');
    await expect(poster.locator('.poster-logo-inky img')).toHaveAttribute('src', '/brands/inky.png');
    await expect(poster.locator('.poster-logo-education img')).toHaveAttribute('src', '/brands/education-on-dark.svg');
    // 교육청 엠블럼은 공식 색, 글자만 흰색(11/8 Bumm님) — 누리집 «도안 색상»의 HEX 여섯 개가 그대로 들어 있다
    const educationSvg = await page.evaluate(() => fetch('/brands/education-on-dark.svg').then((r) => r.text()));
    for (const hex of ['#005ead', '#00b3e3', '#0a9b5d', '#9eca4f', '#ffd14f', '#f68428']) expect(educationSvg, hex).toContain(hex);
    expect(educationSvg).toContain('<g fill="#fff">');
    // InKY 카메라를 잘라 보이는 칸은 원본 inky.png의 86~91줄(노란 마크 끝 85줄과 흰 한글 제목 시작 92줄 사이)에서 끝난다 —
    // 칸이 원본 100줄까지 내려가 제목 윗부분이 마크 밑에 흰 조각(«…IOIE»처럼)으로 보였다(11/8 Bumm님)
    const cropEnd = await poster.locator('.poster-logo-inky .festival-symbol').evaluate((box) => {
      const img = box.querySelector('img');
      return box.getBoundingClientRect().height / img.getBoundingClientRect().height * img.naturalHeight;
    });
    expect(cropEnd, '잘라 보이는 칸의 끝 줄').toBeGreaterThan(86);
    expect(cropEnd, '잘라 보이는 칸의 끝 줄').toBeLessThan(91);
    // 두 로고는 흰 둥근 바탕 없이 로고만 얹는다(11/8 Bumm님 «방송국 로고처럼»)
    for (const logo of ['.poster-logo-inky', '.poster-logo-education']) {
      expect(await poster.locator(logo).evaluate((el) => getComputedStyle(el).backgroundColor), logo).toBe('rgba(0, 0, 0, 0)');
    }
    expect(await poster.locator('.poster-logo-inky').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await poster.locator('.poster-logo-education img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(poster).not.toContainText('Voice');
    // 왼쪽 아래 글은 녹음실 멈춤 화면 글과 같은 양식 — 작은 글 / 제목 / «장르 | 10초»(11/13 Bumm님)
    await expect(poster.locator('.poster-credit small')).toHaveText('내 목소리로 완성하는 영화');
    await expect(poster.locator('.poster-credit strong')).toHaveText(title);
    await expect(poster.locator('.poster-credit p')).toHaveText(/^SF\s*10초$/);
    await expect(poster.locator('.poster-credit p span')).toHaveText('10초');
    // 그림 위 두 로고는 겹치지 않는다 — 패드 세로(768)에서 교육청 로고가 «InKY Film Festival» 끝을 가렸다(11/2 해상도 전수)
    const inky = await poster.locator('.poster-logo-inky').boundingBox();
    const education = await poster.locator('.poster-logo-education').boundingBox();
    expect(inky.x + inky.width).toBeLessThan(education.x);

    await expect(page.locator('#savemode')).toHaveCount(0);
    await expect(page.locator('#qrbox')).not.toContainText('내 영화 받기');
    if (phone) {
      // 휴대폰은 자기 화면의 QR을 찍을 수 없다 — QR · «내 영화 열기» 대신 포스터 누르기 · «내 폰에 저장하기» · 보관 기한 한 줄
      await expect(page.locator('#qrbox')).toBeHidden();
      await expect(page.locator('#openMovieBtn')).toHaveCount(0);
      await expect(page.locator('#posterPlayBtn')).toBeVisible();
      await expect(page.locator('#phoneSaveBtn')).toHaveText('내 폰에 저장하기');
      // 날짜는 자동 삭제 일정(2026-12-01 00:00 KST)의 전날
      await expect(page.locator('#retentionNote')).toHaveText('이 영화는 11월 30일까지 보관돼요');
    } else {
      // PC · 패드는 QR 그대로 — 휴대폰 요소는 보이지 않고 11/30 줄도 없다(10/20 대표님)
      await expect(page.locator('#result')).not.toContainText('11월 30일', { useInnerText: true });
      for (const sel of ['#posterPlayBtn', '#phoneSaveBtn']) await expect(page.locator(sel), sel).toBeHidden();
    }
    const home = page.locator('#doneHomeBtn');
    await expect(home).toHaveText('다른 더빙하기');
    await expect(home.locator('svg.action-icon')).toHaveCount(1);
    // «다른 더빙하기»는 빨간 주 단추 — 메일 칸 «다음»과 같은 높이 48 · 모서리 10 · 16px 굵기 600(11/9 Bumm님 «빨간걸로»).
    // 휴대폰 완성 화면은 «내 폰에 저장하기»가 주 단추라 흰 바탕 · 빨간 테두리로 한 단계 약하게(11/9 시안 D).
    // 넓은 화면은 «다음»과 같은 폭 248, 휴대폰은 다른 단추처럼 가로를 채운다. 마우스가 올라가 있지 않은 색으로 잰다
    await page.mouse.move(1, 1);
    await expect.poll(() => home.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(phone ? 'rgb(255, 255, 255)' : 'rgb(229, 35, 32)');
    const look = await home.evaluate((el) => { const s = getComputedStyle(el); return { radius: s.borderTopLeftRadius, size: s.fontSize, weight: s.fontWeight, color: s.color }; });
    expect(look).toEqual({ radius: '10px', size: '16px', weight: '600', color: phone ? 'rgb(229, 35, 32)' : 'rgb(255, 255, 255)' });
    if (phone) expect(await home.evaluate((el) => getComputedStyle(el).borderTopColor), '흰 단추에 빨간 테두리가 없다').toBe('rgb(229, 35, 32)');
    const homeBox = await home.boundingBox();
    // 휴대폰은 다른 단추처럼 높이 52 — 48이면 폭 320 휴대폰(비율 0.82)에서 손가락 칸이 39px다
    expect(Math.round(homeBox.height)).toBe(width > 600 ? 48 : 52);
    const detailsWidth = await page.locator('.result-details').evaluate((el) => el.clientWidth);
    if (width > 600) expect(Math.round(homeBox.width)).toBe(248);
    else expect(homeBox.width).toBeGreaterThan(detailsWidth * .9);
    // 안내 문장은 두 줄 안, 두 줄이면 고르게(«있어요»만 아랫줄로 떨어지지 않게 — 11/13 QR 문장이 길어져 칸에 따라 두 줄)
    const msgLines = await page.locator('#doneMsg').evaluate((el) => {
      const shown = [...el.children].find((c) => getComputedStyle(c).display !== 'none');
      const range = document.createRange();
      range.selectNodeContents(shown);
      const rows = new Map();
      for (const r of range.getClientRects()) if (r.width > 0) rows.set(Math.round(r.top), (rows.get(Math.round(r.top)) || 0) + r.width);
      return [...rows.values()];
    });
    expect(msgLines.length).toBeLessThanOrEqual(2);
    if (msgLines.length === 2) expect(Math.min(...msgLines) / Math.max(...msgLines), '아랫줄에 한 마디만 떨어졌다').toBeGreaterThan(.5);
    if (width > 900) {
      // 넓은 두 칸 화면: 단추는 글자 폭만큼, 그림은 오른쪽 내용 높이에 맞춘다
      const details = await page.locator('.result-details').evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: el.clientWidth, content: el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) };
      });
      // 단추는 칸 폭으로 늘지 않는다(폭 248은 위에서 본다) — 1024×768은 그림이 글 높이까지 커져 오른쪽 칸이 320px라 비율로는 재지 않는다
      expect((await home.boundingBox()).width).toBeLessThan(details.width - 1);
      expect(Math.abs(after.height - details.content)).toBeLessThanOrEqual(40);
      // 왼쪽 그림은 오른쪽 글 맨 위(체크 아이콘 — 11/13부터 아이콘 → «나만의 영화가 완성됐어요 !» → 제목)부터 맨 아래 «다른 더빙하기»까지의 높이를 다 차지한다
      // (11/10 Bumm님 «왼쪽 화면이 우측 상단 글씨부터 하단 버튼까지의 높이를 다 차지하도록» — 1024×768 · 1180×820에서 그림이 글보다 짧았다)
      const first = await page.locator('#result #done > :first-child').boundingBox();
      const end = await home.boundingBox();
      expect(after.y, '그림이 글 맨 위보다 아래에서 시작한다').toBeLessThanOrEqual(first.y + 1);
      expect(after.y + after.height, '그림이 «다른 더빙하기» 아래 끝보다 먼저 끝난다').toBeGreaterThanOrEqual(end.y + end.height - 1);
    }
    if (height > 700) {
      // 그림 · 글 덩어리는 머리글과 바닥글 글자 사이 세로 가운데에 있다 — 카드 위 1몫 · 아래 2몫으로 나뉘어 아래가 비었다
      // (11/8 Bumm님 «아래쪽이 너무 비어 보입니다», 2560×1369에서 위 170 · 아래 340px). 키 큰 휴대폰도 같다(11/9 시안). 낮은 창은 위에서 시작한다
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
    // 휴대폰은 QR 대신 «내 폰에 저장하기»(11/9 시안)
    await expect(page.locator('#phoneSaveBtn')).toBeVisible({ timeout: 60000 });
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
