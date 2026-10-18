// 휴대폰·태블릿(마우스 없는 기기)에서도 장면이 살아 움직이고 손가락으로 고를 수 있는지 확인한다.
//
// 왜 있는가: 2026-10-17까지 터치 기기는 2.0 캐러셀이 아니라 옛 격자(여덟 장 동시 재생)를 봤다.
// 대표님이 휴대폰 폭으로 보시고 «보는 중에 왜 옛날식으로 허접하게 화면이 바뀌냐»고 지적해, 터치 기기도
// PC와 같은 캐러셀을 쓰게 했다(밀어서 넘기고, 가운데 장면을 누르면 녹음실). 그래서 이제 터치에서도
// **가운데 장면 한 장만** 재생된다 — 예전 «한 장만 재생으로 되돌리지 말 것»은 여섯 장이 한 화면에 다 보이는
// 격자 이야기였고, 캐러셀은 큰 장면이 하나뿐이라 그 문제가 없다(장면이 6초마다 저절로 넘어간다).
//
// 스크린샷으로는 정지 화면과 구분되지 않는다 — currentTime이 실제로 흐르는지 본다.
import { test, expect } from '@playwright/test';

test.setTimeout(120000);

async function tileStates(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.tile')].map((tile) => {
      const v = tile.querySelector('video');
      return {
        장르: tile.dataset.genre,
        가운데: !!tile.closest('.scene-shell.is-current'),
        paused: v.paused,
        muted: v.muted,
        time: v.currentTime,
      };
    })
  );
}

const 첫화면 = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });
};

// 장면 자동 넘김을 멈춘다 — 6초마다 가운데가 바뀌면 «같은 장면»을 지켜보는 검사가 흔들린다.
// 휴대폰 폭에서는 «01 / 08 ⏸» 줄을 없앴다(10/19 대표님) — 숨은 단추를 코드로 눌러 멈춘다(검사 준비일 뿐, 사용자 동작이 아니다).
const 자동넘김멈춤 = async (page) => {
  const 단추 = page.locator('.scene-auto-toggle');
  await 단추.evaluate((b) => b.click());
  await expect(단추).toHaveAttribute('aria-pressed', 'true');
};

