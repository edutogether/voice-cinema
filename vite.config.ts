import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { precacheSW } from './tools/precache-plugin.js';
import { subsetFonts } from './tools/subset-fonts.js';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // 순서가 중요하다 — 서브셋이 먼저 dist/fonts/를 만들어야 프리캐시 목록에 들어간다.
    subsetFonts({ srcDir: root + 'fonts' }),
    // diag은 아이폰에서만 나는 결함을 가리려고 잠깐 올린 진단 화면이라 프리캐시에서 뺀다 —
    // 부스 기기가 오프라인용으로 들고 다닐 이유가 없다. 원인이 갈리면 폴더째 지운다.
    precacheSW({ swSource: root + 'tools/sw-template.js', excludeDirs: ['clips', 'diag'] }),
  ],
  build: {
    // 인라인 스크립트를 하나도 만들지 않는다. CSP의 script-src에 해시를 박아두면
    // 내용이 바뀔 때마다 firebase.json을 같이 고쳐야 하는데, 그걸 잊으면 배포된
    // 사이트에서만 화면이 죽는다(이 앱이 인라인 onclick으로 실제로 겪은 사고).
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: root + 'index.html',
        privacy: root + 'privacy.html',
      },
    },
  },
  server: { port: 4321 },
  preview: { port: 4321 },
});
