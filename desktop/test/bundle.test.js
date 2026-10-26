'use strict';
// 설치판이 정본 주소의 요청을 web 폴더의 파일로 답하는 규칙(bundle.js). 웹 산출물(../dist)을 그대로 쓰므로 루트에서 먼저 빌드한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ORIGIN, TYPES, isBundleUrl, hostingHeaders, resolveFile, parseRange, serveBundle } = require('../bundle');

const DIST = path.resolve(__dirname, '..', '..', 'dist');
const FIREBASE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firebase.json'), 'utf8'));
const HEADERS = hostingHeaders(FIREBASE);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test('웹 산출물이 있다 — 없으면 루트에서 npm run build부터', () => {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), `${DIST}/index.html 없음`);
});

test('dist의 모든 파일 종류에 Content-Type이 정해져 있다', () => {
  const unknown = [...new Set(walk(DIST).map((f) => path.extname(f).toLowerCase()))].filter((ext) => !TYPES[ext]);
  assert.deepEqual(unknown, []);
});

test('정본 주소만 설치판 안에서 답한다 — 업로드 서버 · reCAPTCHA · 옛 주소는 인터넷으로', () => {
  assert.equal(ORIGIN, 'https://voice.edutogether.kr');
  assert.ok(isBundleUrl('https://voice.edutogether.kr/'));
  assert.ok(isBundleUrl('https://voice.edutogether.kr/clips/sf.mp4?v=1234abcd'));
  for (const url of [
    'https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/upload',
    'https://www.google.com/recaptcha/enterprise.js',
    'https://voice-cinema.web.app/',
    'https://voice.edutogether.kr.attacker.com/',
    'http://voice.edutogether.kr/',
    'not a url',
  ]) assert.equal(isBundleUrl(url), false, url);
});

test('보안 헤더는 firebase.json의 모든 경로 규칙 그대로다(마이크는 이 주소에만)', () => {
  assert.match(HEADERS['Content-Security-Policy'], /connect-src 'self' blob: https:\/\/asia-northeast3-inky-voice-cinema\.cloudfunctions\.net/);
  assert.equal(HEADERS['Permissions-Policy'], 'microphone=(self), camera=(), geolocation=()');
  assert.equal(HEADERS['X-Content-Type-Options'], 'nosniff');
});

test('경로 → 파일: 첫 화면 · 쿼리 무시 · 폴더 밖 · 서비스워커', () => {
  const root = path.resolve(DIST);
  assert.equal(resolveFile(root, '/'), path.join(root, 'index.html'));
  assert.equal(resolveFile(root, '/privacy.html'), path.join(root, 'privacy.html'));
  assert.equal(resolveFile(root, '/vendor/ffmpeg-core/ffmpeg-core.wasm'), path.join(root, 'vendor', 'ffmpeg-core', 'ffmpeg-core.wasm'));
  // 폴더 밖으로 나가지 못한다(%2e%2e는 주소 해석이 걸러 주지 않는다)
  assert.equal(resolveFile(root, '/%2e%2e/firebase.json'), null);
  assert.equal(resolveFile(root, '/..%5Cfirebase.json'), null);
  assert.equal(resolveFile(root, '/%E0%A4%A'), null);
  assert.equal(resolveFile(root, '/no-such-file.js'), null);
  assert.equal(resolveFile(root, '/clips'), null);
  // 설치판에는 서비스워커를 등록하지 않는다
  assert.ok(fs.existsSync(path.join(root, 'sw.js')));
  assert.equal(resolveFile(root, '/sw.js'), null);
});

test('구간 요청(Range) 해석', () => {
  assert.equal(parseRange(null, 100), null);
  assert.equal(parseRange('bytes=-', 100), null);
  assert.equal(parseRange('bytes=0-9,20-29', 100), null);
  assert.deepEqual(parseRange('bytes=0-', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseRange('bytes=90-200', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(parseRange('bytes=100-', 100), 'unsatisfiable');
  assert.equal(parseRange('bytes=20-10', 100), 'unsatisfiable');
});

test('파일 전체 · 일부 · 머리만 · 없는 파일 · 쓰기 요청에 Hosting처럼 답한다', async () => {
  const root = path.resolve(DIST);
  const clip = walk(path.join(root, 'clips')).find((f) => f.endsWith('.mp4'));
  const rel = path.relative(root, clip).split(path.sep).join('/');
  const bytes = fs.readFileSync(clip);

  const whole = await serveBundle(new Request(`${ORIGIN}/${rel}?v=0`), root, HEADERS);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-type'), 'video/mp4');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.equal(whole.headers.get('content-security-policy'), HEADERS['Content-Security-Policy']);
  assert.ok(Buffer.from(await whole.arrayBuffer()).equals(bytes));

  const part = await serveBundle(new Request(`${ORIGIN}/${rel}`, { headers: { Range: 'bytes=100-199' } }), root, HEADERS);
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 100-199/${bytes.length}`);
  assert.equal(part.headers.get('content-length'), '100');
  assert.ok(Buffer.from(await part.arrayBuffer()).equals(bytes.subarray(100, 200)));

  const head = await serveBundle(new Request(`${ORIGIN}/`, { method: 'HEAD' }), root, HEADERS);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(head.headers.get('content-length'), String(fs.statSync(path.join(root, 'index.html')).size));

  const outside = await serveBundle(new Request(`${ORIGIN}/${rel}`, { headers: { Range: `bytes=${bytes.length}-` } }), root, HEADERS);
  assert.equal(outside.status, 416);
  assert.equal(outside.headers.get('content-range'), `bytes */${bytes.length}`);

  assert.equal((await serveBundle(new Request(`${ORIGIN}/sw.js`), root, HEADERS)).status, 404);
  assert.equal((await serveBundle(new Request(`${ORIGIN}/`, { method: 'POST', body: 'x' }), root, HEADERS)).status, 405);
});
