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
      '_backups/**', // Git 제외 백업(롤백 사본) — 저장소 코드가 아니다
      '_media/**',
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
        setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly',
        URLSearchParams: 'readonly', // kakao.js가 카카오 인증 주소와 폼 본문을 만든다
      },
    },
  },
  {
    // functions 유닛테스트. upload-rate-limit.test.js는 진짜 핸들러를 로컬 서버에
    // 띄워 요청을 보내므로 process(환경변수)와 fetch가 필요하다.
    files: ['functions/test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // feedback-handler.test.js는 카카오 요청의 폼 본문 · 넘겨주는 주소를 읽고, 가짜 Firestore가 문서를 복사해 돌려준다
      globals: { console: 'readonly', Buffer: 'readonly', process: 'readonly', fetch: 'readonly', Response: 'readonly', AbortSignal: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', structuredClone: 'readonly' },
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
        setInterval: 'readonly', clearInterval: 'readonly', setTimeout: 'readonly',
        URL: 'readonly', location: 'readonly',
        fetch: 'readonly', AbortSignal: 'readonly', // live-commit.js가 라이브 배포 커밋을 읽는다
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
    // 해상도별 화면 맞춤 — 번들 밖에서 body 첫머리에 읽는 고전 스크립트다(브라우저 전역).
    files: ['public/fit.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', matchMedia: 'readonly', ResizeObserver: 'readonly' },
    },
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
        performance: 'readonly', getComputedStyle: 'readonly', MutationObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        // engine-cache-keep.spec.js는 서비스워커 옮기기를 시험하려고 작은 서버를 직접 띄운다.
        URL: 'readonly', location: 'readonly', fetch: 'readonly', Response: 'readonly', Buffer: 'readonly',
      },
    },
  },
  {
    // 화면 크기 조사 도구 — Node에서 돌고, page.evaluate() 안의 측정 코드는 브라우저에서, app.evaluate() 안은 설치판의 주 프로세스에서 돈다.
    files: ['tools/verify/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly', Response: 'readonly', setTimeout: 'readonly',
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', sessionStorage: 'readonly',
        getComputedStyle: 'readonly', matchMedia: 'readonly', requestAnimationFrame: 'readonly',
        scrollTo: 'readonly', scrollX: 'readonly', scrollY: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly',
        NodeFilter: 'readonly', DOMException: 'readonly',
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
