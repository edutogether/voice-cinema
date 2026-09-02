// 감사 발견 반영: ffmpeg-core.wasm(31MB)이 GitHub Pages의 기본 HTTP 캐시
// (max-age=600, 10분)에만 의존하고 있었다 — 태블릿이 재부팅되거나 캐시가
// 비면 행사장 와이파이로 매번 다시 흐른다. 엔진 파일만 서비스워커로 오래
// 캐시해 재방문·재부팅 후에도 다시 받지 않게 한다.
// 2026-09-03 발견 반영: app-shell(index.html/app.js/logic.js) fetch가 network-first라도,
// 그 순간 네트워크 요청이 무슨 이유로든(일시적 실패 포함) 실패하면 .catch()가 곧바로
// 아주 오래된 캐시(이 서비스워커가 설치되던 시점의 app.js)로 조용히 폴백해버린다 —
// 실제로 대표님 화면에서 배포된 지 한참 지난 옛 app.js(loading="lazy" 포함 버전)가
// no-store로 강제 재요청해도 계속 나오는 걸 실측으로 확인했다. CACHE_NAME을 바꾸면
// sw.js 파일 자체의 바이트가 달라져 브라우저가 새 서비스워커로 install/activate를
// 다시 돌리므로(오래 안 열어본 기기까지 포함해) 이 세션이 지금까지 만든 옛 캐시를
// 강제로 무효화한다.
// 2026-09-03 발견 반영(2): sw.js 자체를 안 건드리고 app.js/index.html만 바꾼
// 배포에서도 같은 stale-cache 폴백이 재현됐다 — CACHE_NAME은 v3 그대로였지만
// v3 캐시가 "직전 배포(2차 개편) 시점"에 채워진 채로 남아있어, 방금 배포한
// 3차 개편(호버 리소스 반환/헤더 바/2배 카드 등)이 반영 안 된 옛 화면을
// 계속 보여줬다. app-shell 내용이 바뀌는 배포마다 CACHE_NAME을 올리는 게
// 유일하게 확실한 방법이라 이번에도 올린다.
const CACHE_NAME = 'inky-voice-cinema-engine-v4';
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

// 종합감사(2026-09-02) 발견 반영: 엔진만 캐시하고 앱 셸(index.html/app.js/logic.js)은
// 캐시하지 않아서, 정작 인터넷이 끊긴 상태에서 태블릿 탭을 새로 열면(재부팅 등)
// 엔진이 있어도 앱 자체가 로드되지 않아 부스가 통째로 멈추는 문제가 있었다.
// 클립(clips/)은 2026-09-01 6종 확정 후 더 이상 "행사 전 교체될 수 있다"는
// 캐시 제외 사유가 없지만, 6개 합쳐 75MB라 install에서 한꺼번에 받으면 첫 방문이
// 느려지고 느린 와이파이에서 install 자체가 실패할 위험이 있다 — 그래서 앱 셸은
// install 시점에 즉시 프리캐시하되, 클립은 실제로 그 장르를 한 번 재생/로드한
// 뒤부터 캐시에 쌓이는 방식(runtime caching)으로 나눈다.
const APP_SHELL_URLS = ['./', './index.html', './app.js', './logic.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL_URLS, ...PRECACHE_URLS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isAppShell = APP_SHELL_URLS.some((p) => url.pathname.endsWith(p.replace('./', '/')) || (p === './' && url.pathname.endsWith('/')));
  const isEngine = PRECACHE_URLS.some((p) => url.pathname.endsWith(p.replace('./', '/')));
  const isClip = url.pathname.includes('/clips/');

  if (isEngine) {
    // 엔진 파일: 캐시우선 — 자주 안 바뀌고 크기가 커서(31MB) 매번 새로 받을 이유가 없다.
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      }))
    );
    return;
  }

  if (isAppShell) {
    // 앱 셸: 네트워크 우선(최신 배포를 항상 반영) — 오프라인일 때만 캐시로 폴백한다.
    event.respondWith(
      fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  if (isClip) {
    // 클립: 실제로 한 번 불러온 장르부터 캐시에 쌓인다(설치 시 75MB를 한꺼번에
    // 받지 않기 위함) — 그 다음부터는 오프라인이어도 그 장르는 재생 가능하다.
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      }))
    );
    return;
  }

  // 그 외(Cloud Functions 등)는 손대지 않고 그대로 네트워크로 흘려보낸다.
});
