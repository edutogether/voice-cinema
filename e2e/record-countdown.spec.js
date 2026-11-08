import { test, expect } from '@playwright/test';
import { countdownEnds, countdownLog, watchCountdown } from './countdown-watch.js';

// 5.0초 멈춤 뒤 «이제 당신의 차례입니다 !» → 3·2·1(숫자만, 11/8 Bumm님)이 화면 가운데 보이고 다른 요소에 가려지지 않는다.
// 그동안 영상은 5.0초 정지 화면 그대로다. 녹음기가 실제로 켜진 뒤에 «녹음 중»과 «이제 당신의 목소리를 들려주세요 !»가 함께 보이고,
// 그 문구는 숫자 하나처럼 1초 뒤 사라지며 녹음은 이어진다(11/8 Bumm님 «321하고 똑같이만큼»).
// 문구와 숫자는 정확히 1초에 하나씩 넘어가고, 절정(멈춤)에서 «녹음 중»까지 4초다(11/8 Bumm님 «너무 빠르다» — 10/24에는 1.5초, 그 전에는 3.9초).
// 나타나는 순간은 화면에서 기록해 두고 본다(e2e/countdown-watch.js).
for (const [label, viewport] of [
  ['PC', { width: 1440, height: 900 }],
  ['휴대폰', { width: 390, height: 844 }],
]) {
  test(`${label}: 멈춤 문구와 3·2·1이 화면 가운데 1초씩 보이고, 4초 뒤 녹음기가 켜지면 «녹음 중»`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await watchCountdown(page);
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
    await page.locator('#recBtn').click();

    await expect(page.locator('#recpill')).toBeVisible({ timeout: 20000 });
    const log = await countdownLog(page);
    expect(log.map((e) => e.key)).toEqual(['cue', '3초 뒤 녹음 시작', '2초 뒤 녹음 시작', '1초 뒤 녹음 시작', 'recording', 'speak']);
    expect(log[0].text).toBe('이제 당신의 차례입니다 !');
    for (const entry of log) {
      expect(entry.inViewport, entry.key).toBe(true);
      // 문구·숫자·«녹음 중» 내내 영상은 5.0초 정지 화면이다
      expect(entry).toMatchObject({ paused: true, time: 5 });
    }
    // 3·2·1에는 숫자 말고 아무 글도 없다(11/8 Bumm님 «뭘 3·2·1에 계속 밑에 주저리 나오냐»)
    for (const [i, entry] of log.slice(1, 4).entries()) {
      expect(entry.text).toBe(String(3 - i));
      expect(entry.uncovered, entry.key).toBe(true);
    }
    // 말할 차례 문구는 녹음기가 켜질 때 «녹음 중»과 같은 그림에 뜨고, «녹음 중»은 그 막 위에 가려지지 않는다
    expect(log[5].text).toBe('이제 당신의 목소리를 들려주세요 !');
    expect(log[5].at - log[4].at).toBeLessThan(50);
    expect(log[4].uncovered, '«녹음 중»이 문구 막에 가려졌다').toBe(true);
    // 문구 → 3 → 2 → 1은 1초씩이다. 한 기준 시각에서 재므로 한 칸이 늦게 그려져도 다음 칸이 밀리지 않는다 —
    // 칸마다는 그리기 지연만큼 흔들려도(병렬 부하) 문구에서 «1»까지는 3초 그대로다.
    const steps = log.slice(1, 4).map((entry, i) => entry.at - log[i].at);
    for (const ms of steps) {
      expect(ms, JSON.stringify(steps)).toBeGreaterThan(850);
      expect(ms, JSON.stringify(steps)).toBeLessThan(1250);
    }
    expect(log[3].at - log[0].at).toBeGreaterThan(2950);
    expect(log[3].at - log[0].at).toBeLessThan(3250);
    // «1» 1초 뒤 녹음기가 켜지면(첫 소리 조각, 수십 ms) «녹음 중» — 절정에서 4초 남짓
    const wait = (log[4].at - log[0].at) / 1000;
    expect(wait).toBeGreaterThan(3.95);
    expect(wait).toBeLessThan(4.8);
    await expect(page.locator('#count')).toHaveCount(0);
    await expect(page.locator('.record-left')).toBeVisible();
    // 말할 차례 문구는 숫자 하나와 같은 1초 뒤 사라지고, 그때 녹음은 아직 이어진다(«녹음 중»이 남아 있다)
    await expect.poll(async () => (await countdownEnds(page)).length).toBe(1);
    const [end] = await countdownEnds(page);
    expect(end.recording, '문구가 사라질 때 녹음도 끝나 있었다').toBe(true);
    const shown = end.at - log[5].at;
    expect(shown).toBeGreaterThan(850);
    expect(shown).toBeLessThan(1250);
  });
}
