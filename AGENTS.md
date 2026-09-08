# AGENTS.md — InKY Voice Cinema

이 저장소에서 작업하는 **모든 도구(Claude Code, Codex 등)**가 읽는 문서. 도구에 상관없이 알아야 하는
것만 여기 둔다 — 조직 운영 규칙·상세 이력은 [CLAUDE.md](CLAUDE.md)에 있다.

## 이 앱이 하는 일

학생이 무성 클립(6종)에 자기 목소리를 더빙 → **브라우저의 ffmpeg.wasm**이 합성 → Cloud Functions가
검증·저장 → QR로 전달. 영상 합성은 서버가 아니라 클라이언트에서 일어난다.

라이브: https://voice-cinema.web.app · Firebase 프로젝트 `inky-voice-cinema`(`asia-northeast3`)

## 명령

```bash
npm test          # vitest — 루트 8개 + functions 13개 = 21개
npm run lint      # eslint (저장소 전체)
npm run test:e2e  # Playwright, 실제 Chromium + 가짜 마이크로 전체 흐름 8개
                  # 최초 1회: npx playwright install chromium
```

`functions/`는 **루트와 별개인 독립 npm 패키지**다(자체 `node_modules`/`package-lock.json`/
`vitest.config.js`). 의존성을 건드릴 땐 어느 쪽 패키지인지 먼저 확인할 것.

## 배포

`master`에 push → GitHub Actions `CI`(lint + 유닛 + E2E) 통과 → `Deploy Backend`가 **자동으로**
이어져 `storage,functions` → `hosting:voice-cinema` 순으로 배포한다. 수동 승인 게이트가 없다 —
**push = 배포**라고 생각할 것. 로컬에서 `firebase deploy`를 직접 돌릴 필요는 없다.

배포 폴더는 `docs/`(`firebase.json`의 `public`). 즉 **`docs/` 아래에 새로 만드는 파일은 전부
공개 웹에 그대로 서빙된다** — 내부 문서·메모를 여기 두면 안 된다(`firebase.json`의 `ignore`는
`**/.*`와 `test/**`만 제외한다).

## 이 저장소의 함정 — 실제로 사고가 났던 것들

### 0. `docs/`가 곧 웹 루트다 — 내부 문서를 절대 여기 두지 말 것
이 저장소는 하필 배포 폴더 이름이 `docs`다(`firebase.json`의 `public: "docs"`). 다른 저장소에서
"문서니까 `docs/`"라는 습관대로 파일을 만들면 **그 문서가 라이브 사이트에 그대로 공개된다.**
`firebase.json`의 `ignore`는 `**/.*`와 `test/**`만 제외하므로 다른 건 전부 서빙된다.

실제로 2026-09-08 문서 정비 때 `docs/intents/`(내부 기획 문서)를 만들라는 지시가 내려왔다가
이 이유로 취소됐다 — 그대로 만들었으면 intent·spec·plan이 전부 공개됐을 건이다.
**내부 문서는 전부 루트의 `_docs/` 아래에 둔다**(`_docs/intents/`, `_docs/ops/`, `_docs/CHANGELOG.md`).
`docs/` 아래에는 실제로 브라우저에 서빙돼야 하는 것만 넣는다.

### 1. Functions의 `concurrency`를 비워두지 말 것
`functions/index.js`의 `voiceCinema`는 `concurrency: 1`이다. Functions v2는 이 값을 안 적으면
**인스턴스 하나가 요청을 최대 80건까지 동시에** 받는데, `/upload`는 요청 하나가 GCS 저장이 끝날
때까지 base64 문자열과 디코딩 버퍼(실측 요청당 약 47MB, 파싱 순간 +73MB)를 붙들고 있다. 256MiB
인스턴스에서 큰 요청 4건만 겹쳐도 OOM이 나고, **그 인스턴스에 얹혀 있던 다른 학생들의 업로드까지
전부 같이 죽는다.** 처리량은 `maxInstances`(10)가 결정하므로 `concurrency`를 올려서 얻을 이점이 없다.

### 2. `docs/sw.js`의 캐시 목록에서 파일이 빠지면 오프라인에서 앱이 통째로 안 뜬다
서비스워커가 앱 셸과 벤더 파일을 프리캐시한다. `docs/app.js`가 정적 `import`하는 파일이 이 목록에
없으면, 인터넷이 끊긴 상태(행사장에서 실제로 일어난다)에서 탭을 새로 열 때 모듈 그래프 전체가
로드에 실패해 **앱이 아예 뜨지 않는다.** 실제로 App Check 번들
(`docs/vendor/firebase/firebase-app-check.js`)이 빠져 있어 이 상태였다.

