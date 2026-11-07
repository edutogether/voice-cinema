import { test, expect } from '@playwright/test';

// 브라우저가 소리 재생에 사용자 동작을 요구할 때(휴대폰 브라우저의 기본값과 같은 조건)의 녹음실 자동 재생.
// 검사 도구의 기본값은 이 제한이 꺼져 있어, 이 파일만 켜고 돌린다(11/7).
test.use({ launchOptions: { args: ['--autoplay-policy=document-user-activation-required', '--mute-audio'] } });

const state = (page) => page.locator('#clip').evaluate((v) => ({ paused: v.paused, muted: v.muted, time: v.currentTime }));

test('진짜 누름이면 소리와 함께 재생된다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.3);
  expect((await state(page)).muted).toBe(false);
  await expect(page.locator('#soundOnBtn')).toHaveCount(0);
});

test('소리가 막히면 소리 없이 이어 가고 «소리 켜기»를 보이며, 누르면 소리가 난다', async ({ page }) => {
  // 사용자 동작 없이 페이지 스스로 누른다 — 브라우저가 진짜로 소리를 막는다. 검사 도구의 evaluate·locator는 사용자 동작으로 쳐지므로
  // (Runtime.callFunctionOn의 userGesture) 페이지가 눌렀다고 알려 오기 전에는 아무것도 부르지 않는다.
  let pressed;
  const pressedSelf = new Promise((resolve) => { pressed = resolve; });
  await page.exposeFunction('__pressedSelf', () => pressed());
  await page.addInitScript(() => {
    const timer = window.setInterval(() => {
      const tile = document.querySelector('.scene-shell.is-current .tile');
      if (!tile || document.querySelector('#splash')) return;
      window.clearInterval(timer);
      tile.click();
      window.__pressedSelf();
    }, 50);
  });
  await page.goto('/');
  await pressedSelf;
  await expect(page.locator('#soundOnBtn')).toBeVisible();
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
  await expect(page.locator('#hint')).toContainText('소리 켜기');
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.2);
  expect(await state(page)).toMatchObject({ paused: false, muted: true });
  await page.locator('#soundOnBtn').click();
  await expect(page.locator('#soundOnBtn')).toHaveCount(0);
  expect(await state(page)).toMatchObject({ paused: false, muted: false });
  await expect(page.locator('#hint')).not.toContainText('소리 켜기');
});
