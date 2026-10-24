import { test, expect } from '@playwright/test';
import { countdownLog, watchCountdown } from './countdown-watch.js';

// 5.0초 멈춤 뒤 «이제 당신의 차례입니다 !» → 3·2·1 «지금 바로 당신의 목소리를 들려주세요 !»가 화면 가운데 보이고
// 다른 요소에 가려지지 않는다. 그동안 영상은 5.0초 정지 화면 그대로다. 녹음기가 실제로 켜진 뒤에 «녹음 중»이 보인다.
// 절정(멈춤)에서 «녹음 중»까지는 1.5초 안팎이다(10/24 대표님 — 전에는 3.9초). 숫자 하나가 0.3초라 화면에서 기록해 두고 본다.
for (const [label, viewport] of [
  ['PC', { width: 1440, height: 900 }],
  ['휴대폰', { width: 390, height: 844 }],
]) {
  test(`${label}: 멈춤 문구와 3·2·1이 화면 가운데 보이고, 1.5초 안팎 뒤 녹음기가 켜지면 «녹음 중»`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await watchCountdown(page);
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
    await page.locator('#recBtn').click();

    await expect(page.locator('#recpill')).toBeVisible({ timeout: 12000 });
    const log = await countdownLog(page);
    expect(log.map((e) => e.key)).toEqual(['cue', '3초 뒤 녹음 시작', '2초 뒤 녹음 시작', '1초 뒤 녹음 시작', 'recording']);
    expect(log[0].text).toBe('이제 당신의 차례입니다 !');
    for (const entry of log) {
      expect(entry.inViewport, entry.key).toBe(true);
      // 문구·숫자·«녹음 중» 내내 영상은 5.0초 정지 화면이다
      expect(entry).toMatchObject({ paused: true, time: 5 });
    }
    for (const entry of log.slice(1, 4)) {
      expect(entry.text).toContain('지금 바로 당신의 목소리를 들려주세요 !');
      expect(entry.uncovered, entry.key).toBe(true);
    }
    // 멈춤 문구 0.6초 + 숫자 0.3초 × 3 = 1.5초, 그 뒤 녹음기가 켜지기까지(첫 소리 조각, 수십 ms).
    // 위 끝은 예전 3.9초가 아님을 보는 자리다 — 병렬 검사 부하에서는 타이머가 밀려 1.97초까지 나왔다(단독 1.5초 안팎)
    const wait = (log[4].at - log[0].at) / 1000;
    expect(wait).toBeGreaterThan(1.45);
    expect(wait).toBeLessThan(2.5);
    await expect(page.locator('#count')).toHaveCount(0);
    await expect(page.locator('.record-left')).toBeVisible();
  });
}
