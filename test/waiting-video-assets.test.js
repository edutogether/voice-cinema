import { test, expect } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import manifest from '../src/lib/waiting-videos.json';
import { waitingSets } from '../src/lib/waitingSets.ts';

// 저장 대기 화면의 대기 영상 12편(2026-11-09, Poster Studio 2806349의 waiting-v3를 바이트 그대로 옮김 — Bumm님 «로딩 영상 12종하고 문구랑 다 그대로»).
// 목록 · 파일 · 정지 그림 · 캐시 규칙이 서로 맞는지 고정한다(Poster Studio test/waiting-video-assets.test.js와 같은 검사).
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// firebase.json 머리글 «source» 글롭 풀이 — Poster Studio scripts/verify/hosting-glob.mjs와 같다. 이 저장소는 앞의 «/»를 빼고도 쓰므로 양쪽에서 떼고 맞춘다.
// «**/» · «**»는 잠깐 다른 글자로 바꿔 두었다가 마지막에 풀이로 바꾼다(그 사이 «*» 풀이에 섞이지 않게).
const DIR_ANY = '\uE000';
const ALL = '\uE001';
const hostingGlob = (g) => new RegExp('^' + g.replace(/^\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('**/', DIR_ANY).replaceAll('**', ALL).replace(/\*/g, '[^/]*').replaceAll(DIR_ANY, '(?:.*/)?').replaceAll(ALL, '.*') + '$');
const cacheControl = (rules, pathname) => {
  let value;
  for (const r of rules) if (hostingGlob(r.source).test(pathname.replace(/^\//, ''))) for (const h of r.headers) if (h.key.toLowerCase() === 'cache-control') value = h.value;
  return value;
};

test('목록은 01~12 열두 편이고 모두 승인된 파일을 가리킨다', () => {
  expect(manifest.map((entry) => entry.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  for (const entry of manifest) {
    const nn = String(entry.id).padStart(2, '0');
    expect(entry.status).toBe('approved');
    expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.src).toBe(`/waiting-v3/${nn}-${entry.sha256.slice(0, 12)}.mp4`);
    expect(entry.still).toBe(`/waiting-v3/${nn}.webp`);
  }
});

test('영상 파일은 목록의 해시 · 크기와 같고 3MB 이하의 mp4다', () => {
  for (const entry of manifest) {
    const file = 'public' + entry.src;
    const bytes = fs.readFileSync(file);
    expect(sha(file)).toBe(entry.sha256);
    expect(bytes.length).toBe(entry.bytes);
    expect(bytes.length).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
  }
});

test('대기 화면의 정지 그림은 그 편 영상의 첫 프레임 그림(목록의 해시)이다', () => {
  for (const scene of waitingSets) {
    const entry = manifest.find((item) => item.id === scene.id);
    expect(scene.image).toBe(entry.still);
    expect(sha('public' + scene.image)).toBe(entry.stillSha256);
  }
});

test('목록에 없는 파일이 폴더에 남아 있지 않다', () => {
  const expected = new Set(manifest.flatMap((entry) => [entry.src, entry.still].map((path) => path.split('/').pop())));
  expect(new Set(fs.readdirSync('public/waiting-v3'))).toEqual(expected);
});

test('대기 영상은 1년 immutable이고, 이름이 고정인 정지 그림은 그 규칙에 걸리지 않는다', () => {
  const rules = JSON.parse(fs.readFileSync('firebase.json', 'utf8')).hosting.headers;
  // 풀이가 이 저장소의 다른 규칙을 맞게 읽는지 먼저 본다(풀이가 틀리면 아래 검사가 아무것도 증명하지 못한다)
  expect(cacheControl(rules, '/assets/main-abc.js')).toBe('public, max-age=31536000, immutable');
  expect(cacheControl(rules, '/clips/sf.mp4')).toBe('public, max-age=86400');
  expect(cacheControl(rules, '/index.html')).toBe('no-cache');
  for (const entry of manifest) {
    expect(cacheControl(rules, entry.src)).toBe('public, max-age=31536000, immutable');
    expect(cacheControl(rules, entry.still)).toBe('no-cache');
  }
});
