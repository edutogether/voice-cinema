// 마우스가 없는 기기에서도 장르 카드가 살아 움직이는지 확인한다.
//
// 왜 있는가: 2026-09-09까지 카드 미리보기와 강조 효과가 마우스 호버로만 켜졌다
// (`(hover: hover) and (pointer: fine)`). 그래서 폰·태블릿에서는 여섯 장이 전부
// 정지 이미지로 남았고, 대표가 실제 화면에서 두 번 지적했다. 이 앱은 부스에서
// 노트북·태블릿·폰으로 쓰므로, 터치 기기에서 안 움직이는 카드는 설계가 아니라
// 그 사용자에게는 고장난 화면이다.
//
// 지금은 화면 가운데에 가장 가까운 카드 한 장이 PC의 호버 카드 역할을 한다 —
// 재생과 강조가 함께 일어나고, 활성 카드는 언제나 하나뿐이다.
//
// 스크린샷으로는 정지 화면과 구분되지 않는다 — currentTime이 실제로 흐르는지,
// 강조 값이 PC의 호버와 같은지 계산된 스타일로 확인한다.
import { test, expect } from '@playwright/test';

test.setTimeout(120000);

async function tileStates(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.tile')].map((tile) => {
      const v = tile.querySelector('video');
      return {
        장르: tile.querySelector('.gname').textContent,
        활성: tile.classList.contains('is-active'),
        paused: v.paused,
        muted: v.muted,
        time: v.currentTime,
        틴트: Number(window.getComputedStyle(tile.querySelector('.tile-tint')).opacity),
        확대: window.getComputedStyle(tile.querySelector('.thumb')).transform,
      };
    })
  );
}

test.describe('마우스가 없는 기기', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('활성 카드 한 장이 음소거로 재생되고 PC 호버와 같은 강조가 걸린다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

    // 이 조건이 참이면 호버 경로가 쓰이므로 이 테스트의 전제가 무너진다.
    expect(await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);

    // 첫 화면에서 이미 한 장은 활성이어야 한다 — 아무것도 강조되지 않은 채로
    // 시작하면 예전과 똑같은 정지 화면으로 보인다.
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => s.활성 && !s.paused).length, {
        timeout: 30000,
        intervals: [300, 500],
      })
      .toBe(1);

    const before = await tileStates(page);
    // 활성 카드는 하나뿐이다 — 여러 장이 동시에 돌면 디코더와 대역폭을 나눠 쓴다.
    expect(before.filter((s) => s.활성)).toHaveLength(1);

    const 활성 = before.find((s) => s.활성);
    // 소리가 있으면 브라우저가 자동재생을 막아 정지 화면 그대로가 되고,
    // 부스에서 여러 장이 동시에 소리를 내는 사고도 난다.
    expect(활성.muted).toBe(true);
    // PC의 :hover가 주는 것과 같은 값이어야 한다(같은 CSS 규칙을 나눠 쓴다).
    expect(활성.틴트).toBeCloseTo(0.4, 2);
    expect(활성.확대).toBe('matrix(1.05, 0, 0, 1.05, 0, 0)');

    // 활성이 아닌 카드는 강조도 재생도 없어야 한다.
    for (const s of before.filter((x) => !x.활성)) {
      expect(s.paused, `${s.장르}가 활성이 아닌데 재생 중이다`).toBe(true);
      expect(s.틴트, `${s.장르}가 활성이 아닌데 강조돼 있다`).toBe(0);
    }

    await page.waitForTimeout(1200);
    const after = await tileStates(page);
    const 활성후 = after.find((s) => s.활성);
    expect(활성후.time, '활성 카드의 시간이 흐르지 않는다').toBeGreaterThan(활성.time);
  });
});

test.describe('마우스가 있는 기기', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('호버 동작은 그대로다 — 올리면 재생, 벗어나면 정지', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

    // 마우스가 있는 기기에서는 활성 카드 경로가 아예 켜지지 않는다 — 두 경로가
    // 겹치면 호버를 벗어나도 가운데 카드가 계속 도는 이상한 상태가 된다.
    expect((await tileStates(page)).some((s) => s.활성)).toBe(false);

    await page.locator('.tile', { hasText: '판타지' }).hover();
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).length, { timeout: 20000 })
      .toBe(1);

    // 카드 밖으로 마우스를 옮긴다. 좌표를 찍는 대신 실제 요소 위로 옮겨야
    // 어떤 화면 크기에서도 확실히 카드를 벗어난다.
    await page.locator('.brand h1').hover();
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).length, { timeout: 20000 })
      .toBe(0);
  });
});
