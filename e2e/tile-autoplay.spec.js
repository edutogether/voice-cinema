// 마우스가 없는 기기에서도 장르 카드의 영상이 재생되는지 확인한다.
//
// 왜 있는가: 2026-09-09까지 카드 미리보기는 마우스 호버로만 켜졌다
// (`(hover: hover) and (pointer: fine)`). 그래서 폰·태블릿에서는 여섯 장이 전부
// 정지 이미지로만 남았고, 대표가 실제 화면에서 이를 발견했다. 이 앱은 부스에서
// 노트북·태블릿·폰으로 쓰므로, 터치 기기에서 안 움직이는 카드는 설계가 아니라
// 그 사용자에게는 고장난 화면이다.
//
// 스크린샷으로는 정지 화면과 구분되지 않는다 — currentTime이 실제로 흐르는지 본다.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test.setTimeout(120000);

async function videoStates(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.tile')].map((tile) => {
      const v = tile.querySelector('video');
      return {
        장르: tile.querySelector('.gname').textContent,
        paused: v.paused,
        muted: v.muted,
        time: v.currentTime,
      };
    })
  );
}

test('마우스가 없는 기기에서 카드 여섯 장이 모두 음소거로 재생된다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

  // 이 조건이 참이면 호버 경로가 쓰이므로 이 테스트의 전제가 무너진다.
  expect(await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);

  // 카드마다 250ms씩 늦춰 시작하므로(행사장 와이파이에서 6개 동시 요청을 피하려고)
  // 마지막 카드까지 재생될 때까지 기다린다.
  await expect
    .poll(async () => (await videoStates(page)).filter((s) => !s.paused).length, {
      timeout: 60000,
      intervals: [500, 1000],
    })
    .toBe(6);

  const before = await videoStates(page);
  // 여섯 개가 동시에 소리를 내면 부스가 시끄러워지고, 애초에 소리가 있으면
  // 브라우저가 자동재생을 막아 정지 화면 그대로가 된다.
  expect(before.every((s) => s.muted)).toBe(true);

  await page.waitForTimeout(1200);
  const after = await videoStates(page);

  const 멈춘것 = after.filter((s, i) => s.time <= before[i].time).map((s) => s.장르);
  expect(멈춘것, '시간이 흐르지 않는 카드가 있다').toEqual([]);
});
