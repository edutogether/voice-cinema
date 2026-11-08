import { test, expect } from '@playwright/test';

// 첫 화면 «의견 보내기»(2026-11-08 Bumm님 «Poster Studio와 똑같이» — 이름 · 의견 · 판 번호 · 화면 크기 · 기기 · 단계 여섯 칸).
// 2026-11-14 00:00(한국 시간)에 배포 없이 사라진다 — 그 시각 직전 · 직후로 본다. 서버로 가는 요청은 가로채 내용만 본다.
const CLOSE_AT = Date.parse('2026-11-14T00:00:00+09:00');
const BEFORE = Date.parse('2026-11-10T14:00:00+09:00');
const INSTALLER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) voice-cinema/2.0.0 Chrome/146.0.0.0 Electron/44.9.3 Safari/537.36';

/** 의견 요청을 가로챈다 — 보낸 본문 · 헤더를 모으고 정한 상태로 답한다. reCAPTCHA는 막아 토큰 없이 곧바로 보내게 한다. */
async function catchFeedback(page, status = 200) {
  const sent = [];
  await page.context().route(/recaptcha|gstatic|firebaseappcheck/, (route) => route.abort());
  await page.route('**/voiceCinema/feedback', (route) => {
    sent.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { ok: true } : { ok: false }) });
  });
  return sent;
}

async function openHome(page, at = BEFORE) {
  await page.clock.install({ time: at });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
}

test('PC: 방침 줄 맨 왼쪽의 «의견 보내기» — 이름 · 의견을 적어 보내면 «보냈어요», 판 · 화면 · 기기 · 단계가 함께 가고 이름은 그 기기에 기억한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const sent = await catchFeedback(page);
  await openHome(page);

  const link = page.locator('#feedbackLink');
  await expect(link).toHaveText('의견 보내기');
  const box = await link.boundingBox();
  const icon = await page.locator('.download-link').boundingBox();
  const privacy = await page.locator('.privacylink').boundingBox();
  expect(Math.abs(icon.x - (box.x + box.width) - 16), '설치 파일 아이콘과의 간격이 16px이 아니다').toBeLessThan(.5);
  expect(Math.abs((privacy.y + privacy.height / 2) - (box.y + box.height / 2)), '방침 글자와 같은 줄이 아니다').toBeLessThan(1);
  const look = (sel) => page.locator(sel).evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.fontSize, s.fontFamily]; });
  expect(await look('#feedbackLink'), '방침 링크와 같은 글자 · 색이 아니다').toEqual(await look('.privacylink'));

  await link.click();
  const dialog = page.locator('#feedbackDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#feedbackName'), '처음에는 이름 칸에서 시작한다').toBeFocused();
  await expect(dialog.locator('.feedback-lead')).toHaveText('테스트하면서 불편했던 점이나 고칠 점, 오류를 적어 주세요.');
  await expect(dialog.locator('label[for="feedbackName"]')).toHaveText('이름 — 피드백을 살펴보고 추가로 문의드릴 것이 있을 때를 위해 적어 주세요.');
  await expect(dialog.locator('label[for="feedbackText"]')).toHaveText('의견 — 어느 화면에서 어떤 문제가 있었는지 함께 적어 주세요.');
  await expect(dialog.locator('.feedback-auto')).toHaveText('함께 보내는 것: 판 번호 · 화면 크기 · 기기 · 단계 보내지 않는 것: 녹음한 목소리 · 영화');
  await expect(page.locator('#feedbackName')).toHaveAttribute('maxlength', '40');
  await expect(page.locator('#feedbackText')).toHaveAttribute('maxlength', '500');
  expect(await dialog.evaluate((el) => el.matches(':modal'))).toBe(true);

  await page.locator('#feedbackName').fill('김선생');
  await page.locator('#feedbackText').fill('녹음 단추가 작아요');
  await expect(page.locator('#feedbackCount')).toHaveText('10 / 500');
  await dialog.getByRole('button', { name: '보내기' }).click();
  await expect(dialog.locator('h2')).toHaveText('보냈어요');
  await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();

  expect(sent).toHaveLength(1);
  const { body, headers } = sent[0];
  expect(body).toEqual({ name: '김선생', text: '녹음 단추가 작아요', version: expect.stringMatching(/^main-[\w-]+\.js$/), screen: '1440x900@1', device: 'pc', step: 1 });
  expect(headers['x-booth-token']).toMatch(/^[0-9a-f]{48}$/);

  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(link).toBeFocused();

  // 다시 열면 기억한 이름이 들어 있고 의견 칸에서 시작한다
  await link.click();
  await expect(page.locator('#feedbackName')).toHaveValue('김선생');
  await expect(page.locator('#feedbackText')).toBeFocused();
  await expect(page.locator('#feedbackText')).toHaveValue('');
});

