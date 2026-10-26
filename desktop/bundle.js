'use strict';
// 설치판이 웹 산출물(dist)을 정본 주소 https://voice.edutogether.kr 그대로 띄우는 부분.
//
// 주소를 바꾸지 않는 이유: 업로드 서버의 허용 출처(functions/index.js의 ALLOWED_ORIGINS)와 App Check(reCAPTCHA)의 허용 도메인이
// 이 주소다. file:// 이나 새 주소로 띄우면 화면은 떠도 QR 업로드가 늘 막힌다. 그래서 주소는 그대로 두고 그 주소의 파일만 설치판 안에서
// 읽는다 — 웹에서 서비스워커가 캐시로 화면을 내는 것과 같은 일을, 설치할 때 이미 다 받아 둔 파일로 한다. 다른 주소(reCAPTCHA ·
// 업로드 서버)는 건드리지 않고 그대로 인터넷으로 보낸다(main.js).
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const ORIGIN = 'https://voice.edutogether.kr';

// dist에 있는 파일 종류. test/bundle.test.js가 dist의 모든 확장자가 여기 있는지 본다 — 새 종류가 생기면 여기 더한다.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function isBundleUrl(url) {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
}

/** firebase.json에서 모든 경로(`source: "**"`)에 붙는 헤더 — CSP · Permissions-Policy 같은 보안 헤더를 웹과 똑같이 붙인다. */
function hostingHeaders(firebaseJson) {
  const headers = {};
  for (const rule of firebaseJson.hosting.headers) {
    if (rule.source !== '**') continue;
    for (const { key, value } of rule.headers) headers[key] = value;
  }
  return headers;
}

/**
 * 주소의 경로를 web 폴더 안의 파일로 바꾼다. 없거나 폴더 밖을 가리키면 null.
 * `/sw.js`는 일부러 없다고 답한다 — 설치판은 파일이 전부 안에 있어 서비스워커가 필요 없고, 등록되면 그 서비스워커가 받는 요청이
 * 이 처리기를 거치지 않아 인터넷의 다른 판이 섞일 수 있다. 등록 실패는 src/lib/sw.ts가 경고만 남기고 넘긴다.
 */
function resolveFile(root, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel === '/sw.js') return null;
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(root, `.${rel}`);
  if (!file.startsWith(root + path.sep)) return null;
  try {
    return fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/** `Range: bytes=…` 한 구간. 없거나 읽을 수 없으면 null(전체), 파일 밖이면 'unsatisfiable'. 영상이 구간 요청을 쓴다(Hosting도 206으로 답한다). */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end) return 'unsatisfiable';
  return { start, end };
}

/** web 폴더(root, 절대 경로)의 파일로 요청에 답한다. */
async function serveBundle(request, root, headers) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  const file = resolveFile(root, new URL(request.url).pathname);
  if (!file) return new Response('Not Found', { status: 404, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });

  const { size } = await fs.promises.stat(file);
  const base = { ...headers, 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const range = parseRange(request.headers.get('range'), size);
  if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });

  const { start, end } = range ?? { start: 0, end: size - 1 };
  const length = Math.max(0, end - start + 1);
  const out = { ...base, 'Content-Length': String(length) };
  if (range) out['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const body = request.method === 'HEAD' || length === 0 ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status: range ? 206 : 200, headers: out });
}

module.exports = { ORIGIN, TYPES, isBundleUrl, hostingHeaders, resolveFile, parseRange, serveBundle };
