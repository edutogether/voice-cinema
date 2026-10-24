// 부스 연속 운영(10/24 대표님 지시) — 아이 여러 명이 잇달아 녹음·저장해도 오디오 장치·엔진 임시 파일·주소(blob URL)·메모리가 쌓이지 않고,
// 앞 아이의 목소리가 다음 아이 영화에 섞이지 않는다. 제품 코드에는 손대지 않고 이 페이지에서만 세어 본다.
import { test, expect } from '@playwright/test';
import { installSyntheticMic, rawTake, recordOnce } from './synthetic-mic.js';
import { leadRange, placement, voiceInMovie } from './movie-check.js';

// 목소리 높이는 서로의 배음(2배·3배)과 겹치지 않게 골랐다 — 220과 440처럼 겹치면 섞이지 않았어도 섞인 것처럼 잡힌다
const ROUNDS = [['sf', 'SF', 230], ['fantasy', '판타지', 290], ['hero', '히어로', 370], ['drama', '드라마', 470], ['musical', '뮤지컬', 590]];

test('아이 다섯 명이 잇달아 녹음·저장해도 자원이 쌓이지 않고 영화마다 그 아이 목소리만 들어간다', async ({ page }) => {
  test.setTimeout(600000);
  const uploads = [];
  await page.route('**/voiceCinema/upload', (route) => {
    uploads.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/longrun.mp4' }) });
  });
  await installSyntheticMic(page, ROUNDS.map(([, , f0]) => ({ delay: 0.3, dur: 1.8, f0 })));
  await page.addInitScript(() => {
    const counts = { contexts: [], written: new Set(), deleted: new Set(), urls: 0, revoked: 0 };
    window.__res = counts;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); counts.contexts.push(this); }
    };
    const post = window.Worker.prototype.postMessage;
    window.Worker.prototype.postMessage = function (msg, ...rest) {
      if (msg?.type === 'WRITE_FILE') counts.written.add(msg.data.path);
      if (msg?.type === 'DELETE_FILE') counts.deleted.add(msg.data.path);
      return post.call(this, msg, ...rest);
    };
    const create = window.URL.createObjectURL;
    window.URL.createObjectURL = (o) => { counts.urls++; return create(o); };
    const revoke = window.URL.revokeObjectURL;
    window.URL.revokeObjectURL = (u) => { counts.revoked++; return revoke(u); };
  });
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const snapshots = [];
  for (const [i, [id, name]] of ROUNDS.entries()) {
    await page.getByRole('button', { name: `${name} 더빙 시작`, exact: true }).click();
    expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
    await page.locator('#saveBtn').click();
    await expect(page.locator('#qrbox')).toBeVisible({ timeout: 90000 });
    // 이 영화에는 이 아이의 목소리 높이만 있다(앞 아이들의 높이는 그 1/20 아래)
    const v = await voiceInMovie(page, uploads.at(-1).dataBase64, id, ROUNDS.map(([, , f]) => f));
    const mine = v.tones[i];
    for (const [j, other] of v.tones.entries()) if (j !== i) expect(mine, `${i + 1}번째 영화에 ${j + 1}번째 목소리`).toBeGreaterThan(20 * other);
    // 말소리는 5.0초 + 0.12초 안팎에 앞·끝을 잃지 않고 들어간다(녹음 파일에 실제로 담긴 말소리 기준)
    const raw = await rawTake(page, i);
    const at = placement(v, raw);
    expect(at.lead, `${i + 1}번째 영화 ${JSON.stringify({ v, raw, at })}`).toBeGreaterThanOrEqual(leadRange(raw).min);
    expect(at.lead).toBeLessThanOrEqual(leadRange(raw).max);
    expect(Math.abs(at.lost)).toBeLessThan(0.03);
    await page.locator('#doneHomeBtn').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
    // 녹음실을 나오면 그 녹음실의 오디오 장치를 닫는다(닫기는 비동기라 잠깐 기다린다)
    await expect.poll(() => page.evaluate(() => window.__res.contexts.filter((c) => c !== window.__mic.ctx && c.state !== 'closed').length)).toBe(0);
    snapshots.push(await page.evaluate(() => {
      const r = window.__res;
      const appContexts = r.contexts.filter((c) => c !== window.__mic.ctx);
      return { open: appContexts.filter((c) => c.state !== 'closed').length, made: appContexts.length,
        leftFiles: [...r.written].filter((p) => !r.deleted.has(p)), outstandingUrls: r.urls - r.revoked };
    }));
    snapshots.at(-1).heap = await heap();
  }
  console.log(JSON.stringify(snapshots.map((s) => ({ ...s, heapMB: +(s.heap / 1048576).toFixed(1) }))));
  for (const s of snapshots) {
    // 녹음실을 나오면 그 녹음실의 오디오 장치는 닫혀 있다
    expect(s.open).toBe(0);
    // 엔진 안 임시 파일은 작업마다 지운다
    expect(s.leftFiles).toEqual([]);
  }
  // 아이가 바뀌어도 남는 주소(blob URL)와 메모리가 늘지 않는다 — 처음 한 번 받는 엔진 몫을 뺀 2번째와 5번째를 견준다
  expect(snapshots[4].outstandingUrls).toBe(snapshots[1].outstandingUrls);
  expect(snapshots[4].heap - snapshots[1].heap).toBeLessThan(20 * 1048576);
});
