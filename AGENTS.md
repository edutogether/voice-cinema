# AGENTS.md — InKY Voice Cinema

이 저장소에서 작업하는 **모든 도구(Claude Code, Codex 등)**가 읽는 문서. 도구에 상관없이 알아야
하는 것만 여기 둔다 — 조직 운영 규칙·상세 이력은 [CLAUDE.md](CLAUDE.md)에 있다.

## 이 앱이 하는 일

학생이 무성 클립(6종)에 자기 목소리를 더빙 → **브라우저의 ffmpeg.wasm**이 합성 → Cloud Functions가
검증·저장 → QR로 전달. 영상 합성은 서버가 아니라 클라이언트에서 일어난다.

라이브: https://voice.edutogether.kr · Firebase 프로젝트 `inky-voice-cinema`(`asia-northeast3`)
옛 주소 `voice-cinema.web.app`은 같은 Hosting 사이트라 계속 살아 있다 — 되돌릴 일이 생기면 링크만 바꾸면 된다.
프론트는 Vite + React + TypeScript(2026-09-08 전환).

**배포처는 Firebase Hosting 한 곳뿐이다.** GitHub Pages(`edutogether.github.io/voice-cinema`)를 한동안
병행 운영했지만 **2026-09-08 대표 지시로 폐지**했다 — 그 주소는 이제 404이고, 되살릴 계획은 없다.
`functions/index.js`의 CORS 허용 목록에서도 뺐다. "Pages는 왜 안 쓰지"를 다시 조사하지 않아도 된다.

## 명령

```bash
npm run dev       # 개발 서버 (http://localhost:4321)
npm run build     # tsc --noEmit + vite build → dist/
npm test          # vitest — 루트 9개 + functions 35개 = 44개
npm run lint      # eslint (src/는 tsc가 담당하므로 제외)
npm run test:e2e  # Playwright 16개. 빌드 후 dist/를 서빙해 실제 산출물로 검증한다
                  # 최초 1회: npx playwright install chromium
```

`functions/`는 **루트와 별개인 독립 npm 패키지**다(자체 `node_modules`/`package-lock.json`/
`vitest.config.js`). 의존성을 건드릴 땐 어느 쪽 패키지인지 먼저 확인할 것.

## 폴더

| 경로 | 내용 |
|---|---|
| `src/` | 앱 소스. 화면은 `components/`, 녹음 상태 기계는 `hooks/useDubbing.ts`, ffmpeg·업로드는 `lib/` |
| `public/` | **번들러가 건드리지 않고 그대로 복사된다** — `vendor/`(ffmpeg 엔진 31MB, qrcode, App Check 번들), `clips/`(장르 영상 6종 37MB) |
| `tools/` | 빌드 도구. `precache-plugin.js`가 서비스워커 프리캐시 목록을 산출물에서 자동 생성하고, `sw-template.js`가 그 원본이다 |
| `dist/` | 빌드 산출물 = 배포 폴더. 커밋하지 않는다 |
| `_docs/` | 내부 문서(배포 안 됨). 문서를 만들 땐 여기 — `dist/`나 `public/`에 두면 공개된다 |

## 배포

`master`에 push → GitHub Actions `CI`(lint + 유닛 + E2E) 통과 → `Deploy Backend`가 **자동으로**
이어져 프론트를 빌드하고 `storage,functions` → `hosting:voice-cinema` 순으로 배포한다.
수동 승인 게이트가 없다 — **push = 배포**라고 생각할 것.

배포 폴더가 `dist/`(빌드 산출물)이므로 **배포 잡은 반드시 `npm run build`를 거쳐야 한다.**
그 단계를 빼면 빈 폴더가 배포된다(전환 때 실제로 빠뜨렸다가 배포 직전에 잡음).

**빌드는 결정적이다** — 소스가 그대로면 산출물 해시도, 그래서 서비스워커 캐시 이름도 그대로다(실측 확인).
즉 `functions/`만 바뀐 배포는 기기에 이미 깔린 캐시를 건드리지 않는다. 반대로 **프론트가 한 글자라도
바뀌면 캐시 이름이 바뀌어 모든 기기가 엔진 31MB를 다시 받고 새 서비스워커로 교체된다** — 행사장
와이파이에서는 이 차이가 크다.

## 이 저장소의 함정 — 실제로 사고가 났던 것들

### 1. Functions의 `concurrency`를 비워두지 말 것
`functions/index.js`의 `voiceCinema`는 `concurrency: 1`이다. Functions v2는 이 값을 안 적으면
**인스턴스 하나가 요청을 최대 80건까지 동시에** 받는데, `/upload`는 요청 하나가 GCS 저장이 끝날
때까지 base64 문자열과 디코딩 버퍼(실측 요청당 약 47MB, 파싱 순간 +73MB)를 붙들고 있다. 256MiB
인스턴스에서 큰 요청 4건만 겹쳐도 OOM이 나고, **그 인스턴스에 얹혀 있던 다른 학생들의 업로드까지
전부 같이 죽는다.** 처리량은 `maxInstances`(10)가 결정하므로 `concurrency`를 올려서 얻을 이점이 없다.

### 2. 오프라인 부팅 — 캐시 목록은 손대지 말 것(자동 생성이다)
행사장에서 인터넷이 끊긴 채 태블릿 탭을 새로 열어도 앱이 떠야 한다. 예전에는 서비스워커 캐시
목록을 손으로 적어뒀는데, 파일을 추가하고 목록 갱신을 잊어 **앱이 통째로 안 뜨는** 상태로 배포된
적이 있다(App Check 번들 누락).

