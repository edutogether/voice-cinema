// 장면 그림(stills · thumbs의 JPEG)마다 같은 그림의 AVIF를 옆에 만든다(2026-10-24 대표님 결정 — 와이파이 최적화 ⑥).
//   node tools/build-avif.mjs [장르 ...]   (장르를 안 주면 전부)
//
// 화면은 <picture>로 AVIF를 먼저 쓰고, AVIF를 못 읽는 기기는 JPEG을 그대로 쓴다(src/genres.ts · GenreTile · SceneCarousel · Result).
// 🔴 JPEG만 있고 AVIF가 없으면 AVIF를 읽는 기기에서 그림이 깨진다(<picture>는 받기 실패를 JPEG으로 되돌리지 않는다) —
//    test/scene-images.test.js가 짝을 본다. tools/build-scene.mjs가 장면을 만들 때 이 도구를 부른다.
// 설정은 16장을 견줘 골랐다(_docs/intents/2026-10-24-wifi-speed/intent.md): 4:2:0 · crf 10 · SSIM 맞춤 —
// 지금 JPEG 대비 SSIM 평균 0.9927 · 가장 낮은 0.9917, 합계 24% 작음. 4:4:4는 더 작지만 AV1 High 프로필이라 일부 사파리가 못 연다.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';

const clips = fileURLToPath(new URL('../public/clips/', import.meta.url));
const only = process.argv.slice(2);

export function avifArgs(src, out) {
  return ['-y', '-v', 'error', '-i', src, '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '10', '-cpu-used', '3',
    '-aom-params', 'tune=ssim', '-pix_fmt', 'yuv420p', out];
}

export function buildAvif(genres) {
  for (const dir of ['stills', 'thumbs']) {
    for (const name of readdirSync(join(clips, dir)).filter((f) => f.endsWith('.jpg')).sort()) {
      const genre = name.slice(0, -'.jpg'.length);
      if (genres.length && !genres.includes(genre)) continue;
      const src = join(clips, dir, name);
      const out = join(clips, dir, `${genre}.avif`);
      execFileSync('ffmpeg', avifArgs(src, out), { stdio: ['ignore', 'inherit', 'inherit'] });
      console.log(`${dir}/${genre}: JPEG ${(statSync(src).size / 1024).toFixed(0)}KB → AVIF ${(statSync(out).size / 1024).toFixed(0)}KB`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) buildAvif(only);
