import { test, expect } from '@playwright/test';

const offset = page => page.locator('.scene-choice-track').evaluate(el => new window.DOMMatrix(getComputedStyle(el).transform).m41);
async function open(page) {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
}

test('하단 흐름: 호버 중에도 왼쪽 등속 이동하고, 멈춤 단추는 없다', async ({ page }) => {
  await open(page);
  const start = await offset(page);
  await page.waitForTimeout(500);
  expect(await offset(page)).toBeLessThan(start - 2);
  await page.locator('.scene-choices').hover({ position: { x: 4, y: 3 } });
  const paused = await offset(page);
  await page.waitForTimeout(300);
  expect(await offset(page)).toBeLessThan(paused - 2);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  expect(await offset(page)).toBeLessThan(paused - 1);
  // 멈춤 단추는 없다(10/20 대표님 «멈춤을 다 뺀다») — 손가락으로 한 번 누르면 멈춘다(10/19 V-h, e2e/tile-autoplay.spec.js)
  await expect(page.locator('.scene-flow-toggle, .scene-auto-toggle')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /일시정지|재생/ })).toHaveCount(0);
  await expect(page.locator('.scene-choices')).toHaveAttribute('data-paused', 'false');
});

test('하단 흐름: 순환 어느 지점에서도 여덟 장르를 고를 수 있고 사본도 같은 녹음실로 간다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const coverage = await page.locator('.scene-choices').evaluate(view => {
    const track = view.querySelector('.scene-choice-track');
    const animation = track.getAnimations()[0];
    animation.pause();
    const samples = [];
    const ends = [];
    // 한 주기의 경계와 중간에서 실제로 잘리지 않는 장르 수를 측정한다.
    const duration = Number(animation.effect.getTiming().duration);
    for (const progress of [0, 1/12, 1/6, .25, .5, 5/6, .99999, 1]) {
      animation.currentTime = duration * progress;
      const bounds = view.getBoundingClientRect();
      const genres = [...view.querySelectorAll('.scene-choice-card')].filter(card => {
        const rect = card.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right;
      }).map(card => card.dataset.genre);
      samples.push(new Set(genres).size);
      ends.push(track.lastElementChild.getBoundingClientRect().right >= bounds.right);
    }
    animation.currentTime = duration / 2;
    return { samples, ends };
  });
  expect(coverage.samples).toEqual(Array(8).fill(8));
  expect(coverage.ends).toEqual(Array(8).fill(true));
  const copy = page.locator('.scene-choice-copy[data-genre="fantasy"]').first();
  await copy.hover();
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '1');
  await copy.click();
  await expect(page.locator('#chipName')).toHaveText('판타지');
  await expect(page.locator('.scene-choices')).toHaveAttribute('data-paused', 'true');
});

test('하단 흐름: 키보드는 여덟 원본만 탐색하며 모두 온전히 보인다', async ({ page }) => {
  await open(page);
  await page.locator('.scene-choice-track').evaluate(el => { const animation = el.getAnimations()[0]; animation.currentTime = Number(animation.effect.getTiming().duration) / 2; });
  const last = page.getByRole('button', { name: '뮤지컬 미리보기 선택' });
  await last.focus();
  await expect(page.locator('.scene-choices')).toHaveAttribute('data-keyboard', 'true');
  await expect(page.getByRole('button', { name: /미리보기 선택$/ })).toHaveCount(8);
  for (const choice of await page.locator('.scene-choice').all()) await expect(choice).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'SF 미리보기 선택' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#chipName')).toHaveText('SF');
});

test('하단 흐름: 움직임 줄이기에서는 자동으로 흐르지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('.scene-choice-track')).toHaveCSS('animation-name', 'none');
  for (const choice of await page.locator('.scene-choice').all()) await expect(choice).toBeInViewport({ ratio: 1 });
});

for (const width of [655, 1440]) {
  test(`${width}px: 하단 흐름은 같은 속도로 움직이고 순환 경계가 이어진다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const motion = await page.locator('.scene-choice-track').evaluate(track => {
      const animation = track.getAnimations()[0];
      animation.pause();
      // 기준 화면 px로 잰다 — 화면을 통째로 맞추므로(public/fit.js, 10/23) 실제 화면에서는 그 비율만큼 빠르거나 느리다
      const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1;
      const duration = Number(animation.effect.getTiming().duration);
      const sample = (time, copy) => {
        animation.currentTime = time;
        return track.children[copy].firstElementChild.getBoundingClientRect().x / fit;
      };
      // 시간에 따른 실제 화면 이동과, 경계 전후 같은 장면의 이어짐을 본다.
      const speed = sample(1000, 0) - sample(2000, 0);
      const seam = sample(duration + 1, 0) - sample(duration - 1, 1);
      return { speed, seam };
    });
    expect(motion.speed).toBeCloseTo(22, 1);
    expect(Math.abs(motion.seam)).toBeLessThan(.1);
  });
}