지금은 `tools/precache-plugin.js`가 빌드 산출물에서 목록과 캐시 버전을 뽑아 넣는다. 그래서:
- **`dist/sw.js`를 직접 고치지 말 것.** 빌드할 때마다 덮어쓴다. 고칠 일이 있으면 `tools/sw-template.js`
- 목록에서 앱 셸이나 `vendor/`가 비면 **빌드가 실패한다**(배포 전에 멈춘다)
- `CACHE_NAME`을 사람이 올릴 필요가 없다 — 내용이 바뀌면 캐시 이름이 자동으로 바뀐다
- `clips/`(37MB)는 일부러 프리캐시에서 뺀다. install에서 한꺼번에 받으면 느린 와이파이에서 설치
  자체가 실패한다 — 실제로 재생한 장르부터 런타임에 쌓인다
- 서비스워커에서 캐시를 찾을 땐 **`ignoreVary: true`가 필요하다.** Hosting이 정적 파일에
  `Vary: Origin`을 붙이는데, 저장할 때와 찾을 때의 요청 헤더가 달라 캐시에 있는데도 못 찾는다
  (전환 중 실측으로 확인 — 그대로 뒀으면 오프라인에서 앱이 안 떴다)
- **탐색 요청(`request.mode === 'navigate'`) 분기가 프리캐시 분기보다 먼저 와야 한다.**
  `/privacy.html`처럼 프리캐시 목록에 든 문서가 캐시 우선 분기에 먼저 걸리면 네트워크를
  아예 보지 않아, 새로 배포해도 그 기기의 서비스워커가 교체되기 전까지 옛 화면이 계속
  나온다(2026-09-09 실제 발생 — 방침 화면만 안 바뀌었다. 홈은 경로가 `/`라 목록에 없어
  바로 반영됐고 그 차이 때문에 원인을 찾기 어려웠다). `e2e/document-freshness.spec.js`가
  이 순서를 고정한다

`e2e/offline-boot.spec.js`가 실제로 오프라인 상태를 만들어 이걸 매번 검증한다.

### 3. 업로드 타임아웃은 클라이언트·서버 양쪽을 같이 고쳐야 한다
타임아웃이 두 곳에 각각 있다(`functions/`는 자기 디렉터리만 배포돼 공용 모듈로 못 묶는다):
- `src/config.ts`의 `UPLOAD_TIMEOUT_MS`(클라이언트 `AbortController`)
- `functions/index.js`의 `onRequest({ timeoutSeconds })`(Cloud Run 서버 측)

현재 둘 다 **110초**. 서버 쪽은 클라이언트가 얼마를 기다리든 상관없이 그 시간이 지나면 느린 업로드를
받는 도중이라도 먼저 연결을 끊으므로, **클라이언트만 늘리면 아무 효과가 없다.**
한쪽만 고치면 `test/contract.test.js`가 실패한다 — 그 테스트를 고쳐서 통과시키지 말고 값을 맞출 것.

### 4. `BOOTH_TOKEN`은 두 파일에 하드코딩돼 있고 반드시 일치해야 한다
`functions/index.js`와 `src/config.ts`에 같은 상수가 있다. 어긋나면 부스 업로드 전체가 403으로
죽는다(E2E는 업로드를 가로채므로 이걸 못 잡는다). `test/contract.test.js`가 두 소스를 읽어
자동 비교한다. 이 값은 진짜 비밀이 아니라(공개 프론트에 노출됨) 무차별 스크립트를 막는 1차
방어선일 뿐이며, 실제 방어선은 App Check(reCAPTCHA Enterprise)다.

### 5. 영상 코덱은 반드시 H.264
H.265/HEVC로 인코딩하면 브라우저에서 화면이 검게 나온다. `public/clips/*.mp4`를 교체할 땐
H.264/AAC 유지. 클립의 **원본 오디오 트랙도 지우면 안 된다** — 최종 합성물엔 학생 음성만 들어가지만
(`-map 1:a:0`), 스튜디오 화면의 "미리 보기"에서는 학생이 이 원본 오디오를 실제로 듣는다.

### 6. ffmpeg 벤더 파일은 번들러에 태우지 말 것
`public/vendor/`의 ffmpeg는 Worker + WebAssembly + blob: URL로 코어를 스스로 로드한다. 번들러가
이 파일들을 해시·재작성하면 그 경로 해석이 깨진다. `src/lib/vendor.ts`가 절대 경로로 동적 import
하는 형태를 유지할 것(`import(/* @vite-ignore */ '/vendor/...')`).

### 7. 인라인 스크립트를 만들지 말 것
CSP의 `script-src`는 인라인 스크립트를 해시로만 허용하는데, 해시를 `firebase.json`에 박아두면
스크립트를 고칠 때마다 그것도 같이 고쳐야 하고 잊으면 **배포된 사이트에서만** 화면이 죽는다
(이 앱이 인라인 `onclick`으로 실제로 겪었다). 전환 때 인라인 스크립트를 0개로 만들고 해시 항목도
지웠으니, 다시 만들지 말 것. Vite의 modulePreload 폴리필도 같은 이유로 꺼져 있다.

### 8. "배포했는데 화면이 그대로"일 때
캐시가 세 겹이다: CDN 엣지 / 서비스워커 CacheStorage / 브라우저 일반 HTTP 캐시
(`assets/**`는 해시가 붙어 1년 불변, `sw.js`는 no-cache, `clips/**`·`vendor/**`는 1일).
서버 원본은 `curl`로 확인하고, 브라우저는 강력 새로고침이나 시크릿 창으로 다시 볼 것.

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
