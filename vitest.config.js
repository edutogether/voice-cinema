import { defineConfig } from 'vitest/config';

// 2026-09-07, 대표 승인 vitest 이전 — functions/는 별도 npm 패키지(자체
// node_modules/package-lock)라 여기서 다루지 않는다(functions/vitest.config.js 참고).
// include를 정확히 이 두 파일로만 좁혀서, functions/node_modules 안의 서드파티
// 테스트 파일이 잘못 주워지는 문제(팀장 조사에서 실제로 확인됨)를 원천적으로 피한다.
export default defineConfig({
  test: {
    include: ['docs/test/*.test.js', 'test/*.test.js'],
  },
});
