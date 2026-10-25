import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { clipVersions } from './tools/clip-versions.js';

// 루트 패키지의 유닛테스트만 포함한다. functions/는 자체 node_modules를 가진
// 독립 패키지라 여기서 아예 건드리지 않는다 — 그래야 그 안의 서드파티 테스트
// 파일이 잘못 주워지는 문제가 원천적으로 생기지 않는다.
// src/genres.ts는 빌드가 만드는 `virtual:clip-versions`(클립 내용 해시)를 쓴다 — 유닛테스트도 같은 플러그인으로 푼다(10/26 src/genres.test.ts).
export default defineConfig({
  plugins: [clipVersions({ dir: fileURLToPath(new URL('./public/clips', import.meta.url)) })],
  test: {
    include: ['src/**/*.test.ts', 'test/*.test.js'],
  },
});
