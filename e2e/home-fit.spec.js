import { test, expect } from '@playwright/test';

// 휴대폰은 화면 크기가 아니라 실제 브라우저 높이(주소창 포함)로도 잰다 — iPhone 13 사파리 390×664, 큰 아이폰 430×740,
// 작은 아이폰 375×553, 안드로이드 360×640(10/17 팀장 검수에서 390×844로만 재서 놓친 것이 드러났다).
for (const [width, height, touch] of [[1366, 768, false], [1920, 1080, false], [1024, 768, true], [655, 760, false], [375, 812, true], [360, 640, true], [375, 553, true], [390, 664, true], [430, 740, true], [390, 844, true]]) {
  const phone = width <= 760;
  test(`${width}×${height}: ${phone ? '안내·가운데 장면·더빙하기·바로가기 줄이 스크롤 없이 한 화면에 들어온다' : '여덟 장면 선택지와 이름이 첫 화면에 모두 보인다'}`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // 10/17부터 터치 기기도 PC와 같은 캐러셀이다 — 옛 격자는 없다.
    await expect(page.locator('#grid')).toHaveCount(0);
    await expect(page.locator('.scene-choice')).toHaveCount(8);
    if (phone) {
      // 휴대폰 폭(10/17 대표님): PC 왼쪽 안내가 제목 위로 올라오고, 가운데 장면은 장면 칸 폭의 84%·영화 비율(16:9)로 크게 둔다.
      // 바로가기 줄은 흐르므로 여덟 칸이 한꺼번에 보이지 않는다(그 대신 이름이 겹치지 않는다).
      // 높이가 모자라면 위 안내를 줄인다: 760 미만은 마이크·이름·제목 한 줄만, 600 미만은 안내를 접는다.
      const intro = height >= 760 ? ['.chart-aside h2', '.chart-guide'] : height >= 600 ? ['.chart-aside h2'] : [];
      for (const selector of [...intro, '.festival-signature', '.chart-heading h1', '.scene-shell.is-current .tile-media',
        '.scene-shell.is-current .gname', '.scene-shell.is-current .tile-enter', '.scene-navigation', '.scene-choices']) {
        await expect(page.locator(selector), selector).toBeInViewport({ ratio: 1 });
      }
      // 로고는 Poster Studio처럼 심벌과 «InKY Film Festival» 전부(10/17 대표님)
      await expect(page.locator('.festival-signature')).toContainText('InKY Film Festival');
      await expect(page.locator('.festival-symbol')).toBeVisible();
      // 가운데 장면은 장면 칸 폭의 80% 이상(양옆은 살짝만), 화살표가 장면 번호와 겹치지 않는다
      const stage = await page.locator('.scene-stage').boundingBox();
      const arrow = await page.locator('.scene-arrow-prev').boundingBox();
      const number = await page.locator('.scene-shell.is-current .tile-number').boundingBox();
      const media = await page.locator('.scene-shell.is-current .tile-media').boundingBox();
      // 휴대폰(세로)은 80% 이상. 마우스로 좁힌 넓고 낮은 창(655×760)은 화면 높이가 상한이 되어 그보다 작아진다.
      if (width <= 500) expect(media.width / stage.width, '가운데 장면이 장면 칸 폭의 80%보다 좁다').toBeGreaterThanOrEqual(.8);
      const overlap = arrow.x < number.x + number.width && number.x < arrow.x + arrow.width && arrow.y < number.y + number.height && number.y < arrow.y + arrow.height;
      expect(overlap, '왼쪽 화살표가 장면 번호와 겹친다').toBe(false);
      expect(Math.abs(media.width * 9 / 16 - media.height), '가운데 장면이 영화 비율이 아니다').toBeLessThan(2);
      const thumb = await page.locator('.scene-choice img').first().boundingBox();
      expect(Math.abs(thumb.width * 9 / 16 - thumb.height), '바로가기 그림이 영화 비율이 아니다').toBeLessThan(1.5);
      expect(await page.locator('.scene-choice').evaluateAll(cards => cards
        .filter(card => card.querySelector('span').scrollWidth > card.clientWidth + 1).map(card => card.dataset.genre)), '바로가기 이름이 칸을 넘는다').toEqual([]);
      // 더빙하기 버튼은 가운데 장면 폭을 꽉 채운다.
      const button = await page.locator('.scene-shell.is-current .tile-enter').boundingBox();
      expect(button.width).toBeGreaterThan(media.width - 8);
    } else {
      // 흐르는 줄은 순환용 사본까지 포함해 각 장르의 온전한 선택지가 하나 이상 보여야 한다.
      expect(await page.locator('.scene-choices').evaluate(view => {
        const bounds = view.getBoundingClientRect();
        const visible = [...view.querySelectorAll('.scene-choice-card')].filter(card => {
          const r = card.getBoundingClientRect();
          return r.left >= bounds.left && r.right <= bounds.right && r.bottom <= window.innerHeight;
        });
        return new Set(visible.map(card => card.dataset.genre)).size;
      })).toBe(8);
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
  const tile = page.locator('.tile').first();
  // 홈에 진입하면 마우스 조작 없이 첫 장면부터 자동 재생한다.
  await expect.poll(() => tile.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  expect(await tile.locator('video').evaluate(v => v.muted)).toBe(true);
  expect(clips.length).toBeGreaterThan(0);
  expect(clips.every(url => url.includes('/clips/previews/'))).toBe(true);
  expect(await tile.locator('video').evaluate(v => v.videoWidth)).toBe(640);
  await tile.click();
  await expect(page.locator('#clip')).toHaveAttribute('src', '/clips/sf.mp4');
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

// 결정 10(10/17): 글자를 200%로 키운 휴대폰에서 상단 단계 표시 «3 영화 저장»이 화면 오른쪽 밖으로 35px 넘쳤다.
// 칸이 모자랄 때만 단계 이름이 띄어쓰기 자리에서 두 줄이 되게 했다 — 100%에서는 한 줄 그대로다.
test('375px 글자 200%: 상단 단계 표시가 화면 안에 들어오고, 100%에서는 한 줄이다', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const read = () => page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    steps: [...document.querySelectorAll('.festival-steps li')].map(li => {
      const r = li.getBoundingClientRect();
      return { left: r.left, right: r.right, height: r.height };
    }),
  }));
  const normal = await read();
  expect(normal.steps).toHaveLength(3);
  for (const step of normal.steps) expect(step.height).toBeLessThanOrEqual(26);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const zoomed = await read();
  expect(zoomed.pageWidth).toBeLessThanOrEqual(375);
  for (const step of zoomed.steps) {
    expect(step.left).toBeGreaterThanOrEqual(0);
    expect(step.right).toBeLessThanOrEqual(375);
  }
  await page.close();
});