test('이름 · 의견이 비면 보내지 않는다 · 서버가 거절하면 까닭을 알리고 적은 글은 남긴다 · 취소 · Esc로 닫힌다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let status = 429;
  const sent = [];
  await page.context().route(/recaptcha|gstatic|firebaseappcheck/, (route) => route.abort());
  await page.route('**/voiceCinema/feedback', (route) => { sent.push(1); return route.fulfill({ status, contentType: 'application/json', body: '{"ok":false}' }); });
  await openHome(page);

  await page.locator('#feedbackLink').click();
  const dialog = page.locator('#feedbackDialog');
  await page.locator('#feedbackText').fill('화면이 멈춰요');
  await dialog.getByRole('button', { name: '보내기' }).click();
  await expect(dialog.locator('.feedback-problem')).toHaveText('이름을 적어 주세요.');
  await expect(page.locator('#feedbackName')).toBeFocused();
  await page.locator('#feedbackName').fill('김선생');
  await page.locator('#feedbackText').fill('   ');
  await dialog.getByRole('button', { name: '보내기' }).click();
  await expect(dialog.locator('.feedback-problem')).toHaveText('의견을 적어 주세요.');
  await expect(page.locator('#feedbackText')).toBeFocused();
  expect(sent).toHaveLength(0);

  await page.locator('#feedbackText').fill('화면이 멈춰요');
  for (const [code, message] of [[429, '잠시 뒤에 다시 보내 주세요.'], [410, '의견은 이제 받지 않아요.'], [500, '지금은 보낼 수 없어요. 잠시 뒤에 다시 해 주세요.']]) {
    status = code;
    await dialog.getByRole('button', { name: '보내기' }).click();
    await expect(dialog.locator('.feedback-problem')).toHaveText(message);
    await expect(page.locator('#feedbackText')).toHaveValue('화면이 멈춰요');
  }

  await page.context().setOffline(true);
  await dialog.getByRole('button', { name: '보내기' }).click();
  await expect(dialog.locator('.feedback-problem')).toHaveText('인터넷 연결을 확인해 주세요.');
  expect(sent).toHaveLength(3);
  await page.context().setOffline(false);

  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator('#feedbackLink').click();
  await expect(page.locator('#feedbackText'), '다시 열면 빈 칸에서 시작한다').toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const [name, width, height] of [['세로 휴대폰', 390, 844], ['좁은 휴대폰', 360, 640], ['가로 휴대폰', 844, 390]]) {
  test(`${name}: 링크가 방침 왼쪽에 있고, 창은 설명글 없이 칸만 작게 화면 안에 뜬다`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const sent = await catchFeedback(page);
    await openHome(page);

    const link = await page.locator('#feedbackLink').boundingBox();
    const privacy = await page.locator('.privacylink').boundingBox();
    expect(link.x + link.width, '링크가 방침 링크를 덮는다').toBeLessThanOrEqual(privacy.x);
    expect(Math.abs((privacy.y + privacy.height / 2) - (link.y + link.height / 2)), '방침 글자와 같은 줄이 아니다').toBeLessThan(1);

    await page.locator('#feedbackLink').tap();
    const dialog = page.locator('#feedbackDialog');
    await expect(dialog).toBeVisible();
    for (const sel of ['.feedback-lead', '.feedback-auto']) await expect(dialog.locator(sel), `${sel}이 보인다`).toBeHidden();
    for (const hint of await dialog.locator('.feedback-hint').all()) await expect(hint, '칸 안내가 보인다').toBeHidden();
    const area = await page.locator('#feedbackText').evaluate((el) => el.getBoundingClientRect().height / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1));
    expect(Math.round(area), '의견 칸 높이').toBe(76);
    const d = await dialog.boundingBox();
    expect(d.x, '창이 왼쪽으로 넘친다').toBeGreaterThanOrEqual(0);
    expect(d.y, '창이 위로 넘친다').toBeGreaterThanOrEqual(0);
    expect(d.x + d.width, '창이 오른쪽으로 넘친다').toBeLessThanOrEqual(width);
    expect(d.y + d.height, '창이 아래로 넘친다').toBeLessThanOrEqual(height);

    await page.locator('#feedbackName').fill('김선생');
    await page.locator('#feedbackText').fill('휴대폰에서 글자가 작아요');
    await dialog.getByRole('button', { name: '보내기' }).tap();
    await expect(dialog.locator('h2')).toHaveText('보냈어요');
    expect(sent[0].body.device).toBe(width > height ? 'none' : 'phone');
    await context.close();
  });
}

