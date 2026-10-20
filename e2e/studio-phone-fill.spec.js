import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 세로 휴대폰 녹음실(10/20 대표님 «영상 칸이 짧고 그 아래 글과 맨 아래 단추 사이가 300px 넘게 텅 비어 있다»):
// 영상 칸이 남는 높이를 차지해 설명과 단추 사이가 붙고, 장면은 자르지 않으며(10/01 «인물 양옆이 잘리지 않게»)
// 위아래 남는 칸은 그 장면의 색으로 채운다. 단계가 바뀌어도 영상 칸 크기가 출렁이지 않고, 제목은 머리줄에 한 번만 나온다.
const measure = (page) => page.evaluate(() => {
  const box = (sel) => document.querySelector(sel).getBoundingClientRect();
  const frame = box('.studio-video-frame');
  const copy = box('.controls-copy');
  const actions = document.querySelector('.record-actions') ? box('.record-actions') : box('#afterRow');
  const canvas = document.querySelector('.studio-ambient');
  // 칸 전체가 불투명하게 칠해지고, 어딘가에는 장면의 색이 있다(뮤지컬 대표 그림은 가장자리가 검다)
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = pixels.length > 0;
  let colour = 0;
  for (let i = 0; i < pixels.length; i += 4) { opaque = opaque && pixels[i + 3] === 255; colour += pixels[i] + pixels[i + 1] + pixels[i + 2]; }
  return {
    frameWidth: Math.round(frame.width),
    frameHeight: Math.round(frame.height),
    copyToButtons: Math.round(actions.top - copy.bottom),
    videoFit: getComputedStyle(document.querySelector('#clip')).objectFit,
    ambient: { shown: getComputedStyle(canvas).display !== 'none' && canvas.getBoundingClientRect().height === frame.height, painted: opaque && colour > 0 },
    pauseTitle: getComputedStyle(document.querySelector('.studio-pause-title')).display,
    barToTime: Math.round(box('.clip-time').left - box('.progress').right),
  };
});

for (const [width, height] of [[390, 844], [430, 932]]) {
  test(`휴대폰 ${width}×${height}: 녹음실이 빈 곳 없이 차고, 장면은 자르지 않으며, 단계가 바뀌어도 영상 칸이 그대로다`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // 아래 그림 띠에서 바로 고른다 — 가운데 장면은 계속 넘어가 뮤지컬이 가운데 올 때까지 기다리게 된다
    await pauseScenes(page);
    await page.locator('.scene-choice[data-genre="musical"]').click();
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    await expect.poll(async () => (await measure(page)).ambient.painted).toBe(true);

    const idle = await measure(page);
    // 영상 칸이 16:9보다 길다(키 큰 휴대폰에서 2/3 이상) — 장면은 contain으로 전체가 보이고, 남는 칸은 장면 색으로 채운다
    expect(idle.frameHeight).toBeGreaterThan(width * 9 / 16 * 2);
    expect(idle.videoFit).toBe('contain');
    expect(idle.ambient.shown).toBe(true);
    // 설명과 단추 사이가 붙는다(10/20 전에는 343·408px)
    expect(idle.copyToButtons).toBeLessThanOrEqual(48);
    // 제목은 머리줄에 한 번만 — 영상 위 «장면 더빙 / 제목 / 장르 | 10초»는 접는다
    expect(idle.pauseTitle).toBe('none');
    await expect(page.locator('.studio-heading h1')).toHaveText('서커스 첫 무대');
    // 진행 막대는 시간 글자 바로 앞까지 온다(둘 사이는 줄 간격 12px뿐)
    expect(idle.barToTime).toBeLessThanOrEqual(12);

    await page.locator('#recBtn').click();
    await expect(page.locator('#count')).toBeVisible({ timeout: 15000 });
    const countdown = await measure(page);
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 30000 });
    const recorded = await measure(page);
    for (const phase of [countdown, recorded]) {
      expect(phase.frameHeight).toBe(idle.frameHeight);
      expect(phase.copyToButtons).toBeLessThanOrEqual(48);
    }
    // 녹음 뒤에는 «다시 녹음 · 저장하기» 두 단추만(10/20 «다시 듣기» 없앰)
    await expect(page.locator('#afterRow button')).toHaveText([/다시 녹음/, /저장하기/]);
  });
}

test('PC 1440×900: 위아래 채움 그림은 쓰지 않는다(영상이 칸을 덮는다)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await pauseScenes(page);
  await page.locator('.scene-choice[data-genre="musical"]').click();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('.studio-ambient')).toBeHidden();
  expect(await page.locator('#clip').evaluate(v => getComputedStyle(v).objectFit)).toBe('cover');
});
