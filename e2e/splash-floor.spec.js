// 스플래시가 자기 애니메이션이 최소 두 바퀴 도는 동안 떠 있는지 확인한다
// (COMMON_STANDARDS §27).
//
// 왜 "초"가 아니라 "바퀴"인가: 로딩바 주기를 바꾸면 하한도 따라와야 한다. 2400ms 같은
// 숫자를 박아두면 주기가 1.15s에서 1.4s로 바뀌는 순간 하한이 조용히 무너진다. 그래서
// 이 테스트도 화면에서 **실제 주기를 읽어와** 거기서 하한을 계산한다.
//
// 🔴 기기마다 따로 잰다. 다른 앱에서 모바일에만 하한을 넣었다가 PC가 0.1초 만에 스쳐
// 지나가는 것이 드러났다. 이 앱은 스플래시에 기기별 분기가 없지만(2026-09-11 확인),
// "없다"를 믿는 대신 세 화면에서 각각 잰다 — 나중에 누가 분기를 만들면 여기서 걸린다.
//
// 빠른 조건에서 재야 의미가 있다. 회선이 느리면 앱이 늦게 붙어 저절로 길어지므로
// 하한이 드러나지 않는다.
import { test, expect } from '@playwright/test';

const 화면들 = [
  ['PC', { width: 1440, height: 900 }],
  ['패드', { width: 768, height: 1024 }],
  ['모바일', { width: 375, height: 812 }],
];

for (const [이름, viewport] of 화면들) {
  test.describe(`${이름} 화면`, () => {
    test.use({ viewport });

    test('스플래시가 로딩바 두 바퀴 이상 떠 있는다', async ({ page }) => {
      await page.addInitScript(() => {
        window.__splash = {};
        const 관찰 = new MutationObserver(() => {
          if (!document.getElementById('splash') && !window.__splash.사라짐) {
            window.__splash.사라짐 = performance.now();
          }
        });
        document.addEventListener('DOMContentLoaded', () => {
          관찰.observe(document.body, { childList: true, subtree: true });
        });
      });

      await page.goto('/', { waitUntil: 'commit' });

      // 주기는 화면에서 직접 읽는다 — 여기 숫자를 박으면 CSS와 갈라진다.
      await page.waitForSelector('#splash .sbar i');
      const 한바퀴 = await page.evaluate(() => {
        const v = getComputedStyle(document.querySelector('#splash .sbar i')).animationDuration;
        return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
      });
      // 주기를 못 읽었으면 통과가 아니라 실패다 — 0이면 어떤 하한이든 만족해버린다(§21-1).
      expect(한바퀴, '로딩바 주기를 읽지 못했다').toBeGreaterThan(0);

      await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30000 });

      const { 첫그리기, 사라짐 } = await page.evaluate(() => ({
        첫그리기: performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime ?? 0,
        사라짐: window.__splash.사라짐,
      }));
      expect(사라짐, '스플래시가 사라진 시각을 못 봤다').toBeGreaterThan(0);

      const 노출 = 사라짐 - 첫그리기;
      const 바퀴 = 노출 / 한바퀴;
      // 프레임 경계 때문에 한두 프레임은 짧게 잡힐 수 있어 1% 여유만 준다.
      expect(바퀴, `${Math.round(노출)}ms / 한바퀴 ${Math.round(한바퀴)}ms = ${바퀴.toFixed(2)}바퀴`).toBeGreaterThan(1.99);
    });
  });
}
