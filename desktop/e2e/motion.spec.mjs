// 설치판도 «움직임 줄이기» 신호와 상관없이 늘 정상처럼 돈다(11/11 Bumm님 «여덟 앱 모두, 움직임 줄이기와 상관없이 늘 정상처럼 돌게», 팀장 전달).
// 웹의 e2e/motion-always.spec.js와 같은 것을 빌드한 설치판으로 본다. 신호는 웹 E2E처럼 Playwright 흉내(emulateMedia)로 넣는다 —
// Electron 44는 실행 인자 --force-prefers-reduced-motion을 듣지 않는다(11/11 확인: 넣어도 matchMedia가 no-preference). 시스템 설정은 바꾸지 않는다.
// 흉내를 건 뒤 스플래시 기록(sessionStorage)을 지우고 다시 열어, 스플래시부터 그 신호로 뜨게 한다. 신호를 보고 멈추던 코드로 되돌리면 'reduce' 쪽이 빨간불이다.
import { test, expect, _electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXE = process.env.VC_DESKTOP_EXE ?? path.join(HERE, '..', 'release', 'win-unpacked', 'Voice Cinema.exe');

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`움직임 줄이기 ${reducedMotion}: 스플래시 · 미리보기 · 그림 띠 · 6초 자동 넘김 · 입체 이동 · 녹음실 확대 · 3·2·1이 그대로 돈다`, async () => {
    // 새 프로필 · 가짜 마이크 · 소리 끔. 창은 가장 작은 모니터에 뜬다(시험 전용 VC_TEST_SMALLEST_DISPLAY — main.js)
    const app = await _electron.launch({
      executablePath: EXE,
      args: [`--user-data-dir=${test.info().outputPath('profile')}`, '--mute-audio', '--use-fake-device-for-media-stream'],
      env: { ...process.env, VC_TEST_SMALLEST_DISPLAY: '1' },
    });
    try {
      const page = await app.firstWindow();
      await page.emulateMedia({ reducedMotion });
      // 장면이 넘어올 때 입체 이동(data-moving), 녹음실 확대(is-entering), 문구 · 숫자의 애니메이션 이름을 페이지 안에서 적는다 — 짧은 순간이라 바깥에서 기다리면 놓친다
      await app.context().addInitScript(() => {
        const log = { moved: false, entering: false, cue: null, count: [] };
        window.__motion = log;
        new window.MutationObserver(() => {
          if (document.querySelector('.scene-stage[data-moving="true"]')) log.moved = true;
          if (document.querySelector('.studio-video-frame.is-entering')) log.entering = true;
          const cue = document.querySelector('#cue strong');
          if (cue && log.cue === null) log.cue = window.getComputedStyle(cue).animationName;
          const count = document.querySelector('#count');
          if (count && !log.count.some((entry) => entry.text === count.textContent)) {
            log.count.push({ text: count.textContent, name: window.getComputedStyle(count).animationName });
          }
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-moving'] });
      });
      await page.waitForLoadState('domcontentloaded');
      await page.evaluate(() => window.sessionStorage.clear());
      await page.reload();
      await page.locator('#splash .sbar i').waitFor({ state: 'attached', timeout: 60000 });
      expect(await page.evaluate(() => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference')), '설치판이 받은 신호').toBe(reducedMotion);

      // 스플래시 — 막대 자리를 0.25초 사이에 두 번 재 실제로 움직이는지 본다
      const splash = await page.evaluate(async () => {
        const bar = document.querySelector('#splash .sbar i');
        const x = () => new window.DOMMatrixReadOnly(window.getComputedStyle(bar).transform).m41;
        const first = x();
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        return {
          logo: window.getComputedStyle(document.querySelector('#splash .logo')).animationName,
          bar: window.getComputedStyle(bar).animationName,
          running: bar.getAnimations().some((animation) => animation.playState === 'running'),
          moved: Math.abs(x() - first),
        };
      });
      expect(splash.logo, '로고 튀어 오름').toBe('splashPop');
      expect(splash.bar, '로딩 막대').toBe('splashBar');
      expect(splash.running, '로딩 막대가 돈다').toBe(true);
      expect(splash.moved, '0.25초 사이 막대가 움직였다(px)').toBeGreaterThan(5);
      await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });

      const current = page.locator('.scene-shell.is-current');
      await expect(current).toHaveAttribute('data-index', '0');
      const video = current.locator('video');
      await expect.poll(() => video.evaluate((v) => v.currentTime), { timeout: 20000 }).toBeGreaterThan(.1);
      const first = await video.evaluate((v) => v.currentTime);
      await expect.poll(() => video.evaluate((v) => v.currentTime), { message: '미리보기가 이어서 흐른다' }).toBeGreaterThan(first + .3);
      const flow = await page.locator('.scene-choice-track').evaluate(async (el) => {
        const x = () => new window.DOMMatrixReadOnly(window.getComputedStyle(el).transform).m41;
        const start = x();
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        return { name: window.getComputedStyle(el).animationName, moved: Math.abs(x() - start) };
      });
      expect(flow.name, '아래 그림 띠').not.toBe('none');
      expect(flow.moved, '0.5초 사이 그림 띠가 흘렀다(px)').toBeGreaterThan(1);
      await expect(current).toHaveAttribute('data-index', '1', { timeout: 9000 });
      expect(await page.evaluate(() => window.__motion.moved), '장면이 입체로 넘어왔다').toBe(true);

      // 녹음실 — 들어갈 때 확대, «장면 시작» → 문구 → 3·2·1(녹음은 하지만 저장하지 않는다)
      await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
      await page.locator('#recBtn').click();
      await expect(page.locator('#recpill')).toBeVisible({ timeout: 20000 });
      const log = await page.evaluate(() => window.__motion);
      expect(log.entering, '장면이 녹음실 영상 자리로 커졌다').toBe(true);
      expect(log.cue, '«이제 당신의 차례입니다 !»').toBe('countIn');
      expect(log.count).toEqual(['3', '2', '1'].map((text) => ({ text, name: 'countIn' })));
    } finally {
      await app.close();
    }
  });
}
