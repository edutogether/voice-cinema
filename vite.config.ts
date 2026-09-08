import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { precacheSW } from './build/precache-plugin.js';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    precacheSW({ swSource: root + 'build/sw-template.js' }),
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
