import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { pauseScenes } from './pause-scenes.js';

// 장면 영상을 만든 도구(Higgsfield)의 흰 로고 — Poster Studio와 같은 그림(11/14 Bumm님, 팀장 전달).
// 자리 · 크기 = 1920×1080 영상 기준 값(그림 폭 210 · 위 40 · 오른쪽 48) × 영상이 칸을 덮는 배율(가로 · 세로 중 큰 쪽).
// 처음의 Poster Studio 값(폭 140 · 위 19.3 · 오른쪽 24.6)은 카드에서 너무 작고 모서리에 붙어 보였다(11/14 Bumm님 «힉스필드 로고도 너무 작고 끝에 붙어있어»).
const LOGO = { width: 210, top: 40, right: 48 };
// 첫 화면 장면 카드와 녹음실(미리보기 · 녹음 내내)에 얹고, 영상에는 굽지 않는다. «미리보기 재생 중»은 그래서 왼쪽 위로 옮겼다.
test.use({ serviceWorkers: 'block' });

// poster-studio src/studio/camera-logo.png를 바이트 그대로 복사한 그림(840×166, 보일 크기의 6배) — 색을 바꾸거나 다시 그리지 않는다
const LOGO_SHA256 = 'ebe7c25f61cd6713146a79093c0f7776bf5123c8241870ed99df88848ce14def';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/** 칸(frame)과 그 안 로고의 자리를 CSS px로 잰다 */
function measure(page, frame) {
  return page.evaluate((sel) => {
    const box = document.querySelector(sel);
    const mark = box.querySelector('.higgsfield-mark');
    const img = mark?.querySelector('img');
    if (!img) return null;
    const f = box.getBoundingClientRect(); const m = mark.getBoundingClientRect(); const r = img.getBoundingClientRect();
    return { frame: [f.left, f.top, f.width, f.height], mark: [m.left, m.top, m.width, m.height],
      top: r.top - f.top, right: f.right - r.right, width: r.width, height: r.height,
      natural: img.naturalWidth, visibility: getComputedStyle(img).visibility };
  }, frame);
}

function expectPosterStudioFit(fit, where) {
  expect(fit, `${where}: 로고가 없다`).not.toBeNull();
  // 배율은 칸을 꽉 채운 틀에서 잰다 — 틀이 칸과 같아야 «보이는 영상의 오른쪽 위»다
  fit.mark.forEach((v, i) => expect(Math.abs(v - fit.frame[i]), `${where}: 로고 틀이 칸과 다르다`).toBeLessThan(0.6));
  const scale = Math.max(fit.frame[2] / 1920, fit.frame[3] / 1080);
  expect(fit.visibility, `${where}: 로고가 숨어 있다`).toBe('visible');
  expect(fit.natural).toBe(840);
  expect(Math.abs(fit.width - LOGO.width * scale), `${where}: 폭 ${fit.width} (기대 ${LOGO.width * scale})`).toBeLessThan(0.6);
  expect(Math.abs(fit.height - LOGO.width * scale * 166 / 840), `${where}: 높이`).toBeLessThan(0.6);
  expect(Math.abs(fit.top - LOGO.top * scale), `${where}: 위 여백 ${fit.top}`).toBeLessThan(0.6);
  expect(Math.abs(fit.right - LOGO.right * scale), `${where}: 오른쪽 여백 ${fit.right}`).toBeLessThan(0.6);
}

async function home(page) {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await pauseScenes(page);
  await page.locator('.scene-shell.is-current .tile-media .playing').waitFor();
}

test('로고 그림은 Poster Studio의 camera-logo.png와 바이트까지 같다', async ({ request }) => {
  const res = await request.get('/brands/higgsfield.png');
  expect(res.status()).toBe(200);
  expect(createHash('sha256').update(await res.body()).digest('hex')).toBe(LOGO_SHA256);
});

for (const [name, opts] of [['PC 1920×1080', { viewport: { width: 1920, height: 1080 } }], ['PC 1280×720', { viewport: { width: 1280, height: 720 } }], ['휴대폰 390×844', PHONE]]) {
  test(`${name}: 첫 화면 가운데 장면과 녹음실(미리보기 · 녹음 중)의 영상 오른쪽 위에 같은 규칙으로 얹힌다`, async ({ browser }) => {
    test.setTimeout(90000);
    const context = await browser.newContext({ ...opts, permissions: ['microphone'], serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      await home(page);
      expectPosterStudioFit(await measure(page, '.scene-shell.is-current .tile-media'), '첫 화면 장면 카드');

      const tile = page.locator('.scene-shell.is-current .tile');
      if (opts.hasTouch) await tile.tap(); else await tile.click();
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
      await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
      expectPosterStudioFit(await measure(page, '.studio-video-frame'), '녹음실 미리보기');

      const rec = page.locator('#recBtn');
      if (opts.hasTouch) await rec.tap(); else await rec.click();
      await expect(page.locator('#recpill')).toBeVisible({ timeout: 60000 });
      expectPosterStudioFit(await measure(page, '.studio-video-frame'), '녹음 중');
    } finally { await context.close(); }
  });
}

// «미리보기 재생 중»은 마우스 기기에만 보인다(9/30부터) — 리눅스 헤드리스처럼 hover:hover · pointer:fine을 보고하지 않는 브라우저에서는 건너뛴다
for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`PC: «미리보기 재생 중»은 바탕 없이 왼쪽 위, 빨간 점이 깜빡이고 오른쪽 위 로고와 겹치지 않는다 · 움직임 줄이기 ${reducedMotion}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', reducedMotion });
    const page = await context.newPage();
    try {
      await home(page);
      test.skip(!(await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)), '이 브라우저는 마우스 기기로 보고하지 않는다');
      const label = page.locator('.scene-shell.is-current .tile-preview-label');
      await expect(label).toBeVisible();
      const got = await page.evaluate(() => {
        const media = document.querySelector('.scene-shell.is-current .tile-media').getBoundingClientRect();
        const label = document.querySelector('.scene-shell.is-current .tile-preview-label');
        const l = label.getBoundingClientRect();
        const logo = document.querySelector('.scene-shell.is-current .higgsfield-mark img').getBoundingClientRect();
        const dot = label.querySelector('.onair-dot');
        const blink = dot.getAnimations().find(a => a.animationName === 'onair');
        return { left: l.left - media.left, top: l.top - media.top, labelRight: l.right, logoLeft: logo.left, mid: media.left + media.width / 2,
          background: getComputedStyle(label).backgroundColor, dot: getComputedStyle(dot).backgroundColor, blinking: blink?.playState };
      });
      expect(got.left).toBeLessThan(20);
      expect(got.top).toBeLessThan(20);
      expect(got.labelRight).toBeLessThan(got.mid);
      expect(got.labelRight).toBeLessThan(got.logoLeft);
      expect(got.background).toBe('rgba(0, 0, 0, 0)');
      expect(got.dot).toBe('rgb(255, 42, 38)');
      expect(got.blinking).toBe('running');
    } finally { await context.close(); }
  });
}
