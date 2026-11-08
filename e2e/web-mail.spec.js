// 웹(크롬)에서도 QR을 만들지 못하면 인솔 선생님 메일 칸을 띄운다(2026-11-08 Bumm님 «웹도 끊기면 메일 칸을 띄움»).
// 영상 · 이름 · 주소는 이 사이트의 IndexedDB에 맡기고, 인터넷이 돌아오면 올리고 → 메일을 보내고 → 지운다.
// 업로드(/upload)와 메일(/mail)은 가로채 프로덕션에 아무것도 쌓이지 않고 메일도 나가지 않는다 — 주소는 가짜다.
// 끊김은 navigator.onLine을 시험이 쥐어 흉내 낸다(새로고침해도 끊긴 채로 시작한다). 원판 · 엔진은 로컬 서버에서 그대로 받는다.
import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';

const UPLOAD_PATTERN = '**/voiceCinema/upload';
const MAIL_PATTERN = '**/voiceCinema/mail';
const TAKE_MS = 40000;
const TEACHER = 'teacher@school.kr';
// 업로드가 실제로 돌려주는 모양(file.publicUrl — «dubs/»의 «/»가 %2F) 그대로 둔다. 11/8까지 시험이 «/» 그대로인 가짜 링크를 써서
// 메일 서버가 진짜 링크를 거절하는 것을 몰랐다(functions/test/mail.test.js)
const MOVIE_URL = 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs%2Fdub_sf_1794124337932_000000000000000000.mp4';
const CONDITIONS = [
  '인터넷이 돌아올 때 이 창이 열려 있어야 보내져요.',
  '크롬 기록(사이트 데이터)을 지우면 보내기 전 영화도 지워져요.',
];

// 더빙 한 번(약 20초) · 합성 · App Check 대기(업로드와 메일에 한 번씩)까지 넉넉히
test.describe.configure({ timeout: 180000 });

function mp4Duration(buffer) {
  const at = buffer.indexOf('mvhd');
  if (at < 0) throw new Error('mvhd 없음');
  const version = buffer[at + 4];
  if (version === 1) return Number(buffer.readBigUInt64BE(at + 28)) / buffer.readUInt32BE(at + 24);
  return buffer.readUInt32BE(at + 20) / buffer.readUInt32BE(at + 16);
}

/** navigator.onLine을 시험이 쥔다 — 끊긴 채로 시작하고, window.__setOnline(true)이 «인터넷이 돌아왔다»(online 신호)를 흉내 낸다. */
async function startOffline(context) {
  await context.addInitScript(() => {
    let online = false;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    window.__setOnline = (value) => {
      online = value;
      window.dispatchEvent(new window.Event(value ? 'online' : 'offline'));
    };
  });
}

/** 업로드 · 메일을 가로채 세고, 둘 다 성공으로 답한다. */
async function catchServer(context) {
  const seen = { uploads: [], mails: [] };
  await context.route(UPLOAD_PATTERN, (route) => {
    seen.uploads.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: MOVIE_URL }) });
  });
  await context.route(MAIL_PATTERN, (route) => {
    seen.mails.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return seen;
}

async function dubAndSave(page, name) {
  await page.goto('/');
  await page.locator('.tile', { hasText: name }).first().click();
  await expect(page.locator('#chipName')).toHaveText(name);
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
  await page.locator('button', { hasText: '저장하기' }).click();
  await expect(page.locator('#mailHandoff')).toBeVisible({ timeout: 60000 });
}

async function enterMail(page, name = '민수') {
  await page.locator('#mailName').fill(name);
  await page.locator('#mailAddress').fill(TEACHER);
  await page.locator('#mailNextBtn').click();
  await expect(page.locator('#mailAddressShown')).toHaveText(TEACHER);
  await page.locator('#mailSendBtn').click();
  await expect(page.locator('#mailConditions')).toBeVisible();
}

/** 이 사이트 IndexedDB에 맡겨 둔 건 수와 영상 수(앱과 같은 모양으로 연다). */
function stored(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = window.indexedDB.open('voice-cinema-mail', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('items', { keyPath: 'id' });
      req.result.createObjectStore('videos');
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['items', 'videos']);
      const items = tx.objectStore('items').count();
      const videos = tx.objectStore('videos').count();
      tx.oncomplete = () => { db.close(); resolve({ items: items.result, videos: videos.result }); };
    };
  }));
}

