import js from '@eslint/js';

// TypeScript/JSX 소스(src/)는 `npm run build`의 `tsc --noEmit`이 타입까지 검사하므로,
// eslint는 나머지 JS(서버, 빌드 스크립트, 테스트, 서비스워커 원본)만 본다.
export default [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'functions/node_modules/**',
      'public/vendor/**',
      'dist/**',
      'src/**', // tsc가 담당
      'outputs/**',
      'cert/**',
      'tmp/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    // 이 코드베이스는 "실패해도 무시해도 되는" 정리 작업(pause(), revokeObjectURL() 등)에
    // 빈 catch{} 를 의도적으로 쓴다 — 버그가 아니라 확립된 패턴이라 허용한다.
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Firebase Functions 백엔드 — ESM("type":"module")
    files: ['functions/**/*.js'],
    ignores: ['functions/node_modules/**', 'functions/test/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly', console: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly', AbortController: 'readonly',
      },
    },
  },
  {
    files: ['functions/test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    // 빌드·검증 도구와 루트 설정 — Node에서 돈다. compare-visual.js는 그 안에
    // page.evaluate()로 브라우저에서 실행되는 코드를 함께 담고 있어 두 전역이 다 필요하다.
    files: ['tools/*.js', '*.config.js', '*.config.mjs'],
    ignores: ['tools/sw-template.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly', console: 'readonly',
        window: 'readonly', document: 'readonly', getComputedStyle: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
      },
    },
  },
  {
    // 서비스워커 원본. 빌드 시점에 치환되는 자리표시자(__PRECACHE_URLS__ 등)가
    // 들어 있어 그 자체로는 실행되지 않는 템플릿이라, 문법 검사만 통과하면 된다.
    files: ['tools/sw-template.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
    rules: { 'no-undef': 'off' },
  },
  {
    // Playwright E2E 테스트 + 설정
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly', console: 'readonly',
        // page.evaluate() 안에서 실행돼 브라우저 컨텍스트를 쓰는 코드가 있다.
        navigator: 'readonly', caches: 'readonly', document: 'readonly', window: 'readonly',
      },
    },
  },
  {
    // 루트 유닛테스트(계약 검사)
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly' },
    },
  },
];