test.describe('마우스가 없는 기기', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('PC와 같은 캐러셀이 나오고, 가운데 장면 한 장만 음소거로 재생된다', async ({ page }) => {
    await 첫화면(page);

    // 이 조건이 참이면 마우스 기기 검사가 되어 이 테스트의 전제가 무너진다.
    expect(await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);
    await expect(page.locator('.scene-carousel')).toBeVisible();
    await expect(page.locator('#grid')).toHaveCount(0);
    await 자동넘김멈춤(page);

    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).map((s) => s.가운데), { timeout: 60000, intervals: [500, 1000] })
      .toEqual([true]);

    const before = (await tileStates(page)).find((s) => s.가운데);
    // 소리가 있으면 브라우저가 자동재생을 막아 정지 화면 그대로가 된다.
    expect(before.muted).toBe(true);
    await page.waitForTimeout(1200);
    const after = (await tileStates(page)).find((s) => s.가운데);
    expect(after.time, '가운데 장면의 시간이 흐르지 않는다').toBeGreaterThan(before.time);
  });

  // loop만으로는 실제 기기에서 계속 돈다는 보장이 없다 — 절전 모드나 동시 디코드
  // 한도로 브라우저가 임의로 멈추면 카드가 마지막 프레임에 굳는다(대표가 실제 폰에서
  // 발견). 원인을 하나씩 막는 대신 "멈춰 있으면 다시 튼다"로 처리했고, 여기서는
  // 그 복구가 실제로 도는지 확인한다 — 브라우저가 멈춘 상황을 직접 만들어 본다.
  test('브라우저가 가운데 장면을 멈춰도 다시 재생된다', async ({ page }) => {
    await 첫화면(page);
    await 자동넘김멈춤(page);
    const current = page.locator('.scene-shell.is-current video');
    await expect.poll(() => current.evaluate((v) => !v.paused), { timeout: 60000, intervals: [500, 1000] }).toBe(true);

    // 정지와 그 상태의 확인을 같은 브라우저 작업에서 한다. 두 번의 evaluate 사이에
    // 정상 복구 타이머가 돌면 이미 다시 재생된 카드를 정지 실패로 오판한다(CI 9/29).
    expect(await current.evaluate((v) => { v.pause(); return v.paused; })).toBe(true);
    await expect.poll(() => current.evaluate((v) => !v.paused), { timeout: 15000, intervals: [500] }).toBe(true);
  });

  // 홈이 다시 그려져도 가운데 장면은 멈췄다 다시 틀지 않아야 한다.
  //
  // 2026-09-27까지 홈이 카드에 넘기는 콜백을 렌더마다 새로 만들고 있었고, 카드의 재생
  // 효과가 그 콜백에 걸려 있었다. 그래서 엔진 내려받기 진행률(0~100%)이 바뀔 때마다
  // 카드가 전부 멈췄다(src까지 비우고) 다시 틀었다.
  //
  // 그래서 진행률이 **실제로 여러 번 바뀌는 동안**을 지켜보며, 그 사이 **가운데에 있는** 장면 영상이
  // 한 번도 다시 불러와지지 않는지 본다(장면이 넘어가며 떠난 카드를 놓아주는 것은 정상이다 — 그때는
  // 이미 가운데가 아니다). 진행률 변화를 못 봤으면 이 검사는 아무것도 안 본 것이므로 통과가 아니라 실패다(§21-1).
  test('엔진을 내려받는 동안에도 가운데 장면이 멈췄다 다시 틀지 않는다', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.__관찰 = { 진행: new Set(), 다시불러옴: 0 };
      const load = window.HTMLMediaElement.prototype.load;
      window.HTMLMediaElement.prototype.load = function () {
        if (this.closest('.scene-shell.is-current')) window.__관찰.다시불러옴++;
        return load.call(this);
      };
      new MutationObserver(() => {
        const b = document.getElementById('engineProg');
        if (b) window.__관찰.진행.add(b.textContent);
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });

    await 첫화면(page);
    // 엔진을 다 받을 때까지(배너가 닫힐 때까지) 본다.
    await page.waitForFunction(() => !document.querySelector('#enginebar.show'), null, { timeout: 60000 });
    await page.waitForTimeout(1000);

    const 관찰 = await page.evaluate(() => ({ 진행: window.__관찰.진행.size, 다시불러옴: window.__관찰.다시불러옴 }));
    expect(관찰.진행, '엔진 진행률이 바뀌는 것을 못 봤다 — 이 검사가 빈 검사가 됐다').toBeGreaterThanOrEqual(5);
    expect(관찰.다시불러옴, '홈이 다시 그려질 때 가운데 장면 영상이 멈췄다 다시 불러와졌다').toBe(0);
  });

  // 손가락으로 옆으로 밀면 다음 장면이 가운데로 온다 — 진짜 터치 이벤트(CDP)로 민다.
  test('옆으로 밀면 다음 장면이 가운데로 오고, 반대로 밀면 돌아온다', async ({ page }) => {
    await 첫화면(page);
    await 자동넘김멈춤(page);
    const 번호 = page.locator('.scene-position strong');
    await expect(번호).toHaveText('01');
    const box = await page.locator('.scene-shell.is-current .tile-media').boundingBox();
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const 밀기 = async (from, to) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
      for (let i = 1; i <= 6; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + ((to - from) * i) / 6, y }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await 밀기(box.x + box.width * 0.8, box.x + box.width * 0.2);
    await expect(번호).toHaveText('02');
    await expect(page.locator('#studio.active')).toHaveCount(0);
    await 밀기(box.x + box.width * 0.2, box.x + box.width * 0.8);
    await expect(번호).toHaveText('01');
  });

  // 휴대폰에는 멈춤 단추가 없다(10/19 대표님) — 손가락으로 한 번 밀거나 누르면 자동 넘김(6초)과 아래 그림 띠의 흐름이 멈춘다(V-h).
  for (const 동작 of ['밀기', '누르기']) {
    test(`한 번 ${동작}면 자동 넘김과 아래 그림 띠의 흐름이 멈춘다`, async ({ page }) => {
      await 첫화면(page);
      const 번호 = page.locator('.scene-position strong');
      await expect(번호).toHaveText('01');
      await expect(page.locator('.scene-auto-toggle')).toHaveAttribute('aria-pressed', 'false');
      const box = await page.locator('.scene-shell.is-current .tile-media').boundingBox();
      const stage = await page.locator('.scene-stage').boundingBox();
      const y = box.y + box.height / 2;
      if (동작 === '밀기') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.8, y }] });
        for (let i = 1; i <= 6; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (0.8 - 0.1 * i), y }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        // 옆(다음) 장면 조각을 누른다 — 녹음실로 들어가지 않고 그 장면이 가운데로 온다
        await page.touchscreen.tap(stage.x + stage.width - 6, y);
      }
      await expect(번호).toHaveText('02');
      await expect(page.locator('.scene-auto-toggle')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.scene-choices')).toHaveAttribute('data-paused', 'true');
      // 자동 넘김 간격(6초)보다 오래 기다려도 그대로다
      await page.waitForTimeout(7000);
      await expect(번호).toHaveText('02');
    });
  }

  // 카카오톡 같은 인앱 브라우저는 동시 디코딩을 하나로 제한하는 경우가 있다(2026-09-09 대표 발견).
  // 캐러셀은 가운데 한 장만 재생하므로 그 환경에서도 그대로 돌아야 한다 — 그 제약을 직접 만들어 본다.
  test('한 번에 하나만 재생되는 환경에서도 가운데 장면이 재생된다', async ({ page, context }) => {
    await context.addInitScript(() => {
      const real = window.HTMLMediaElement.prototype.play;
      window.HTMLMediaElement.prototype.play = function () {
        const 이미돌고있음 = [...document.querySelectorAll('video')].some((v) => v !== this && !v.paused);
        if (이미돌고있음) return Promise.reject(new window.DOMException('한 번에 하나만', 'NotAllowedError'));
        return real.call(this);
      };
    });
    await 첫화면(page);
    await 자동넘김멈춤(page);
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).map((s) => s.가운데), { timeout: 30000, intervals: [500] })
      .toEqual([true]);
    // 다음 장면으로 넘어가도 새 가운데 장면이 재생된다.
    await page.getByRole('button', { name: '다음 장면' }).click();
    await expect(page.locator('.scene-position strong')).toHaveText('02');
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).map((s) => s.장르), { timeout: 30000, intervals: [500] })
      .toEqual(['fantasy']);
  });

  // 카드를 채우는 것들이 **스스로도** 카드와 같은 반경을 갖는지 본다.
  // 전부 반경 0이고 부모의 overflow: hidden에만 기대고 있었는데, iOS 사파리·WKWebView는
  // 자식에 transform이 걸리면 둥근 모서리 잘라내기를 놓친다 — 캐러셀 카드는 넘어갈 때마다
  // 크기(scale)가 바뀌므로 바로 그 조건이라, 각진 모서리가 둥근 모서리를 덮어 "떡네모"로 보인다
  // (2026-09-11 대표가 아이폰 카카오톡 인앱에서 발견). `-webkit-mask-image` 우회는 쓰지 않는다(app.md).
  test('가운데 장면을 채우는 것들이 카드와 같은 모서리를 갖는다', async ({ page }) => {
    await 첫화면(page);
    const 반경 = await page.evaluate(() => {
      const media = document.querySelector('.scene-shell.is-current .tile-media');
      const 값 = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius);
      const 자식 = ['.tile-visual', '.thumb', '.preview']
        .map((sel) => [sel, media.querySelector(sel)])
        .filter(([, el]) => el)
        .map(([sel, el]) => [sel, 값(el)]);
      return { 카드: 값(media), 자식 };
    });
    // 검사 대상이 0건이면 통과가 아니라 실패다(§21-1).
    expect(반경.자식.length, '검사할 자식을 하나도 못 찾았다').toBe(3);
    expect(반경.카드, '카드에 모서리 반경이 없다').toBeGreaterThan(0);
    const 각진것 = 반경.자식.filter(([, r]) => r !== 반경.카드).map(([sel, r]) => `${sel}=${r}px`);
    expect(각진것, `카드는 ${반경.카드}px인데 다른 것이 있다`).toEqual([]);
  });

  test('가운데 장면을 탭하면 녹음실로, 옆 장면을 탭하면 그 장면이 가운데로 온다', async ({ page }) => {
    await 첫화면(page);
    await 자동넘김멈춤(page);
    // 옆(다음) 장면 — 오른쪽 가장자리에 보이는 조각을 탭하면 들어가지 않고 가운데로 온다.
    const box = await page.locator('.scene-shell.is-current .tile-media').boundingBox();
    const stage = await page.locator('.scene-stage').boundingBox();
    await page.touchscreen.tap(stage.x + stage.width - 6, box.y + box.height / 2);
    await expect(page.locator('.scene-position strong')).toHaveText('02');
    await expect(page.locator('#studio.active')).toHaveCount(0);
    await page.locator('.scene-shell.is-current .tile').tap();
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await expect(page.locator('#chipName')).toHaveText('판타지');
  });
});