**규칙**: `docs/` 아래에 앱이 로드하는 파일을 추가·삭제·개명하면 반드시
`docs/sw.js`의 `PRECACHE_URLS` 또는 `APP_SHELL_URLS`를 같이 고치고, **`CACHE_NAME`의 버전을
올린다**(현재 `...-v11`). `sw.js` 자체의 바이트가 바뀌어야 브라우저가 새 서비스워커를 설치해 옛
캐시를 지운다 — `app.js`나 클립만 바꾸고 `CACHE_NAME`을 안 올리면 이미 방문한 기기는 옛 버전을
계속 본다(이 저장소에서 같은 실수가 여러 번 반복됐다).

### 3. 업로드 타임아웃은 클라이언트·서버 양쪽을 같이 고쳐야 한다
타임아웃이 두 곳에 각각 있다:
- `docs/app.js`의 `UPLOAD_TIMEOUT_MS`(클라이언트 `AbortController`)
- `functions/index.js`의 `onRequest({ timeoutSeconds })`(Cloud Run 서버 측)

현재 둘 다 **110초**. 서버 쪽은 클라이언트가 얼마를 기다리든 상관없이 그 시간이 지나면 느린 업로드를
받는 도중이라도 먼저 연결을 끊으므로, **클라이언트만 늘리면 아무 효과가 없다.** 한쪽을 바꾸면 반드시
다른 쪽도 같은 값으로 맞출 것.

### 4. `BOOTH_TOKEN`은 두 파일에 하드코딩돼 있고 반드시 일치해야 한다
`functions/index.js`와 `docs/app.js`에 같은 상수가 있다. 어긋나면 부스 업로드 전체가 403으로
죽는다(E2E는 업로드를 가로채므로 이걸 못 잡는다). `test/token-sync.test.js`가 두 파일을 읽어
자동 비교하니, 이 테스트가 깨지면 무시하지 말 것. 이 값은 진짜 비밀이 아니라(공개 프론트에 노출됨)
무차별 스크립트를 막는 1차 방어선일 뿐이며, 실제 방어선은 App Check(reCAPTCHA Enterprise)다.

### 5. 영상 코덱은 반드시 H.264
H.265/HEVC로 인코딩하면 브라우저에서 화면이 검게 나온다. `docs/clips/*.mp4`를 교체할 땐
H.264/AAC 유지. 클립의 **원본 오디오 트랙도 지우면 안 된다** — 최종 합성물엔 학생 음성만 들어가지만
(`-map 1:a:0`), 스튜디오 화면의 "미리 보기"에서는 학생이 이 원본 오디오를 실제로 듣는다.

### 6. CSP가 인라인 이벤트 핸들러를 막는다
`firebase.json`의 CSP 때문에 `onclick="..."` 같은 인라인 속성은 **동작하지 않는다**(해시 예외로도
안 됨). 이벤트는 `docs/app.js`의 `init()`에서 `addEventListener`로 연결할 것. 인라인 `<script>`
블록을 추가·수정하면 `firebase.json`의 `script-src` 해시(`sha256-...`)도 다시 계산해 넣어야 한다.

### 7. "배포했는데 화면이 그대로"일 때
캐시가 세 겹이다: CDN 엣지 / 서비스워커 CacheStorage / 브라우저 일반 HTTP 캐시
(`app.js`는 1시간, `clips/**`·`vendor/**`는 1일). 서버 원본은 `curl`로 확인하고, 브라우저는
강력 새로고침이나 시크릿 창으로 다시 볼 것 — 배포 실패로 오인하기 쉽다.

## 서버 측 업로드 제약 (`functions/validate.js`)

- `video/mp4`만 허용 + 실제 파일 내용의 mp4 시그니처(`ftyp`) 검사
- 디코딩 후 크기 20MB, 파일명 120자
- IP당 분당 60회 레이트리밋 — Cloud Run 뒤에서는 `app.set('trust proxy', 1)`이 필수이고
  값은 반드시 `1`(`true`로 하면 클라이언트가 `X-Forwarded-For`를 위조해 무력화할 수 있다)
- `/upload`는 헤더만 보는 검사(레이트리밋 → `BOOTH_TOKEN` → App Check)를 전부 통과한 요청에만
  본문을 파싱한다. **이 순서를 바꾸지 말 것** — 인증 안 된 요청에 28MB 파싱 비용을 물리게 된다

## 커밋

`type: 한글 설명` (type은 feat / fix / docs / chore / refactor / test). 승인이 필요한 건은
`(승인 Bumm M/D)`를 덧붙인다. 브랜치 없이 `master`에 직접 커밋한다.
