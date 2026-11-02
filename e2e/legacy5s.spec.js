// 임시 5초 영상(LEGACY_5S, 11/2 대표님 — src/lib/videoSet.ts). 개발 주소는 `?videos=legacy5s`일 때만 켜진다(기존 E2E는 지금 원판 흐름 그대로).
// 영상만 장학사님 Kling 영상의 앞 5초로 바꾸고, 흐름은 «미리보기는 그대로 → 장면 시작 → 바로 3·2·1 → 멘트 → 영상이 처음부터 흐르는 동안 녹음»이다.
// 실제 Chromium · 시험용 마이크(e2e/synthetic-mic.js)로 8장르를 끝까지 돌리고, 한 장르는 ffmpeg.wasm 합성 → (가로챈) 업로드까지 가서
// 완성본이 정확히 5.000초이고 목소리가 아이가 영상을 보며 말한 자리(영상 0초 기준)에 놓였는지 잰다.
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { test, expect } from '@playwright/test';
import { installSyntheticMic, previews, rawTake, takes } from './synthetic-mic.js';

const HOME = '/?videos=legacy5s';
const UPLOAD_PATTERN = '**/voiceCinema/upload';
const NOTE = '영상은 최종 영상으로 교체될 예정입니다';
// 장르 · 1.0 판 제목(Kling 짝이 있는 다섯) 또는 지금 제목 · 멘트 — src/genres.ts
const SCENES = [
  { id: 'sf', name: 'SF', title: '물의 행성', line: '엔진 점화 ! 출발 !' },
  { id: 'fantasy', name: '판타지', title: '주문 한마디로 펼치는 마법', line: '빛이여, 나에게 힘을 줘 !' },
  { id: 'animation', name: '애니메이션', title: '상상 속 친구와 나누는 이야기', line: '안녕 ! 나랑 같이 놀자 !' },
  { id: 'hero', name: '히어로', title: '위기의 순간을 뒤집는 한마디', line: '포기하지 마 ! 우리가 막아 낸다 !' },
  { id: 'thriller', name: '스릴러', title: '어둠 속에서 마주친 낯선 소리', line: '거기… 누구 있어요 ?' },
  { id: 'drama', name: '드라마', title: '마음 깊이 전하고 싶은 진심', line: '고마워. 너는 내 진짜 친구야.' },
  { id: 'sports', name: '스포츠', title: '마지막 슛', line: '마지막 한 골, 들어가라 !' },
  { id: 'musical', name: '뮤지컬', title: '서커스 첫 무대', line: '신사 숙녀 여러분, 쇼 타임 !' },
];
// 3·2·1 0.9초 + 멘트 1초 + 영상 5초 + 끝 0.15초 + 녹음 확인 + 이어 보기 5초 ≈ 13초 — 느린 러너 여유를 둔다
const TAKE_MS = 40000;

/** mp4의 mvhd 상자에서 길이(초)를 읽는다 */
function mp4Duration(buffer) {
  const at = buffer.indexOf('mvhd');
  if (at < 0) throw new Error('mvhd 없음');
  const version = buffer[at + 4];
  if (version === 1) return Number(buffer.readBigUInt64BE(at + 28)) / buffer.readUInt32BE(at + 24);
  return buffer.readUInt32BE(at + 20) / buffer.readUInt32BE(at + 16);
}

/** 녹음 중 영상이 처음 움직인 때(녹음기 켜짐 기준, 초)를 페이지 안에서 기록한다 — 목소리 자리를 견줄 기준 */
async function watchVideoStart(page) {
  await page.addInitScript(() => {
    document.addEventListener('playing', (e) => {
      const take = window.__mic?.takes.at(-1);
      if (e.target.id === 'clip' && take?.startedAt && !take.stoppedAt && take.videoAt === undefined) take.videoAt = performance.now();
    }, true);
  });
}

async function openStudio(page, scene) {
  await page.goto(HOME);
  await page.locator('.tile', { hasText: scene.name }).first().click();
  await expect(page.locator('#chipName')).toHaveText(scene.name);
}