test.describe('마우스가 있는 기기', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('중앙 장면은 무음 자동재생하며 호버 이탈 뒤에도 한 장만 재생한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

    // 브라우저가 hover:hover / pointer:fine을 보고하지 않으면 앱이 이 화면도 "마우스
    // 없는 기기"로 보고 자동재생 경로를 쓴다 — 호버 경로 자체가 켜지지 않으므로
    // 확인할 것이 없다. 리눅스 헤드리스에서 실제로 이렇게 보고해 CI가 떨어졌다
    // (2026-09-09, run 34327852399). 환경 탓으로 거짓 실패를 내는 대신 건너뛴다.
    const 호버가능 = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    test.skip(!호버가능, '이 브라우저가 hover:hover / pointer:fine을 보고하지 않아 호버 경로가 켜지지 않는다');

    // 10/1 승인: 입력 없이 중앙 장면을 재생하고 호버는 장면 자동 넘김만 멈춘다.
    await expect.poll(async () => (await tileStates(page)).filter(s => !s.paused).length).toBe(1);
    await expect(page.locator('.scene-shell.is-current video')).toHaveJSProperty('muted', true);

    await page.locator('.tile', { hasText: '판타지' }).hover();
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).length, { timeout: 20000 })
      .toBe(1);

    // 카드 밖으로 마우스를 옮긴다. 좌표를 찍는 대신 실제 요소 위로 옮겨야
    // 어떤 화면 크기에서도 확실히 카드를 벗어난다.
    await page.getByRole('heading', { level: 1 }).hover();
    await expect
      .poll(async () => (await tileStates(page)).filter((s) => !s.paused).length, { timeout: 20000 })
      .toBe(1);
  });
});
