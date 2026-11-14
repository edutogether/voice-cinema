import { test, expect } from '@playwright/test';
import { scenePause, TEST_SCENE } from './scene-data.js';

// 움직임 줄이기(prefers-reduced-motion: reduce)를 보고하는 브라우저에서도 화면은 그대로 움직인다
// (11/11 Bumm님 «여덟 앱 모두, 움직임 줄이기와 상관없이 늘 정상처럼 돌게», 팀장 전달).
// Bumm님이 이 PC에 원격으로 들어와 연 브라우저가 이 신호를 보고해 스플래시 · 장면 · 3·2·1이 멈춰 보였다 — 켠 적 없는 설정이다.
// 같은 것을 두 조건에서 본다. 신호를 보고 멈추던 코드로 되돌리면 'reduce' 쪽이 빨간불이다.
for (const reducedMotion of ['reduce', 'no-preference']) {
  test.describe(`움직임 줄이기 ${reducedMotion}`, () => {
    test.use({ reducedMotion });

    test('스플래시 로고가 튀어 오르고 막대가 흐른다', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.locator('#splash .sbar i').waitFor({ state: 'attached' });
      // 막대의 자리를 0.25초 사이에 두 번 재 실제로 움직이는지 본다(애니메이션 이름만 보면 멈춘 채 남은 것을 못 가린다)
      const splash = await page.evaluate(async () => {
        const logo = document.querySelector('#splash .logo');
        const bar = document.querySelector('#splash .sbar i');
        const x = () => new window.DOMMatrixReadOnly(getComputedStyle(bar).transform).m41;
        const first = x();
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        return {
          logo: getComputedStyle(logo).animationName,
          bar: getComputedStyle(bar).animationName,
          running: bar.getAnimations().some((animation) => animation.playState === 'running'),
          moved: Math.abs(x() - first),
        };
      });
      expect(splash.logo, '로고 튀어 오름').toBe('splashPop');
      expect(splash.bar, '로딩 막대').toBe('splashBar');
      expect(splash.running, '로딩 막대가 돈다').toBe(true);
      expect(splash.moved, '0.25초 사이 막대가 움직였다(px)').toBeGreaterThan(5);
    });

    test('가운데 미리보기가 흐르고, 6초 뒤 다음 장면이 입체로 넘어오며, 아래 그림 띠가 흐른다', async ({ page }) => {
      // 장면이 넘어올 때 입체 이동(data-moving)이 한 번이라도 일어났는지 페이지 안에서 적는다 — 0.6초 남짓이라 바깥에서 기다리면 놓친다
      await page.addInitScript(() => {
        window.__moved = false;
        new MutationObserver(() => {
          if (document.querySelector('.scene-stage[data-moving="true"]')) window.__moved = true;
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-moving'] });
      });
      await page.goto('/');
      await page.locator('#splash').waitFor({ state: 'detached' });
      const current = page.locator('.scene-shell.is-current');
      await expect(current).toHaveAttribute('data-index', '0');
      const video = current.locator('video');
      await expect.poll(() => video.evaluate((v) => v.currentTime)).toBeGreaterThan(.1);
      const first = await video.evaluate((v) => v.currentTime);
      await expect.poll(() => video.evaluate((v) => v.currentTime), { message: '미리보기가 이어서 흐른다' }).toBeGreaterThan(first + .3);
      const track = page.locator('.scene-choice-track');
      await expect(track).toHaveCSS('animation-name', /\S/);
      const flow = await track.evaluate(async (el) => {
        const x = () => new window.DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
        const start = x();
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        return { name: getComputedStyle(el).animationName, moved: Math.abs(x() - start) };
      });
      expect(flow.name, '아래 그림 띠').not.toBe('none');
      expect(flow.moved, '0.5초 사이 그림 띠가 흘렀다(px)').toBeGreaterThan(1);
      await expect(current).toHaveAttribute('data-index', '1', { timeout: 9000 });
      expect(await page.evaluate(() => window.__moved), '장면이 입체로 넘어왔다').toBe(true);
    });

    test('녹음실로 들어갈 때 장면이 커지고, 멈춤 문구와 3·2·1이 커지며 나타난다', async ({ page }) => {
      // 들어갈 때의 확대(is-entering)와 문구 · 숫자가 나타날 때의 애니메이션 이름을 페이지 안에서 적는다
      await page.addInitScript(() => {
        const log = { entering: false, cue: null, count: [] };
        window.__studioMotion = log;
        new MutationObserver(() => {
          if (document.querySelector('.studio-video-frame.is-entering')) log.entering = true;
          const cue = document.querySelector('#cue strong');
          if (cue && log.cue === null) log.cue = getComputedStyle(cue).animationName;
          const count = document.querySelector('#count');
          if (count && !log.count.some((entry) => entry.text === count.textContent)) {
            log.count.push({ text: count.textContent, name: getComputedStyle(count).animationName });
          }
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      });
      await page.goto('/');
      await page.locator('#splash').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: `${TEST_SCENE.name} 더빙 시작`, exact: true }).click();
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
      await page.locator('#recBtn').click();
      await expect(page.locator('#recpill')).toBeVisible({ timeout: (scenePause(TEST_SCENE.id) + 12) * 1000 });
      const log = await page.evaluate(() => window.__studioMotion);
      expect(log.entering, '장면이 녹음실 영상 자리로 커졌다').toBe(true);
      expect(log.cue, '«이제 당신의 차례입니다 !»').toBe('countIn');
      expect(log.count).toEqual(['3', '2', '1'].map((text) => ({ text, name: 'countIn' })));
    });
  });
}