/** 앱을 거치지 않고 한 건을 맡겨 둔다(지우는 때를 보는 시험용). */
function seed(page) {
  return page.evaluate((email) => new Promise((resolve, reject) => {
    const req = window.indexedDB.open('voice-cinema-mail', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('items', { keyPath: 'id' });
      req.result.createObjectStore('videos');
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['items', 'videos'], 'readwrite');
      tx.objectStore('videos').put(new window.Blob([new Uint8Array(16)], { type: 'video/mp4' }), 'seed');
      tx.objectStore('items').put({ id: 'seed', name: '민수', email, genreId: 'sf', genreName: 'SF', createdAt: Date.now(), attempts: 0, nextAt: 0, failed: false });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), TEACHER);
}

test('끊긴 채 더빙을 마치면 메일 칸이 뜨고, 인터넷이 돌아오면 올리고 메일을 보낸 뒤 맡긴 것을 지운다', async ({ page, context }) => {
  await startOffline(context);
  const seen = await catchServer(context);

  await dubAndSave(page, 'SF');
  await expect(page.locator('#mailHandoff h2')).toHaveText('인터넷이 끊겨 QR을 만들지 못했어요');
  await expect(page.locator('#downloadRow')).toHaveCount(0);
  expect(seen.uploads).toHaveLength(0); // 끊겨 있으면 올리지 않는다

  await enterMail(page);
  await expect(page.locator('#mailHandoff h2')).toHaveText('인터넷이 돌아오면 보내 드릴게요');
  await expect(page.locator('#doneMsg')).toHaveText('이 브라우저에 잠시 보관했다가 인터넷이 돌아오면 보내고 바로 지워요.');
  await expect(page.locator('#mailConditions li')).toHaveText(CONDITIONS);
  expect(await stored(page)).toEqual({ items: 1, videos: 1 });

  await page.locator('#doneHomeBtn').click();
  await expect(page.locator('#mailQueueChip')).toHaveText('메일 대기 1건');
  expect(seen.mails).toHaveLength(0);

  await page.evaluate(() => window.__setOnline(true));
  await expect(page.locator('#mailQueueChip')).toBeHidden({ timeout: 90000 });
  expect(await stored(page)).toEqual({ items: 0, videos: 0 });
  expect(seen.uploads).toHaveLength(1);
  expect(seen.uploads[0].filename).toMatch(/^dub_sf_\d+_[0-9a-f]{12}\.mp4$/);
  const mp4 = Buffer.from(seen.uploads[0].dataBase64, 'base64');
  expect(Math.abs(mp4Duration(mp4) - 10)).toBeLessThanOrEqual(.05);
  expect(seen.mails).toEqual([{ to: TEACHER, items: [{ name: '민수', url: MOVIE_URL }] }]);
});

test('맡긴 뒤 창을 새로고침해도 남아 있고, 다시 연 창이 인터넷이 돌아오면 이어서 보낸다', async ({ page, context }) => {
  await startOffline(context);
  const seen = await catchServer(context);

  await dubAndSave(page, '판타지');
  await enterMail(page, '지우');
  await page.reload();
  await expect(page.locator('#mailQueueChip')).toHaveText('메일 대기 1건');
  expect(await stored(page)).toEqual({ items: 1, videos: 1 });

  await page.evaluate(() => window.__setOnline(true));
  await expect(page.locator('#mailQueueChip')).toBeHidden({ timeout: 90000 });
  expect(await stored(page)).toEqual({ items: 0, videos: 0 });
  expect(seen.mails).toEqual([{ to: TEACHER, items: [{ name: '지우', url: MOVIE_URL }] }]);
});

test('창이 둘 열려 있어도 영화는 한 번만 올리고 메일은 한 통만 보낸다', async ({ context }) => {
  await startOffline(context);
  const seen = await catchServer(context);
  const first = await context.newPage();
  await dubAndSave(first, '히어로');
  await enterMail(first);
  await first.locator('#doneHomeBtn').click();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#mailQueueChip')).toHaveText('메일 대기 1건');

  // 두 창에 같은 때 인터넷이 돌아온다
  await Promise.all([first, second].map((page) => page.evaluate(() => window.__setOnline(true))));
  await expect(first.locator('#mailQueueChip')).toBeHidden({ timeout: 90000 });
  expect(await stored(first)).toEqual({ items: 0, videos: 0 });
  // 다른 창이 같은 때 시작했다면 그 요청도 이미 나갔을 시간 — 잠금이 없으면 여기서 두 번이 된다
  await first.waitForTimeout(3000);
  expect(seen.uploads).toHaveLength(1);
  expect(seen.mails).toHaveLength(1);
});

test('2026-12-01 00:00(한국 시간) 이후 처음 열면 보내지 못한 것을 지우고, 그 1초 전에는 남긴다', async ({ page, context }) => {
  await startOffline(context);
  await page.clock.install({ time: new Date('2026-11-30T23:59:59+09:00') });
  await page.goto('/');
  await seed(page);
  await page.reload();
  await expect(page.locator('#mailQueueChip')).toHaveText('메일 대기 1건');
  expect(await stored(page)).toEqual({ items: 1, videos: 1 });

  await page.clock.setSystemTime(new Date('2026-12-01T00:00:00+09:00'));
  await page.reload();
  await expect.poll(() => stored(page)).toEqual({ items: 0, videos: 0 });
  await expect(page.locator('#mailQueueChip')).toHaveCount(0);
});

test('브라우저가 저장소를 막아 맡기지 못하면 이 기기에 저장으로 간다', async ({ page, context }) => {
  await startOffline(context);
  await context.addInitScript(() => {
    const open = window.IDBFactory.prototype.open;
    window.IDBFactory.prototype.open = function (name, ...rest) {
      if (name === 'voice-cinema-mail') throw new window.DOMException('저장소를 쓸 수 없음', 'SecurityError');
      return open.call(this, name, ...rest);
    };
  });

  await dubAndSave(page, '스포츠');
  await page.locator('#mailName').fill('민수');
  await page.locator('#mailAddress').fill(TEACHER);
  await page.locator('#mailNextBtn').click();
  await page.locator('#mailSendBtn').click();

  await expect(page.locator('#downloadRow')).toBeVisible();
  await expect(page.locator('#mailHandoff')).toHaveCount(0);
  await expect(page.locator('#savemode')).toContainText('자동으로 지워지지 않아요');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadBtn').click()]);
  expect(download.suggestedFilename()).toBe('Voice Cinema_스포츠.mp4');
});
