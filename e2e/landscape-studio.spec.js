import { test, expect } from '@playwright/test';

// 가로로 눕힌 휴대폰 녹음실 — 유튜브 가로 보기처럼(11/14 Bumm님 «화면을 전체화면으로 띄우고 버튼을 최대한 흰색 아이콘만 … 유튜브 가로로 우리가 보는 것마냥»,
// 결정판 B, 팀장 전달). 영상이 화면 전체를 채우고 머리줄 · 조작부는 그 위에 얹힌다. 문서는 화면 한 장이라 단계마다 단추가 첫 화면 안에 있다
// (전에는 머리줄 · 영상 · 조작부를 쌓아 932×380에서 «장면 시작»이 첫 화면 아래로 걸렸다). 보조 단추는 44px 둥근 아이콘이고 이름은 화면 읽기용으로 남는다.
const measure = (page) => page.evaluate(() => {
  const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1; };
  const frame = document.querySelector('.studio-video-frame').getBoundingClientRect();
  const buttons = [...document.querySelectorAll('#studio button')].filter(vis).map((b) => {
    const r = b.getBoundingClientRect();
    return { id: b.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
  return {
    fit: document.documentElement.dataset.fit,
    W: window.innerWidth, H: window.innerHeight,
    docH: document.scrollingElement.scrollHeight, docW: document.scrollingElement.scrollWidth,
    frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    buttons,
  };
});

const expectOneScreen = (m, label) => {
  expect(m.fit, label).toBe('none');
  expect(m.docH, `${label}: 문서가 화면보다 길다`).toBe(m.H);
  expect(m.docW, `${label}: 가로로 넘친다`).toBe(m.W);
  // 영상이 화면 전체를 채운다(위아래 · 양옆 띠 없음)
  expect(m.frame, label).toEqual({ x: 0, y: 0, width: m.W, height: m.H });
  for (const b of m.buttons) {
    expect(b.width, `${label}: ${b.id} 폭`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${label}: ${b.id} 높이`).toBeGreaterThanOrEqual(44);
    expect(b.left >= 0 && b.top >= 0 && b.right <= m.W && b.bottom <= m.H, `${label}: ${b.id}가 화면 밖`).toBe(true);
  }
  for (let i = 0; i < m.buttons.length; i++) for (let j = i + 1; j < m.buttons.length; j++) {
    const a = m.buttons[i], b = m.buttons[j];
    const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
    expect(overlap, `${label}: ${a.id} · ${b.id} 겹침`).toBe(false);
  }
};

for (const [width, height] of [[932, 380], [640, 300]]) {
  test(`${width}×${height} 가로 휴대폰: 녹음실은 영상이 화면 전체, 단추는 영상 위 — 미리보기부터 녹음 끝까지 한 화면`, async ({ browser }) => {
    test.setTimeout(90000);
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.locator('.tile', { hasText: 'SF' }).first().click();
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    expectOneScreen(await measure(page), '미리보기');
    // 보조 단추는 아이콘만 — 이름은 화면 읽기용으로 남는다
    await expect(page.getByRole('button', { name: '다른 영화 고르기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '미리보기 멈춤' })).toBeVisible();
    for (const sel of ['#studioBackBtn', '#previewBtn']) {
      const label = await page.locator(`${sel} .studio-btn-label`).boundingBox();
      expect(label.width, `${sel} 글자가 보인다`).toBeLessThanOrEqual(1);
    }
    // 주 단추는 글자 그대로
    await expect(page.locator('#recBtn')).toContainText('장면 시작');

    await page.locator('#recBtn').click();
    await page.locator('#count').waitFor({ timeout: 15000 });
    expectOneScreen(await measure(page), '3·2·1');
    await page.locator('#recpill').waitFor({ timeout: 15000 });
    const recording = await measure(page);
    expectOneScreen(recording, '녹음 중');
    // «녹음 중»은 오른쪽 위 — 왼쪽 위 «다른 영화 고르기»와 겹치지 않는다
    const pill = await page.locator('#recpill').boundingBox();
    const back = await page.locator('#studioBackBtn').boundingBox();
    expect(pill.x, '«녹음 중»이 «다른 영화 고르기»에 닿았다').toBeGreaterThan(back.x + back.width);

    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 30000 });
    expectOneScreen(await measure(page), '녹음 끝');
    await expect(page.getByRole('button', { name: '다시 녹음' })).toBeVisible();
    await expect(page.locator('#saveBtn')).toContainText('저장하기');

    // 아이콘 단추도 그대로 듣는다 — «다시 녹음»은 곧바로 다시 녹음 흐름, «다른 영화 고르기»는 첫 화면
    await page.locator('#resetBtn').click();
    await expect(page.locator('#studio')).not.toHaveAttribute('data-phase', 'recorded');
    await page.locator('#studioBackBtn').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
    await page.close();
  });
}

// 세로 휴대폰 · 태블릿 · PC는 이 배치에 들지 않는다 — 보조 단추에 글자가 그대로 보이고 문서 모양도 그대로다
for (const [width, height, touch] of [[390, 844, true], [1024, 768, true], [1440, 900, false]]) {
  test(`${width}×${height}: 가로 휴대폰 녹음실 배치가 번지지 않는다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.locator('.tile', { hasText: 'SF' }).first().click();
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
    for (const sel of ['#studioBackBtn', '#previewBtn']) {
      const label = await page.locator(`${sel} .studio-btn-label`).boundingBox();
      expect(label.width, `${sel} 글자가 숨었다`).toBeGreaterThan(20);
    }
    const look = await page.evaluate(() => ({
      stage: getComputedStyle(document.querySelector('.stage')).display,
      frame: getComputedStyle(document.querySelector('.studio-video-frame')).position,
      before: getComputedStyle(document.querySelector('.studio-video-frame'), '::before').content,
    }));
    expect(look.stage).not.toBe('block');
    expect(look.frame).toBe('relative');
    expect(look.before).toBe('none');
    await page.close();
  });
}
