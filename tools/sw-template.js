// 서비스워커 원본. 아래 두 자리표시자는 빌드 시점에 tools/precache-plugin.js가
// 실제 산출물에서 뽑아 채워 넣는다 — 이 파일에 캐시할 파일 이름을 손으로 적는
// 자리는 없다(목록 갱신을 잊는 것이 예전 오프라인 장애의 원인이었다).

const PRECACHE_URLS = __PRECACHE_URLS__;
const CACHE_NAME = 'voice-cinema-' + __CACHE_VERSION__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

const isPrecached = (url) => PRECACHE_URLS.includes(url.pathname);
const isClip = (url) => url.pathname.startsWith('/clips/');

// 응답을 캐시에 넣고 그대로 돌려준다. 실패(용량 초과 등)해도 응답 자체는 살린다.
// 실패 응답(404·500 등)은 절대 캐시하지 않는다 — 부스 와이파이가 잠깐 흔들려
// 클립 한 번이 오류로 돌아오면, 그 오류가 캐시에 박혀 다음 배포로 캐시 이름이
// 바뀔 때까지 그 기기에서 그 장르가 계속 재생되지 않는다.
function cacheAndReturn(request, response) {
  if (!response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Cloud Functions 등 외부 호출은 그대로 흘려보낸다

  // 화면으로 여는 문서(주소창 입력, 링크로 새 탭 열기, 새로고침)는 **프리캐시 분기보다
  // 먼저** 네트워크 우선으로 처리한다. 순서가 핵심이다 — /privacy.html처럼 프리캐시
  // 목록에 든 문서가 아래 캐시 우선 분기에 먼저 걸리면, 새로 배포해도 그 기기의
  // 서비스워커가 교체되기 전까지 네트워크를 아예 보지 않아 옛 화면이 계속 나온다.
  // (2026-09-09 실측: 방침 화면을 새로 배포했는데 기기에서는 옛 화면이 그대로였다.
  //  홈은 경로가 '/'라 프리캐시 목록에 없어 이 분기로 와서 바로 반영됐고, 그 차이
  //  때문에 "한 화면만 안 바뀐다"로 보였다.)
  //
  // 오프라인에서는 캐시로 떨어진다. 여기서도 ignoreVary가 반드시 필요하다 — 이
  // 조회가 실패하면 오프라인에서 주소창으로 연 탭이 그대로 죽는다. 저장은 헤더 없는
  // 요청으로 했는데 탐색 요청에는 브라우저가 헤더를 더 붙이므로, Vary를 무시하지
  // 않으면 캐시에 있는데도 못 찾는 함정에 걸린다.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(request, { ignoreVary: true })
          .then((hit) => hit || caches.match('/index.html', { ignoreVary: true }))
      )
    );
    return;
  }

  // 프리캐시된 앱 셸·엔진: 캐시 우선. 파일명에 해시가 붙어 있어(또는 재배포 시
  // 캐시 이름 자체가 바뀌어) 옛 내용이 남아 새 배포를 가리는 일이 없다. 화면으로
  // 여는 문서는 위에서 이미 처리했으므로 여기로 오지 않는다.
  //
  // ignoreVary가 반드시 필요하다: install의 addAll()은 헤더 없는 평범한 요청으로
  // 저장하는데, 같은 파일을 모듈 import로 다시 요청하면 브라우저가 Origin 등을
  // 붙여 보내고 서버가 Vary를 응답한다 — 그러면 기본 매칭이 어긋나 캐시에 있는데도
  // 못 찾는다(이 전환 중 실측으로 확인). 그 상태로 오프라인이 되면 앱이 안 뜬다.
  // 또 여기서 다시 put 하지 않는다 — 설치 때 저장한 깨끗한 항목을 Vary가 걸린
  // 항목으로 덮어써 같은 함정을 스스로 만들지 않기 위해서다.
  if (isPrecached(url)) {
    event.respondWith(
      caches.match(url.pathname, { ignoreVary: true }).then((hit) => hit || fetch(request))
    );
    return;
  }

  // 클립(장르당 약 6MB): 실제로 한 번 불러온 것부터 캐시에 쌓인다.
  // install에서 37MB를 한꺼번에 받으면 느린 와이파이에서 설치가 실패한다.
  if (isClip(url)) {
    event.respondWith(
      caches
        .match(request, { ignoreVary: true })
        .then((hit) => hit || fetch(request).then((resp) => cacheAndReturn(request, resp)))
    );
    return;
  }
});
