// 장면 그림의 AVIF 짝(2026-10-24 와이파이 최적화 ⑥). 화면은 <picture>로 AVIF를 먼저 쓰는데, AVIF를 읽는 기기에서 그 파일이 없으면
// JPEG으로 되돌아가지 않고 그림이 깨진다 — 그래서 JPEG마다 AVIF가 있어야 하고, 모든 기기가 읽는 4:2:0(AV1 Main)이어야 한다.
import { test, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clips = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clips');

for (const dir of ['stills', 'thumbs']) {
  test(`${dir}: JPEG마다 같은 이름의 AVIF가 있고, AVIF는 4:2:0(AV1 Main 프로필)이다`, () => {
    const jpgs = readdirSync(path.join(clips, dir)).filter((f) => f.endsWith('.jpg'));
    expect(jpgs.length).toBeGreaterThan(0);
    for (const jpg of jpgs) {
      const avif = path.join(clips, dir, jpg.replace(/\.jpg$/, '.avif'));
      expect(existsSync(avif), `${dir}/${jpg}의 AVIF가 없다 — node tools/build-avif.mjs`).toBe(true);
      const buf = readFileSync(avif);
      expect(buf.toString('latin1', 4, 12), `${avif}가 AVIF가 아니다`).toBe('ftypavif');
      // av1C 상자: 둘째 바이트 위 3비트가 seq_profile(0 = Main, 4:2:0). High(1)는 4:4:4라 일부 사파리가 못 연다
      const at = buf.indexOf('av1C', 0, 'latin1');
      expect(at, `${avif}에 av1C가 없다`).toBeGreaterThan(0);
      expect(buf[at + 5] >> 5, `${avif}가 AV1 Main 프로필이 아니다`).toBe(0);
    }
  });
}
