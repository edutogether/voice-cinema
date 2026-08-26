// 감사 발견 반영: ffmpeg-core.wasm(31MB)이 GitHub Pages의 기본 HTTP 캐시
// (max-age=600, 10분)에만 의존하고 있었다 — 태블릿이 재부팅되거나 캐시가
// 비면 행사장 와이파이로 매번 다시 흐른다. 엔진 파일만 서비스워커로 오래
// 캐시해 재방문·재부팅 후에도 다시 받지 않게 한다. 실제 더빙 콘텐츠(clips/)는
// 행사 전 교체될 수 있으므로 여기서 캐시하지 않는다.
const CACHE_NAME = 'inky-voice-cinema-engine-v1';
const PRECACHE_URLS = [
  './vendor/ffmpeg/classes.js',
  './vendor/ffmpeg/const.js',
  './vendor/ffmpeg/errors.js',
  './vendor/ffmpeg/index.js',
  './vendor/ffmpeg/types.js',
  './vendor/ffmpeg/utils.js',
  './vendor/ffmpeg/worker.js',
  './vendor/ffmpeg-core/ffmpeg-core.js',
  './vendor/ffmpeg-core/ffmpeg-core.wasm',
  './vendor/ffmpeg-util/const.js',
  './vendor/ffmpeg-util/errors.js',
  './vendor/ffmpeg-util/index.js',
  './vendor/ffmpeg-util/types.js',
  './vendor/qrcode.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// 엔진 파일만 캐시우선(cache-first)으로 응답한다 — 그 외 요청(index.html, app.js,
// clips/, Cloud Functions 등)은 손대지 않고 그대로 네트워크로 흘려보낸다.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!PRECACHE_URLS.some((p) => url.pathname.endsWith(p.replace('./', '/')))) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      });
    })
  );
});
