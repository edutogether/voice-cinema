import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';
import { installSyntheticMic } from './synthetic-mic.js';

// 세로 휴대폰 녹음실(10/25 대표님 녹음실 재구성 — «영화가 화면의 주인공 · 텅 빈 느낌 없이 · 영상 · 안내 · 단추가 떠 있지 않게»):
// 머리줄 바로 아래 영상(화면 폭 16:9, 자르지도 위아래 띠도 없이) → 진행 막대 → 안내 칸(대본 화면) → 단추가 위에서부터 붙고, 안내 칸이 남는 높이를 채운다.
// 단추는 엄지가 닿는 아래, 주요 단추(«장면 시작»)가 위 줄. 단계가 바뀌어도 영상은 움직이지 않고, 제목은 머리줄에 한 번만 나온다.
// 10/21의 «한 덩어리를 가운데, 위아래 여백 같게»는 대표님이 «텅 빈 느낌»이라 하셔서 바꿨다.
const measure = (page) => page.evaluate(() => {
  const box = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
  const head = box('.studio-heading');
  const frame = box('.studio-video-frame');
  const card = box('.controls-copy');
  const actions = box('.record-actions') ?? box('#afterRow');
  const visible = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  return {
    frame: { top: Math.round(frame.top), width: Math.round(frame.width), height: Math.round(frame.height) },
    gapUnderHead: Math.round(frame.top - head.bottom),
    card: { top: Math.round(card.top), bottom: Math.round(card.bottom), height: Math.round(card.height) },
    actions: visible(document.querySelector('.record-actions') ?? document.querySelector('#afterRow'))
      ? { top: Math.round(actions.top), bottom: Math.round(actions.bottom) } : null,
    belowLast: Math.round(window.innerHeight - Math.max(card.bottom, actions && visible(document.querySelector('.record-actions') ?? document.querySelector('#afterRow')) ? actions.bottom : 0)),
    videoFit: getComputedStyle(document.querySelector('#clip')).objectFit,
    // 기준 화면(390) px로 잰다 — 430 폭은 기준 화면을 1.1배로 키워 보인다(public/fit.js, 10/23)
    barToTime: Math.round((box('.clip-time').left - box('.progress').right) / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1)),
    scroll: document.scrollingElement.scrollHeight - window.innerHeight,
  };
});

for (const [width, height] of [[360, 640], [390, 844], [430, 932]]) {
  test(`휴대폰 ${width}×${height}: 녹음실은 머리줄 아래 16:9 영상 → 안내 칸 → 단추가 붙어 화면을 채우고, 단계가 바뀌어도 영상이 움직이지 않는다`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height });
    // 저장할 수 있는 녹음 — 크롬 내장 가짜 마이크의 «삐»는 3초를 넘어 이어지는 말로 보여 다시 녹음이 된다(10/26)
    await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // 아래 그림 띠에서 바로 고른다 — 가운데 장면은 계속 넘어가 뮤지컬이 가운데 올 때까지 기다리게 된다
    await pauseScenes(page);
    await page.locator('.scene-choice[data-genre="musical"]').click();
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);

    const idle = await measure(page);
    // 영상은 화면 폭에 맞춘 16:9 그대로 — 위아래 띠 · 자르기 없음, 머리줄 바로 아래(떠 있지 않다)
    expect(idle.frame.width).toBe(width);
    expect(Math.abs(idle.frame.height - width * 9 / 16)).toBeLessThanOrEqual(1);
    expect(idle.videoFit).toBe('contain');
    expect(idle.gapUnderHead).toBeLessThanOrEqual(1);
    // 안내 칸이 남는 높이를 채우고, 단추는 그 바로 아래 · 화면 아래쪽에 붙는다(빈 띠 없음)
    expect(idle.actions.top - idle.card.bottom).toBeLessThanOrEqual(20);
    expect(idle.belowLast).toBeLessThanOrEqual(24);
    expect(idle.belowLast).toBeGreaterThanOrEqual(0);
    expect(idle.scroll).toBe(0);
    // 주요 단추가 위 줄 — «장면 시작» 아래 «녹음 없이 미리보기»
    const [rec, preview] = await Promise.all([page.locator('#recBtn').boundingBox(), page.locator('#previewBtn').boundingBox()]);
    expect(rec.y).toBeLessThan(preview.y);
    // 제목은 머리줄에 한 번만 — 영상 위 제목 겹(옛 «장면 더빙 / 제목 / 장르 | 10초»)은 없다
    await expect(page.locator('.studio-heading h1')).toHaveText('서커스 첫 무대');
    await expect(page.locator('.studio-pause-title')).toHaveCount(0);
    // 준비 안내: 3단계(1이 지금), 멈추는 시각을 말한다
    await expect(page.locator('.studio-steps li')).toHaveText([/«장면 시작»을 눌러요/, /5초에 영화가 멈춰요/, /3·2·1 뒤에 크게 외쳐요/]);
    await expect(page.locator('.studio-steps li[data-state="current"]')).toHaveText(/«장면 시작»/);
    // 진행 막대는 시간 글자 바로 앞까지 온다(둘 사이는 줄 간격 16px뿐)
    expect(idle.barToTime).toBeLessThanOrEqual(16);

    await page.locator('#recBtn').click();
    await expect(page.locator('#count')).toBeVisible({ timeout: 15000 });
    const countdown = await measure(page);
    await expect(page.locator('.studio-steps li[data-state="current"]')).toHaveText(/3·2·1/);
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 30000 });
    const recorded = await measure(page);
    for (const phase of [countdown, recorded]) {
      expect(phase.frame).toEqual(idle.frame);
      expect(phase.scroll).toBe(0);
    }
    // 멈춘 동안은 단추 줄을 접고 안내 칸이 그만큼 커진다(빈 띠가 생기지 않는다)
    expect(countdown.actions).toBeNull();
    expect(countdown.belowLast).toBeLessThanOrEqual(24);
    // 녹음 뒤에는 «다시 녹음 · 저장하기» 두 단추만(10/20 «다시 듣기» 없앰) — 화면 아래에 붙는다
    await expect(page.locator('#afterRow button')).toHaveText([/다시 녹음/, /저장하기/]);
    expect(recorded.belowLast).toBeLessThanOrEqual(24);
  });
}
