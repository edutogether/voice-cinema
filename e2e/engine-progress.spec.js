import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// «영상 저장 준비 중… N%»는 100을 넘지 않는다(10/20 PC 첫 화면에서 177% 발견).
// 라이브는 엔진 wasm을 brotli로 보내 Content-Length가 압축 크기(7,280,522)인데, 브라우저는 압축을 푼 32.2MB를 센다.
// 그 모양을 그대로 흉내 낸다 — 본문은 실제 파일, Content-Length는 라이브의 압축 크기(옛 코드는 443%까지 올라갔다).
test('엔진 받기 진행률은 Content-Length가 압축 크기여도 100%를 넘지 않고 100%에서 끝난다', async ({ page }) => {
  const wasm = readFileSync('public/vendor/ffmpeg-core/ffmpeg-core.wasm');
  await page.route('**/vendor/ffmpeg-core/ffmpeg-core.wasm', (route) => route.fulfill({
    status: 200, headers: { 'content-type': 'application/wasm', 'content-length': '7280522' }, body: wasm,
  }));
  await page.addInitScript(() => {
    window.__engineSeen = [];
    new MutationObserver(() => {
      const el = document.getElementById('engineProg');
      if (el) window.__engineSeen.push(el.textContent);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__engineSeen.at(-1)), { timeout: 30000 }).toBe('100%');
  const seen = await page.evaluate(() => window.__engineSeen.map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)));
  expect(Math.max(...seen)).toBe(100);
});
