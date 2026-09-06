import { defineConfig } from 'vitest/config';

// 2026-09-07, 대표 승인 vitest 이전. functions/는 루트와 별개인 독립 npm
// 패키지라(자체 node_modules/package-lock) 여기서 따로 설치·설정한다.
// exclude에 node_modules를 명시해, 그 안의 서드파티 테스트 파일이 잘못
// 주워지는 문제(팀장 조사에서 실제로 확인됨)를 막는다.
export default defineConfig({
  test: {
    include: ['test/*.test.js'],
    exclude: ['node_modules/**'],
  },
});
