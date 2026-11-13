// 2026-11-14: 장르마다 원판 길이 · 멈춤 시각이 다르다(10초 장면 5.0초, 11/14 완성본 20.6초 · 12.0초 — Bumm님 «폭주기관차 올려»).
// src/genres.ts의 값과 public/clips의 mp4가 어긋나면 녹음실이 엉뚱한 자리에서 멈추거나, 합성이 목소리를 낮추지 않은 자리에 넣는다.
// mp4 길이는 moov 안 mvhd 상자에서 읽는다(ffprobe 없이 — CI 러너에 기대지 않는다).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const clips = path.join(root, 'public', 'clips');

function mp4Seconds(file) {
  const b = readFileSync(file);
  const at = b.indexOf('mvhd');
  if (at < 0) throw new Error(`${file}: mvhd 없음`);
  const version = b[at + 4];
  return version === 1
    ? Number(b.readBigUInt64BE(at + 28)) / b.readUInt32BE(at + 24)
    : b.readUInt32BE(at + 20) / b.readUInt32BE(at + 16);
}

const source = readFileSync(path.join(root, 'src', 'genres.ts'), 'utf8');
const num = (re, what) => {
  const m = source.match(re);
  if (!m) throw new Error(`genres.ts에서 ${what}을(를) 찾지 못함`);
  return Number(m[1]);
};
const film = { seconds: num(/const film = [^\n]*seconds: ([\d.]+)/, '완성본 길이'), pause: num(/const film = [^\n]*pause: ([\d.]+)/, '완성본 멈춤') };
const scene10 = { seconds: 10, pause: 5 };
const genres = [...source.matchAll(/scene\(\{ id: '([a-z]+)'[^\n]*\.\.\.(film\(|scene10)/g)].map((m) => ({ id: m[1], ...(m[2] === 'scene10' ? scene10 : film) }));

test('장르 여덟 개를 모두 읽었다', () => {
  expect(genres.map((g) => g.id)).toHaveLength(8);
  expect(genres.filter((g) => g.seconds !== 10).map((g) => g.id).sort()).toEqual(['animation', 'hero', 'musical']);
});

test.each(genres)('$id: 원판 · 합성용 원판은 장르 길이, 미리보기는 멈춤 시각까지', ({ id, seconds, pause }) => {
  expect(mp4Seconds(path.join(clips, `${id}.mp4`))).toBeCloseTo(seconds, 1);
  expect(mp4Seconds(path.join(clips, 'final', `${id}.mp4`))).toBeCloseTo(seconds, 1);
  expect(mp4Seconds(path.join(clips, 'previews', `${id}.mp4`))).toBeCloseTo(pause, 1);
});
