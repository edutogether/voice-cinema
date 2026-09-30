import { test, expect } from '@playwright/test';

const offset = page => page.locator('.scene-choice-track').evaluate(el => new window.DOMMatrix(getComputedStyle(el).transform).m41);
async function open(page) {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
}

test('하단 흐름: 왼쪽 등속 이동, 호버 정지와 이어 흐르기, 수동 정지', async ({ page }) => {
  await open(page);
  const start = await offset(page);
  await page.waitForTimeout(500);
  expect(await offset(page)).toBeLessThan(start - 2);
  await page.locator('.scene-choices').hover({ position: { x: 4, y: 3 } });
  const paused = await offset(page);
  await page.waitForTimeout(300);
  expect(await offset(page)).toBeCloseTo(paused, 0);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  expect(await offset(page)).toBeLessThan(paused - 1);
  await page.getByRole('button', { name: '장면 흐름 일시정지' }).click();
  const stopped = await offset(page);
  await page.waitForTimeout(300);
  expect(await offset(page)).toBeCloseTo(stopped, 0);
  await page.getByRole('button', { name: '장면 흐름 재생' }).click();
  await expect(page.locator('.scene-choices')).toHaveAttribute('data-paused', 'false');
});

test('하단 흐름: 순환 어느 지점에서도 여섯 장르를 고를 수 있고 사본도 같은 녹음실로 간다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const coverage = await page.locator('.scene-choices').evaluate(view => {
    const track = view.querySelector('.scene-choice-track');
    const animation = track.getAnimations()[0];
    animation.pause();
    const samples = [];
    const ends = [];
    // 한 주기의 경계와 중간에서 실제로 잘리지 않는 장르 수를 측정한다.
    for (const time of [0, 6000, 12000, 18000, 36000, 60000, 71999, 72000]) {
      animation.currentTime = time;
      const bounds = view.getBoundingClientRect();
      const genres = [...view.querySelectorAll('.scene-choice-card')].filter(card => {
        const rect = card.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right;
      }).map(card => card.dataset.genre);
      samples.push(new Set(genres).size);
      ends.push(track.lastElementChild.getBoundingClientRect().right >= bounds.right);
    }
    animation.currentTime = 36000;
    return { samples, ends };
  });
  expect(coverage.samples).toEqual(Array(8).fill(6));
  expect(coverage.ends).toEqual(Array(8).fill(true));
  const copy = page.locator('.scene-choice-copy[data-genre="fantasy"]').first();
  await copy.hover();
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '0');
  await copy.click();
  await expect(page.locator('#chipName')).toHaveText('판타지');
  await expect(page.locator('.scene-choices')).toHaveAttribute('data-paused', 'true');
});

test('하단 흐름: 키보드는 여섯 원본만 탐색하며 모두 온전히 보인다', async ({ page }) => {
  await open(page);
  await page.locator('.scene-choice-track').evaluate(el => { el.getAnimations()[0].currentTime = 36000; });
  const last = page.getByRole('button', { name: '시트콤 미리보기 선택' });
  await last.focus();
  await expect(page.locator('.scene-choices')).toHaveAttribute('data-keyboard', 'true');
  await expect(page.getByRole('button', { name: /미리보기 선택$/ })).toHaveCount(6);
  for (const choice of await page.locator('.scene-choice').all()) await expect(choice).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: '판타지 미리보기 선택' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#chipName')).toHaveText('판타지');
});

test('하단 흐름: 움직임 줄이기에서는 자동으로 흐르지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('.scene-choice-track')).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('button', { name: '장면 흐름 일시정지' })).toBeHidden();
  for (const choice of await page.locator('.scene-choice').all()) await expect(choice).toBeInViewport({ ratio: 1 });
});
