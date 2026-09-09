// 마우스가 없는 기기에서도 장르 카드가 살아 움직이는지 확인한다.
//
// 왜 있는가: 2026-09-09까지 카드 미리보기와 강조 효과가 마우스 호버로만 켜졌다
// (`(hover: hover) and (pointer: fine)`). 그래서 폰·태블릿에서는 여섯 장이 전부
// 정지 이미지로 남았다. 그다음에는 "화면 가운데 한 장만 재생"으로 고쳤는데, 375px는
// 스크롤이 없어 그 한 장이 영영 바뀌지 않아 대표가 "계속 호러만 재생된다"고 지적했다.
// 지금은 여섯 장이 전부 재생되고, 강조는 손가락을 대고 있는 동안(:active)에 걸린다 —
// 터치에서 PC의 호버에 해당하는 것이 그 순간이다.
//
// 스크린샷으로는 정지 화면과 구분되지 않는다 — currentTime이 실제로 흐르는지 본다.
import { test, expect } from '@playwright/test';

test.setTimeout(120000);

async function tileStates(page) {
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

test.describe('마우스가 없는 기기', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('여섯 장이 모두 음소거로 재생된다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

    // 이 조건이 참이면 호버 경로가 쓰이므로 이 테스트의 전제가 무너진다.
    expect(await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);

    // 카드마다 250ms씩 늦춰 시작한다(행사장 와이파이에서 37MB를 한꺼번에 받지 않으려고).
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).length, {
        timeout: 60000,
        intervals: [500, 1000],
      })
      .toBe(7); // 일부러 틀린 값 — 게이트가 실제로 막는지 확인용, 곧 되돌린다

    const before = await tileStates(page);
    // 소리가 있으면 브라우저가 자동재생을 막아 정지 화면 그대로가 되고,
    // 부스에서 여섯 개가 동시에 소리를 내는 사고도 난다.
    expect(before.every((s) => s.muted)).toBe(true);

    await page.waitForTimeout(1200);
    const after = await tileStates(page);
    const 멈춘것 = after.filter((s, i) => s.time <= before[i].time).map((s) => s.장르);
    expect(멈춘것, '시간이 흐르지 않는 카드가 있다').toEqual([]);
  });

  // loop만으로는 실제 기기에서 계속 돈다는 보장이 없다 — 절전 모드나 동시 디코드
  // 한도로 브라우저가 임의로 멈추면 카드가 마지막 프레임에 굳는다(대표가 실제 폰에서
  // 발견). 원인을 하나씩 막는 대신 "멈춰 있으면 다시 튼다"로 처리했고, 여기서는
  // 그 복구가 실제로 도는지 확인한다 — 브라우저가 멈춘 상황을 직접 만들어 본다.
  test('브라우저가 영상을 멈춰도 다시 재생된다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).length, {
        timeout: 60000,
        intervals: [500, 1000],
      })
      .toBe(6);

    await page.evaluate(() => document.querySelectorAll('.tile video').forEach((v) => v.pause()));
    expect((await tileStates(page)).filter((s) => !s.paused)).toHaveLength(0);

    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).length, {
        timeout: 15000,
        intervals: [500],
      })
      .toBe(6);
  });

  test('카드를 누르고 있는 동안 PC 호버와 같은 강조가 걸린다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

    const 강조 = () =>
      page.evaluate(() => {
        const tile = document.querySelector('.tile');
        return {
          틴트: Number(window.getComputedStyle(tile.querySelector('.tile-tint')).opacity),
          확대: window.getComputedStyle(tile.querySelector('.thumb')).transform,
        };
      });

    expect((await 강조()).틴트).toBe(0);

    // 손가락을 대고 있는 상태를 만든다(떼지 않는다).
    const box = await page.locator('.tile').first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // 틴트 0.25s·확대 0.3s의 전환이 끝난 뒤에 재야 한다 — 누르자마자 재면 아직 0이다.
    await page.waitForTimeout(500);
    const 누른중 = await 강조();
    await page.mouse.up();

    // PC의 :hover가 주는 것과 같은 값이어야 한다(같은 CSS 선언을 나눠 쓴다).
    expect(누른중.틴트).toBeCloseTo(0.12, 2);
    expect(누른중.확대).toBe('matrix(1.05, 0, 0, 1.05, 0, 0)');
  });

  // 카카오톡 같은 인앱 브라우저는 동시 디코딩을 하나로 제한하는 경우가 있다 —
  // 여섯 장에 play()를 걸어도 하나만 살아남고 나머지는 조용히 거부된다. 그러면
  // "왜 호러만 재생되지"로 보인다(2026-09-09 대표가 카카오톡에서 발견).
  // 브라우저 이름이 아니라 실제로 재생되는 장수를 세어 판단하므로, 여기서는 그
  // 제약이 있는 환경을 직접 만들어 대체 동작(한 장씩 돌려 재생 + 강조)을 확인한다.
  test('한 장만 재생되는 환경에서는 한 장씩 돌아가며 재생된다', async ({ page, context }) => {
    await context.addInitScript(() => {
      const real = window.HTMLMediaElement.prototype.play;
      window.HTMLMediaElement.prototype.play = function () {
        const 이미돌고있음 = [...document.querySelectorAll('video')].some((v) => v !== this && !v.paused);
        if (이미돌고있음) return Promise.reject(new window.DOMException('한 번에 하나만', 'NotAllowedError'));
        return real.call(this);
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

    const 상태 = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.tile')].map((t) => ({
          장르: t.querySelector('.gname').textContent,
          재생: !t.querySelector('video').paused,
          강조: t.classList.contains('is-solo'),
        }))
      );

    // 여섯 장을 시도해 본 뒤 "한 장밖에 안 된다"를 스스로 알아채고 전환한다.
    await expect
      .poll(async () => (await 상태()).filter((s) => s.강조).length, { timeout: 30000, intervals: [500] })
      .toBe(1);

    const 처음 = await 상태();
    // 재생 중인 카드와 강조된 카드가 같아야 한다 — 엉뚱한 카드가 빛나면 더 이상하다.
    expect(처음.filter((s) => s.재생).map((s) => s.장르)).toEqual(처음.filter((s) => s.강조).map((s) => s.장르));

    // 그리고 다음 카드로 넘어가야 한다. 한 장에 머물면 대표가 본 그 화면과 같다.
    await expect
      .poll(async () => (await 상태()).find((s) => s.강조)?.장르, { timeout: 20000, intervals: [500] })
      .not.toBe(처음.find((s) => s.강조).장르);
  });

  test('카드를 한 번 탭하면 그 장르로 들어간다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });
    await page.locator('.tile', { hasText: '판타지' }).click();
    await expect(page.locator('#studio')).toHaveClass(/active/);
  });
});

test.describe('마우스가 있는 기기', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('호버 동작은 그대로다 — 올리면 재생, 벗어나면 정지', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

    // 브라우저가 hover:hover / pointer:fine을 보고하지 않으면 앱이 이 화면도 "마우스
    // 없는 기기"로 보고 자동재생 경로를 쓴다 — 호버 경로 자체가 켜지지 않으므로
    // 확인할 것이 없다. 리눅스 헤드리스에서 실제로 이렇게 보고해 CI가 떨어졌다
    // (2026-09-09, run 34327852399). 환경 탓으로 거짓 실패를 내는 대신 건너뛴다.
    const 호버가능 = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    test.skip(!호버가능, '이 브라우저가 hover:hover / pointer:fine을 보고하지 않아 호버 경로가 켜지지 않는다');

    // 마우스가 있는 기기에서는 자동재생 경로가 아예 켜지지 않는다.
    expect((await tileStates(page)).every((s) => s.paused)).toBe(true);

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