test('닫힘 시각 직전에 열어 둔 화면 — 11/14 00:00이 되면 새로 고치지 않아도 링크와 열린 창이 사라진다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await catchFeedback(page);
  // 2분 전에 연다 — 남은 시간이 1분보다 길어 1분마다 다시 재는 길을 지난다
  await openHome(page, CLOSE_AT - 120000);
  await page.locator('#feedbackLink').click();
  await expect(page.locator('#feedbackDialog')).toBeVisible();

  await page.clock.pauseAt(CLOSE_AT - 1000);
  await expect(page.locator('#feedbackLink'), '닫힘 1초 전에는 아직 있다').toBeVisible();
  await expect(page.locator('#feedbackDialog')).toBeVisible();
  await page.clock.runFor(1000);
  await expect(page.locator('#feedbackLink')).toHaveCount(0);
  await expect(page.locator('#feedbackDialog')).toHaveCount(0);
  await expect(page.locator('.privacylink'), '방침 링크는 그대로다').toBeVisible();
});

test('닫힘 시각 뒤에 연 화면에는 링크가 없다(웹 · 설치판)', async ({ browser }) => {
  for (const userAgent of [undefined, INSTALLER_UA]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(userAgent ? { userAgent } : {}) });
    const page = await context.newPage();
    await openHome(page, CLOSE_AT);
    await expect(page.locator('.privacylink')).toBeVisible();
    await expect(page.locator('#feedbackLink')).toHaveCount(0);
    await context.close();
  }
});

// 설치판은 인터넷이 안 되는 것이 기준이라 «의견 보내기»를 넣지 않는다(11/8 Bumm님) — 닫힘 시각 전에도 없다.
test('설치판 첫 화면에는 링크가 없다(닫힘 시각 전에도)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 587 }, deviceScaleFactor: 1.5, userAgent: INSTALLER_UA });
  const page = await context.newPage();
  await openHome(page);
  await expect(page.locator('.installer-badge')).toBeVisible();
  await expect(page.locator('#feedbackLink')).toHaveCount(0);
  await context.close();
});

// 손가락으로 누르는 기기에서 «의견 보내기»의 실제로 눌리는 칸은 화면 44px 이상이다 — 링크 상자는 방침 링크와 같은 24px이고 투명한 덧칸(::after)으로 넓힌다.
// 화면 맞춤으로 줄어든 휴대폰(320×568, 비율 0.82)과 바로 아래 제목 칸이 덧칸을 덮던 낮은 휴대폰(375×553), 설치 아이콘이 이웃인 태블릿에서 잰다.
// 넓힌 칸이 이웃(InKY 단추 · 설치 아이콘 · 방침 링크)의 가운데를 가로채지 않는지도 본다.
for (const [width, height] of [[320, 568], [375, 553], [1024, 768]]) {
  test(`터치 ${width}×${height}: «의견 보내기»의 누르는 칸이 화면 44px 이상이고 이웃 링크를 가로채지 않는다`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await openHome(page);
    const m = await page.evaluate(() => {
      const link = document.querySelector('#feedbackLink');
      const b = link.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const middle = Math.floor(b.top + b.height / 2);
      const onLink = (y) => { const t = document.elementFromPoint(x, y); return !!t && link.contains(t); };
      let up = 0;
      while (up < 80 && onLink(middle - up - 1)) up++;
      let down = 0;
      while (down < 80 && onLink(middle + down + 1)) down++;
      const stolen = [...document.querySelectorAll('.festival-restart, .download-link, .privacylink')]
        .filter((el) => el.getClientRects().length)
        .filter((el) => { const r = el.getBoundingClientRect(); return !el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })
        .map((el) => el.className);
      return { hit: up + down + 1, stolen };
    });
    expect(m.hit, '누르는 칸의 화면 높이').toBeGreaterThanOrEqual(44);
    expect(m.stolen, '가운데를 가로챈 이웃').toEqual([]);
    await context.close();
  });
}

// 녹음실로 가도 첫 화면은 내려가지 않고 숨기만 한다(App.tsx) — 링크는 첫 화면 머리글에만 있어 함께 숨는다. 저장 화면 머리글(3단계)은 링크를 그리지 않는다.
test('녹음 화면에는 링크가 보이지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await expect(page.locator('#feedbackLink')).toBeVisible();
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  await expect(page.locator('#studio')).toBeVisible();
  await expect(page.locator('#feedbackLink')).toBeHidden();
  await expect(page.locator('#studio .feedback-link')).toHaveCount(0);
});
