import { test, expect } from '@playwright/test';

// Windows에서 화면 묶음 마무리 시 명시적으로 실행한다. Linux 글꼴 렌더링과 혼합하지 않는다.
test.skip(process.platform !== 'win32' || process.env.VOICE_VISUAL_BASELINE !== '1', 'Windows 배포 기준선 전용');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const [name, width, height, screen, touch] of [
  ['home-pc', 1440, 900, 'home', false],
  ['home-phone', 375, 812, 'home', true],
  ['studio-pc', 1440, 900, 'studio', false],
  ['studio-phone', 390, 844, 'studio', true],
  ['recorded-pc', 1440, 900, 'recorded', false],
  ['result-pc', 1440, 900, 'result', false],
]) {
  test(`배포 기준선 ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      permissions: ['microphone'], serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    // 실제 브라우저 녹음과 WASM 합성은 실행하고 운영 Storage에 쓰는 요청만 격리한다.
    await page.route('**/voiceCinema/upload', route => route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://example.org/voice-cinema-baseline.mp4' }) }));
    try {
      await page.goto('/');
      await page.locator('#splash').waitFor({ state: 'detached' });
      await page.evaluate(() => document.fonts.ready);
      if (screen !== 'home') {
        await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
        await expect(page.locator('#clip')).toHaveJSProperty('readyState', 4);
      }
      if (screen === 'recorded' || screen === 'result') {
        await page.locator('#recBtn').click();
        await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });
      }
      if (screen === 'result') {
        await page.locator('#saveBtn').click();
        await expect(page.locator('#qrbox')).toBeVisible({ timeout: 30000 });
      }
      // 움직이는 영상·시계만 같은 순간에 고정한다. 제품의 배치·폰트·색은 덮어쓰지 않는다.
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.locator('video').evaluateAll(videos => Promise.all(videos.filter(v => v.readyState >= 2).map(v => {
        v.pause();
        if (v.currentTime === 0) return;
        return new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = 0; });
      })));
      const root = page.locator(screen === 'home' ? '#home' : screen === 'result' ? '#result' : '#studio');
      await expect(root).toBeVisible();
      // 비어 있는 화면을 정상 기준선으로 등록하지 않는다.
      await expect(root.locator('button').first()).toBeVisible();
      expect((await root.innerText()).length).toBeGreaterThan(40);
      // 기준선 검출력 확인용: 별도 실행에서 이 색 변경이 반드시 실패해야 한다.
      if (process.env.VOICE_VISUAL_PROBE === '1') await page.addStyleTag({ content: 'h1 { background:#ff00ff !important; }' });
      await expect(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', fullPage: true });
      const metrics = await root.evaluate(el => [...el.querySelectorAll('h1,h2,button,a')]
        .filter(node => node.getBoundingClientRect().width > 0 && !node.closest('[aria-hidden="true"]'))
        .map(node => {
          const r = node.getBoundingClientRect(); const css = getComputedStyle(node);
          return { text: node.textContent.trim(), label: node.getAttribute('aria-label'), role: node.tagName,
            box: [r.x, r.y, r.width, r.height].map(Math.round), font: css.fontSize, weight: css.fontWeight,
            transition: css.transition, animation: css.animationName };
        }));
      // 저장 완료 화면의 대상은 제목과 홈 버튼 두 개다. 상세 개수·내용은 아래 스냅샷으로 고정한다.
      expect(metrics.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(metrics, null, 2)).toMatchSnapshot(`${name}.json`);
    } finally { await context.close(); }
  });
}
