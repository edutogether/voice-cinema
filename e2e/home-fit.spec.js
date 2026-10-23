import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 휴대폰은 화면 크기가 아니라 실제 브라우저 높이(주소창 포함)로도 잰다 — iPhone 13 사파리 390×664, 큰 아이폰 430×740,
// 작은 아이폰 375×553, 안드로이드 360×640(10/17 팀장 검수에서 390×844로만 재서 놓친 것이 드러났다).
for (const [width, height, touch] of [[1366, 768, false], [1920, 1080, false], [1024, 768, true], [655, 760, false], [375, 812, true], [360, 640, true], [375, 553, true], [390, 664, true], [430, 740, true], [390, 844, true]]) {
  // 655×760처럼 짧은 변이 600 이상인 세로 창은 태블릿 세로 기준(768)으로 맞춘다(public/fit.js, 10/23) — 휴대폰 배열은 600 미만이다
  const phone = width < 600;
  test(`${width}×${height}: ${phone ? '안내·가운데 장면·더빙하기·바로가기 줄이 스크롤 없이 한 화면에 들어온다' : '여덟 장면 선택지와 이름이 첫 화면에 모두 보인다'}`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // 10/17부터 터치 기기도 PC와 같은 캐러셀이다 — 옛 격자는 없다.
    await expect(page.locator('#grid')).toHaveCount(0);
    await expect(page.locator('.scene-choice')).toHaveCount(8);
    if (phone) {
      // 자동 넘김이 재는 도중에 가운데 장면을 바꾸지 않게 멈춘다(위치를 한 장면에서 잰다)
      // 멈춤 단추는 없다(10/20 대표님) — 손가락 한 번 누르기로 멈춘다(검사 준비일 뿐, e2e/pause-scenes.js)
      await pauseScenes(page);
      // 휴대폰 폭(10/17 대표님, 10/19 첫 화면 다듬기): 위에는 «나만의 더빙 극장 / Voice Cinema» 한 덩어리, 제목 자리에는
      // «내 목소리로 완성하는 10초의 영화.»(설명 줄 없음). 가운데 장면은 화면 폭의 94%·영화 비율(16:9), 장르 배지와 장면 이름은
      // 그림 오른쪽 아래에 얹는다. 바로가기 줄은 흐르므로 여덟 칸이 한꺼번에 보이지 않는다(그 대신 이름이 겹치지 않는다).
      // 600 미만으로 낮으면 위 안내 줄을 접는다.
      const intro = height >= 600 ? ['.chart-label', '.chart-app'] : [];
      for (const selector of [...intro, '.festival-signature', '.chart-heading h1', '.scene-shell.is-current .tile-media',
        '.scene-shell.is-current .tile-tag', '.scene-shell.is-current .tile-enter', '.scene-shell.is-current .tile-enter-icon', '.scene-choices', '#home .cinema-footer']) {
        await expect(page.locator(selector), selector).toBeInViewport({ ratio: 1 });
      }
      await expect(page.locator('.chart-heading h1')).toHaveText('내 목소리로 완성하는 10초의 영화.', { useInnerText: true });
      for (const selector of ['.chart-heading > p', '.chart-aside h2', '.scene-shell.is-current .tile-copy']) {
        await expect(page.locator(selector), `${selector}는 휴대폰에서 접는다`).toBeHidden();
      }
      // 제목은 오른쪽 위 «개인정보처리방침»과 겹치지 않는다(안내 줄을 접는 낮은 화면에서 실제로 겹쳤다)
      const heading = await page.locator('.chart-heading h1').boundingBox();
      const privacy = await page.locator('.privacylink').boundingBox();
      expect(heading.y >= privacy.y + privacy.height || heading.x + heading.width <= privacy.x, '제목이 개인정보처리방침과 겹친다').toBe(true);
      if (height >= 600) {
        // «나만의 더빙 극장»은 검은 띠 없이 «Voice Cinema» 위의 글씨다
        const label = await page.locator('.chart-label').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, bottom: el.getBoundingClientRect().bottom }));
        const app = await page.locator('.chart-app').boundingBox();
        expect(label.bg, '«나만의 더빙 극장»에 띠가 남아 있다').toBe('rgba(0, 0, 0, 0)');
        expect(label.bottom, '«나만의 더빙 극장»이 Voice Cinema 위에 있지 않다').toBeLessThanOrEqual(app.y + 1);
        // 맨 위 줄은 오른쪽 위 «개인정보처리방침» 줄 아래에서 시작한다(10/19 대표님 «더 아래로»)
        const top = await page.locator('.chart-aside').boundingBox();
        expect(top.y, '맨 위 줄이 개인정보처리방침 줄과 겹친다').toBeGreaterThanOrEqual(privacy.y + privacy.height);
      }
      // «01 / 08» 줄은 휴대폰에서 없앤다(10/19 대표님). 멈춤 단추는 10/20부터 어느 폭에도 없다
      await expect(page.locator('.scene-navigation'), '.scene-navigation는 휴대폰에서 없앤다').toBeHidden();
      // 로고는 Poster Studio처럼 심벌과 «InKY Film Festival» 전부(10/17 대표님)
      await expect(page.locator('.festival-signature')).toContainText('InKY Film Festival');
      await expect(page.locator('.festival-symbol')).toBeVisible();
      // 가운데 장면은 장면 칸 폭의 80% 이상(양옆은 살짝만), 화살표가 장면 번호와 겹치지 않는다
      const stage = await page.locator('.scene-stage').boundingBox();
      const arrow = await page.locator('.scene-arrow-prev').boundingBox();
      const number = await page.locator('.scene-shell.is-current .tile-number').boundingBox();
      const media = await page.locator('.scene-shell.is-current .tile-media').boundingBox();
      // 휴대폰(세로)은 화면 폭의 90% 이상(10/19 대표님: 이름 줄을 그림 위로 올려 생긴 공간만큼 키움). 장면 칸은 양옆 여백까지 넓힌 화면 폭이다.
      if (width <= 500) {
        expect(stage.width, '장면 칸이 화면 폭과 다르다').toBeCloseTo(width, 0);
        expect(media.width / stage.width, '가운데 장면이 화면 폭의 90%보다 좁다').toBeGreaterThanOrEqual(.9);
      }
      // 장르는 작은 배지, 장면 이름은 그냥 글씨로 그림 오른쪽 아래에 얹는다. «10초»는 장면마다 같아 뺐다.
      await expect(page.locator('.tile[data-genre="sf"] .tile-tag b')).toHaveText('SF');
      await expect(page.locator('.tile[data-genre="sf"] .tile-tag')).toHaveText('SF물의 행성');
      const tag = page.locator('.scene-shell.is-current .tile-tag');
      const tagBox = await tag.boundingBox();
      expect(media.x + media.width - (tagBox.x + tagBox.width), '장면 이름이 그림 오른쪽 끝에 붙어 있지 않다').toBeLessThan(20);
      expect(media.y + media.height - (tagBox.y + tagBox.height), '장면 이름이 그림 아래쪽에 있지 않다').toBeLessThan(20);
      expect(tagBox.x, '장면 이름이 장면 번호와 겹친다').toBeGreaterThan(number.x + number.width);
      expect(await tag.locator('b').evaluate(el => getComputedStyle(el).backgroundColor), '장르 배지에 상자가 없다').not.toBe('rgba(0, 0, 0, 0)');
      // 바닥글: 날짜는 왼쪽, 영화제 이름은 오른쪽 — 한 줄
      const footer = await page.locator('#home .cinema-footer p').evaluate(p => {
        const date = p.querySelector('time').getBoundingClientRect();
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.setEnd(p.firstChild, p.firstChild.length);
        const festival = range.getBoundingClientRect();
        return { dateRight: date.right, dateTop: date.top, festivalLeft: festival.left, festivalTop: festival.top, festivalRight: festival.right, right: p.getBoundingClientRect().right };
      });
      expect(footer.dateRight, '날짜가 영화제 이름보다 왼쪽에 있지 않다').toBeLessThan(footer.festivalLeft);
      expect(Math.abs(footer.dateTop - footer.festivalTop), '날짜와 영화제 이름이 한 줄이 아니다').toBeLessThan(3);
      expect(footer.right - footer.festivalRight, '영화제 이름이 오른쪽 끝에 있지 않다').toBeLessThan(2);
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
      // 단추는 마이크 아이콘을 앞에 달고 그림에서 조금 떨어진다(10/19 대표님)
      expect(button.y - (media.y + media.height), '«더빙하기»가 그림에 너무 붙어 있다').toBeGreaterThanOrEqual(14);
      const icon = await page.locator('.scene-shell.is-current .tile-enter-icon').boundingBox();
      expect(icon.x + icon.width, '마이크 아이콘이 글자 앞에 있지 않다').toBeLessThan(button.x + button.width / 2);
      // 아래 그림 띠의 그림을 크게(10/19 대표님) — 기준 화면(390) px로 잰다. 360 폭은 기준 화면을 0.92배로 줄여 보인다(10/23)
      const fit = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1);
      expect(thumb.width / fit, '아래 그림 띠의 그림이 작다').toBeGreaterThanOrEqual(90);
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
  expect(await tile.locator('video').evaluate(v => v.videoWidth)).toBe(1280);
  await tile.click();
  await expect(page.locator('#clip')).toHaveAttribute('src', /^\/clips\/sf\.mp4\?v=[0-9a-f]{8}$/);
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
