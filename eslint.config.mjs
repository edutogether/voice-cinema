// 감사 발견 반영: 자동 스타일/실수 검사 도구가 전혀 없었다 — 최소 설정만 둔다.
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', 'functions/node_modules/**', 'docs/vendor/**', 'outputs/**', 'cert/**', 'tmp/**', 'test-results/**', 'playwright-report/**'],
  },
  {
    // 이 코드베이스는 "실패해도 무시해도 되는" 정리 작업(pause(), revokeObjectURL() 등)에
    // 빈 catch(e){} 를 의도적으로 많이 쓴다 — 버그가 아니라 확립된 패턴이라 허용한다.
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // 브라우저에서 돌아가는 정적 프론트(docs/) + 레거시 설치판 프론트(public/)
    files: ['docs/**/*.js', 'public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
        fetch: 'readonly', URL: 'readonly', Blob: 'readonly', FileReader: 'readonly',
        MediaRecorder: 'readonly', AbortController: 'readonly', crypto: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        Audio: 'readonly', qrcode: 'readonly',
        self: 'readonly', caches: 'readonly', // docs/sw.js(서비스워커)용
      },
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
    // 레거시 설치판 서버 + 스크립트 — CommonJS
    files: ['server.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        process: 'readonly', console: 'readonly', Buffer: 'readonly',
        __dirname: 'readonly', require: 'readonly', module: 'readonly',
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
    // Playwright E2E 테스트 + 설정
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
];
