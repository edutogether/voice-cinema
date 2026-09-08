import { defineConfig } from 'vitest/config';

// 루트 패키지의 유닛테스트만 포함한다. functions/는 자체 node_modules를 가진
// 독립 패키지라 여기서 아예 건드리지 않는다 — 그래야 그 안의 서드파티 테스트
// 파일이 잘못 주워지는 문제가 원천적으로 생기지 않는다.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/*.test.js'],
  },
});