test.describe('임시 5초 영상 — 첫 화면', () => {
  test('8장르 그대로 · «교체 예정» 한 줄 · 카드 영상과 그림은 legacy5s 폴더', async ({ page }) => {
    const clips = [];
    page.on('request', (r) => { if (r.url().includes('/clips/')) clips.push(new URL(r.url()).pathname); });
    await page.goto(HOME);
    await expect(page.locator('.chart-heading h1 span')).toHaveText('8');
    for (const scene of SCENES) await expect(page.locator('.tile', { hasText: scene.name }).first()).toBeAttached();
    await expect(page.locator('#home .temp-video-note')).toHaveText(NOTE);
    await expect.poll(() => clips.filter((p) => p.startsWith('/clips/legacy5s/')).length).toBeGreaterThan(0);
    expect(clips.filter((p) => !p.startsWith('/clips/legacy5s/'))).toEqual([]);
  });

  test('정식 흐름(?videos 없음)에서는 «교체 예정»이 없고 지금 원판을 쓴다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.chart-heading h1 span')).toHaveText('8');
    await expect(page.locator('.temp-video-note')).toHaveCount(0);
  });
});

test.describe('임시 5초 영상 — 녹음실: 3·2·1 → 멘트 → 영상 위에서 녹음', () => {
  for (const scene of SCENES) {
    test(`${scene.name}: 미리보기는 5초 그대로, 장면 시작은 바로 3·2·1 → 멘트 → 영상이 흐르는 동안 녹음 → 이어 보기`, async ({ page }) => {
      test.setTimeout(90000);
      // 녹음기가 켜진 뒤 0.6초부터 3초 말한다 — 영상이 흐르는 동안
      await installSyntheticMic(page, [{ delay: 0.6, dur: 3 }]);
      await watchVideoStart(page);
      await openStudio(page, scene);
      await expect(page.locator('.studio-scene-title h1')).toHaveText(scene.title);
      await expect(page.locator('#studio .temp-video-note')).toHaveText(NOTE);
      const clip = page.locator('#clip');
      await expect.poll(() => clip.evaluate((v) => new window.URL(v.currentSrc || v.src).pathname)).toBe(`/clips/legacy5s/${scene.id}.mp4`);
      await expect.poll(() => clip.evaluate((v) => v.duration)).toBeCloseTo(5, 1);
      // 멈추는 자리 표시가 없고 진행 시계는 5초 기준이다
      await expect(page.locator('[data-testid="pause-mark"]')).toHaveCount(0);
      await expect(page.locator('.clip-time')).toHaveText('05:00');
      await expect(page.locator('.studio-steps')).toContainText('3·2·1 뒤에 멘트가 떠요');

      // 미리보기: 5초 전체를 끝까지 틀고 준비 화면으로 돌아온다(멈추지 않는다).
      // 끝나면 앱이 곧바로 0초로 되감으므로 끝난 자리는 페이지 안에서 남긴다 — 밖에서 currentTime을 물으면 4.5~5초 창을 놓친다.
      // 재생이 끝날 때 브라우저는 pause → ended 순으로 알리고 앱은 pause에서 되감는다 — 그래서 앱보다 먼저 단 pause 듣기에서 읽는다
      await clip.evaluate((v) => {
        window.__previewEnd = null;
        v.addEventListener('pause', () => { window.__previewEnd = { at: v.currentTime, ended: v.ended }; }, { once: true });
      });
      await page.locator('#previewBtn').click();
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
      await page.waitForFunction(() => window.__previewEnd !== null, null, { timeout: 15000 });
      const end = await page.evaluate(() => window.__previewEnd);
      expect(end.ended).toBe(true);
      expect(end.at).toBeGreaterThan(4.9);
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle', { timeout: 10000 });

      // 장면 시작 → 바로 3·2·1(영상은 첫 화면에 서 있다)
      await page.locator('#recBtn').click();
      await page.locator('#count').waitFor({ timeout: 10000 });
      expect(await clip.evaluate((v) => ({ paused: v.paused, time: v.currentTime }))).toEqual({ paused: true, time: 0 });
      await expect(page.locator('.studio-ready')).toContainText('곧 멘트가 떠요 !');
      // 그다음 멘트(1초) — 그동안도 영상은 첫 화면이다
      await page.locator('#cue').waitFor({ timeout: 5000 });
      expect(await page.locator('#cue #line').textContent()).toBe(scene.line);
      expect(await page.locator('#cue .studio-line-label').textContent()).toBe('멘트');
      // 녹음 — 영상이 처음부터 흐르고(소리 끔) 멘트는 그대로 보인다
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'recording', { timeout: 5000 });
      await expect(page.locator('#shout #line')).toHaveText(scene.line);
      await expect(page.locator('#recpill')).toBeVisible();
      await expect.poll(() => clip.evaluate((v) => (v.paused ? -1 : v.currentTime))).toBeGreaterThan(0.5);
      expect(await clip.evaluate((v) => v.muted)).toBe(true);
      // 녹음 중에는 영상을 누르지 않는다(멘트를 보며 인물에 맞춰 말한다)
      expect(await page.locator('.studio-hold-shade').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

      // 영상이 끝나면 녹음도 끝나고 이어 보기 → 녹음 뒤 화면
      await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
      const [take] = await takes(page);
      // 녹음기는 영상 길이(5초) + 영상이 움직이기까지 + 끝 0.15초만큼 켜져 있었다 — 말끝으로 일찍 멈추지 않는다
      expect(take.seconds).toBeGreaterThan(5.1);
      expect(take.seconds).toBeLessThan(6.5);
      // 이어 보기는 영상 0초부터 목소리를 함께 튼다(목소리 자리 = 영상 0초)
      const played = await previews(page);
      expect(played.length).toBeGreaterThan(0);
      expect(played.at(-1).videoTime).toBeLessThan(0.15);
    });
  }

  test('판타지: 합성 → 업로드 — 완성본은 정확히 5.000초이고 목소리는 아이가 영상을 보며 말한 자리에 놓인다', async ({ page }) => {
    test.setTimeout(120000);
    let uploaded = null;
    await page.route(UPLOAD_PATTERN, (route) => {
      uploaded = JSON.parse(route.request().postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_test.mp4' }) });
    });
    const merged = [];
    page.on('request', (r) => { if (r.url().includes('/clips/') && r.url().includes('/final/')) merged.push(new URL(r.url()).pathname); });
    await installSyntheticMic(page, [{ delay: 0.6, dur: 3 }]);
    await watchVideoStart(page);
    await openStudio(page, SCENES[1]);
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });

    // 녹음 안에서 말이 시작된 자리 − 영상이 움직이기 시작한 자리 = 완성본에서 목소리가 시작해야 할 자리
    const raw = await rawTake(page, 0);
    const videoAt = await page.evaluate(() => (window.__mic.takes[0].videoAt - window.__mic.takes[0].startedAt) / 1000);
    expect(videoAt).toBeGreaterThan(0);
    const expected = raw.start - videoAt;

    await page.locator('button', { hasText: '저장하기' }).click();
    await expect(page.locator('#done')).toBeVisible({ timeout: 60000 });
    expect(merged).toContain('/clips/legacy5s/final/fantasy.mp4');
    expect(uploaded.filename).toMatch(/^dub_fantasy_\d+_[0-9a-f]+\.mp4$/);
    const mp4 = Buffer.from(uploaded.dataBase64, 'base64');
    expect(Math.abs(mp4Duration(mp4) - 5)).toBeLessThanOrEqual(0.001);

    // 완성본 소리를 페이지에서 풀어 목소리가 시작하는 자리를 잰다(5ms 창 RMS가 피크의 1/30을 넘는 첫 자리 — rawTake와 같은 잣대)
    const onset = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(window.atob(b64), (c) => c.charCodeAt(0));
      const audio = await new window.OfflineAudioContext(1, 48000, 48000).decodeAudioData(bytes.buffer);
      const data = audio.getChannelData(0);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      const win = Math.round(audio.sampleRate * 0.005);
      for (let at = 0; at + win <= data.length; at += win) {
        let sum = 0;
        for (let i = at; i < at + win; i++) sum += data[i] * data[i];
        if (Math.sqrt(sum / win) >= peak / 30) return { onset: at / audio.sampleRate, duration: audio.duration, peak };
      }
      return { onset: -1, duration: audio.duration, peak };
    }, uploaded.dataBase64);
    expect(onset.peak).toBeGreaterThan(0.05);
    // 영상이 움직인 때를 «playing» 이벤트로 잡아 한 프레임(1/30초) 안팎 어긋날 수 있다 — 두 프레임 안에서 맞는다
    expect(Math.abs(onset.onset - expected)).toBeLessThanOrEqual(2 / 30);
  });

  test('아무 소리도 없으면 저장하지 않고 다시 녹음하게 한다', async ({ page }) => {
    test.setTimeout(60000);
    await installSyntheticMic(page, [{ silent: true }]);
    await openStudio(page, SCENES[4]);
    await page.locator('#recBtn').click();
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'recording', { timeout: 10000 });
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle', { timeout: TAKE_MS });
    await expect(page.locator('#hint')).toHaveAttribute('data-take-check', 'silent');
    await expect(page.locator('#afterRow')).toHaveCount(0);
  });
});
