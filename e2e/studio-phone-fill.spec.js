import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 세로 휴대폰 녹음실(10/20 대표님 «영상 칸이 짧고 아래가 텅 빈다» → 10/21 팀장 검수 «흐린 띠 없이, 영상은 화면 폭 16:9 그대로»):
// 영상 → 진행 막대 → 안내 → 단추를 붙인 한 덩어리가 머리줄 아래 남은 칸의 가운데에 놓인다(위·아래 여백이 같다).
// 장면은 자르지 않고 위아래 띠도 없다. 단계가 바뀌어도 영상과 단추가 움직이지 않고, 제목은 머리줄에 한 번만 나온다.
const measure = (page) => page.evaluate(() => {
  const box = (sel) => document.querySelector(sel).getBoundingClientRect();
  const head = box('.studio-heading');
  const frame = box('.studio-video-frame');
  const copy = box('.controls-copy');
  const actions = document.querySelector('.record-actions') ? box('.record-actions') : box('#afterRow');
  return {
    frame: { top: Math.round(frame.top), width: Math.round(frame.width), height: Math.round(frame.height) },
    above: Math.round(frame.top - head.bottom),
    // 키 큰 휴대폰(11/9 시안)의 세 몫: 머리줄↔영상(above), 막대↔안내, 안내↔단추(copyToButtons)
    barToCopy: Math.round(copy.top - box('.studio-timeline').bottom),
    below: Math.round(window.innerHeight - actions.bottom),
    copyToButtons: Math.round(actions.top - copy.bottom),
    actionsTop: Math.round(actions.top),
    recTop: document.querySelector('#recBtn') ? Math.round(box('#recBtn').top) : null,
    videoFit: getComputedStyle(document.querySelector('#clip')).objectFit,
    pauseTitle: getComputedStyle(document.querySelector('.studio-pause-title')).display,
    // 기준 화면(390) px로 잰다 — 430 폭은 기준 화면을 1.1배로 키워 보인다(public/fit.js, 10/23)
    barToTime: Math.round((box('.clip-time').left - box('.progress').right) / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1)),
    scroll: document.scrollingElement.scrollHeight - window.innerHeight,
  };
});

for (const [width, height] of [[360, 640], [390, 844], [430, 932]]) {
  test(`휴대폰 ${width}×${height}: 녹음실은 16:9 영상과 안내·단추가 한 덩어리로 가운데에 놓이고, 단계가 바뀌어도 움직이지 않는다`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // 아래 그림 띠에서 바로 고른다 — 가운데 장면은 계속 넘어가 뮤지컬이 가운데 올 때까지 기다리게 된다
    await pauseScenes(page);
    await page.locator('.scene-choice[data-genre="musical"]').click();
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);

    const idle = await measure(page);
    // 영상은 화면 폭 16:9 그대로 — 위아래 띠·자르기 없음. 키 큰 휴대폰(기준 화면 높이 720 이상)도 화면 폭 끝까지다
    // (11/10 MA 확정 «그림을 화면 끝까지» — 11/9 시안 B의 94% 둥근 카드를 바꿈)
    const tall = height / (width / 390) >= 720;
    expect(Math.abs(idle.frame.width - width)).toBeLessThanOrEqual(1);
    expect(Math.abs(idle.frame.height - width * 9 / 16)).toBeLessThanOrEqual(1);
    expect(idle.videoFit).toBe('contain');
    await expect(page.locator('.studio-ambient')).toHaveCount(0);
    if (tall) {
      // 단추는 화면 맨 아래(아래 여백 20px — 기준 화면 px), 그 위의 남는 높이는 세 몫(머리줄↔영상 · 막대↔안내 · 안내↔단추)으로 고르게(11/9 시안 D)
      const fit = width / 390;
      expect(Math.abs(idle.below - 20 * fit), `단추 아래 ${idle.below}`).toBeLessThanOrEqual(2);
      const gaps = [idle.above, idle.barToCopy, idle.copyToButtons];
      expect(Math.max(...gaps) - Math.min(...gaps), `세 몫 ${gaps}`).toBeLessThanOrEqual(4);
      expect(Math.min(...gaps), `세 몫 ${gaps}`).toBeGreaterThan(20);
      // 두 단추는 위아래로 쌓아 가로를 다 쓰고(양옆 16px — 기준 화면 px), 주 단추 «장면 시작»이 아래다(11/10 MA)
      const preview = await page.locator('#previewBtn').boundingBox();
      const rec = await page.locator('#recBtn').boundingBox();
      expect(rec.y, '«장면 시작»이 «미리보기» 아래에 있지 않다').toBeGreaterThan(preview.y + preview.height);
      for (const b of [preview, rec]) expect(Math.abs(b.width - (width - 32 * fit)), `단추 폭 ${b.width}`).toBeLessThanOrEqual(1);
      // 로고 줄 · 단계 표시는 맨 위(메인과 같은 머리글), 장르 · 장면 이름은 영상 왼쪽 아래
      await expect(page.locator('#studio .festival-header')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#studio .festival-header [aria-current="step"]')).toContainText('목소리 녹음');
      const tag = await page.locator('.studio-scene-tag').boundingBox();
      const frame = await page.locator('.studio-video-frame').boundingBox();
      expect(tag.x - frame.x, '장면 이름이 영상 왼쪽에 있지 않다').toBeLessThan(20 * fit);
      expect(frame.y + frame.height - (tag.y + tag.height), '장면 이름이 영상 아래쪽에 있지 않다').toBeLessThan(20 * fit);
      await expect(page.locator('.studio-scene-tag')).toHaveText('뮤지컬서커스 첫 무대');
    } else {
      // 한 덩어리: 안내와 단추가 붙어 있고(10/20 전에는 343·408px), 덩어리 위아래 여백이 같다(단추 아래 여백 16px 차이까지)
      expect(idle.copyToButtons).toBeLessThanOrEqual(40);
      expect(Math.abs(idle.above - idle.below)).toBeLessThanOrEqual(20);
      await expect(page.locator('.studio-scene-tag')).toBeHidden();
    }
    expect(idle.scroll).toBe(0);
    // 제목은 머리줄에 한 번만 — 영상 위 «내 목소리로 완성하는 영화 / 제목 / 장르 | 10초»는 접는다
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
      expect(phase.frame).toEqual(idle.frame);
      expect(phase.actionsTop).toBe(idle.actionsTop);
    }
    // 녹음하는 동안 «미리보기»가 빠져도 «장면 시작»은 제자리다(키 큰 휴대폰은 두 줄 칸을 잡아 둔다)
    expect(countdown.recTop).toBe(idle.recTop);
    // 녹음 뒤에는 «다시 녹음 · 저장하기» 두 단추만(10/20 «다시 듣기» 없앰)
    await expect(page.locator('#afterRow button')).toHaveText([/다시 녹음/, /저장하기/]);
  });
}
