import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 녹음실에서 돌아올 때 장면 카드로 초점을 되돌리는 것은 키보드로 다니는 사람에게만 한다(10/20).
// 마우스로 돌아온 뒤 카드에 초점이 남아 있으면, 키 하나(캡처 단축키의 Shift 등)만 눌러도 가운데 카드에
// 검은 초점 테두리가 생겼다 — 대표님 PC 캡처에 찍힌 «검은 띠»가 이것이다.
const currentTile = (page) => page.locator('.scene-shell.is-current .tile');
const ringShown = (page) => currentTile(page).evaluate((t) => t.matches(':focus-visible'));

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await pauseScenes(page);
});

test('마우스로 녹음실에 들어갔다 돌아오면 키를 눌러도 가운데 카드에 초점 테두리가 생기지 않는다', async ({ page }) => {
  await currentTile(page).click();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await page.locator('#studioBackBtn').click();
  await expect(page.locator('#home')).toHaveClass(/active/);
  await page.keyboard.press('Shift');
  await expect(currentTile(page)).not.toBeFocused();
  expect(await ringShown(page)).toBe(false);
});

test('키보드로 녹음실에 들어갔다 돌아오면 그 장면 카드로 초점이 돌아오고 테두리가 보인다', async ({ page }) => {
  await currentTile(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await page.locator('#studioBackBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#home')).toHaveClass(/active/);
  await expect(currentTile(page)).toBeFocused();
  expect(await ringShown(page)).toBe(true);
});
