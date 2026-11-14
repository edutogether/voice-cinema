// 2026-11-14: 장르마다 원판 길이 · 멈춤 시각이 다르다(11/14 완성본 — Bumm님 «폭주기관차 올려» 뒤 여덟 편 모두, 멈춤 12.0 · 13.9 · 15.0초).
// 완성본은 편마다 길이가 달라(21.0~30.1초) src/genres.ts가 길이를 원판 파일에서 읽는다(tools/clip-versions.js의 lengths).
// 여기서는 그 읽기가 맞는지, 그리고 합성용 원판 · 미리보기가 원판과 어긋나지 않는지를 본다 — 어긋나면 녹음실이 엉뚱한 자리에서 멈추거나,
// 합성이 목소리를 낮추지 않은 자리에 넣는다. mp4 길이는 moov 안 mvhd 상자에서 읽는다(ffprobe 없이 — CI 러너에 기대지 않는다).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { clipVersions, mp4Seconds } from '../tools/clip-versions.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const clips = path.join(root, 'public', 'clips');
const seconds = (rel) => mp4Seconds(readFileSync(path.join(clips, rel)), rel);

const source = readFileSync(path.join(root, 'src', 'genres.ts'), 'utf8');
const num = (re, what) => {
  const m = source.match(re);
  if (!m) throw new Error(`genres.ts에서 ${what}을(를) 찾지 못함`);
  return Number(m[1]);
};
// 완성본 멈춤은 보통 12.0초(film의 기본값), 편마다 film([...], 15)처럼 다를 수 있다.
// 상대 대사는 film([say('대사', 시작, 끝), …])의 그 줄들이다(드라마 두 줄 — 11/14).
const filmPause = num(/const film = \(lines: Line\[\], pause = ([\d.]+)\)/, '완성본 멈춤 기본값');
const genres = [...source.matchAll(/scene\(\{ id: '([a-z]+)'[^\n]*\.\.\.film\((\[[^\]]*\])(?:, ([\d.]+))?\)/g)]
  .map((m) => {
    const lines = [...m[2].matchAll(/say\('[^']*', ([\d.]+), ([\d.]+)\)/g)].map((s) => [Number(s[1]), Number(s[2])]);
    return { id: m[1], pause: Number(m[3] ?? filmPause), lines };
  });

test('장르 여덟 개를 모두 읽었고, 완성본 길이는 숫자로 박혀 있지 않다', () => {
  expect(genres.map((g) => g.id).sort()).toEqual(['animation', 'drama', 'fantasy', 'hero', 'musical', 'sf', 'sports', 'thriller']);
  expect(source).not.toMatch(/const film = [^\n]*seconds:/);
  expect(filmPause).toBe(12);
  expect(source).toMatch(/seconds: lengths\[`\$\{g\.id\}\.mp4`\]/);
});

test('화면이 받는 길이 목록(virtual:clip-versions의 lengths)이 원판 mvhd 길이와 같다', async () => {
  const plugin = clipVersions({ dir: clips });
  const code = plugin.load(plugin.resolveId('virtual:clip-versions'));
  const lengths = JSON.parse(code.match(/export const lengths = (\{.*\});/)[1]);
  for (const { id } of genres) expect(lengths[`${id}.mp4`]).toBeCloseTo(seconds(`${id}.mp4`), 3);
});

test('상대 대사 자막은 줄마다 멈춤 전에 끝나고 서로 겹치지 않는다 — 드라마는 아빠 · 할머니 두 줄', () => {
  // 할머니 줄은 원판 소리에서 9.0~11.8초다(11/14 다시 잼 — 예전 값 5.3~7.6초는 소리보다 3.7초 일렀다)
  expect(genres.find((g) => g.id === 'drama').lines).toEqual([[0.1, 1.7], [8.9, 11.9]]);
  for (const { id, lines, pause } of genres) {
    expect(lines.length, id).toBeGreaterThan(0);
    lines.forEach(([start, end], i) => {
      expect(start, id).toBeGreaterThanOrEqual(0);
      expect(end, id).toBeGreaterThan(start);
      expect(end, id).toBeLessThanOrEqual(pause);
      if (i > 0) expect(start, id).toBeGreaterThanOrEqual(lines[i - 1][1]);
    });
  }
});

test.each(genres)('$id: 합성용 원판은 원판과 같은 길이, 미리보기는 멈춤 시각까지, 목소리 칸이 원판 안에 든다', ({ id, pause }) => {
  const length = seconds(`${id}.mp4`);
  expect(length).toBeGreaterThanOrEqual(pause + 3.5);
  expect(seconds(`final/${id}.mp4`)).toBeCloseTo(length, 1);
  expect(seconds(`previews/${id}.mp4`)).toBeCloseTo(pause, 1);
});
