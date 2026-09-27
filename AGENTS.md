# AGENTS.md — InKY Voice Cinema

이 저장소에서 작업하는 **모든 도구(Claude Code, Codex 등)**가 읽는 문서. 도구에 상관없이 알아야
하는 것만 여기 둔다 — 조직 운영 규칙은 [CLAUDE.md](CLAUDE.md), 이 앱만의 상세 규칙과 사고 경위는
[.claude/rules/app.md](.claude/rules/app.md), 날짜별 이력은 [_docs/CHANGELOG.md](_docs/CHANGELOG.md),
지나간 사건 기록은 [_docs/archive/](_docs/archive/)에 있다.

## 조직 공통 규칙 — 다른 도구·클라우드에서도 (D:\Projects 헌법 요약)

이 저장소만 받아서 일하는 도구(Codex 클라우드, Claude Code 클라우드, 다른 기기)는 `D:\Projects`의 공통
문서를 못 본다. 그래서 꼭 지켜야 할 것을 여기 옮겨 둔다. 원본은 `817beatles/projects`의 `_shared/constitution.md`.

- **사람**: 최종 결정권자는 **Bumm님**. 모든 답·문서·커밋은 **한국어**, 호칭은 늘 "Bumm님".
- **앱 이름**은 정식 이름 하나로만: CLASSCADE · Poster Studio · Be a Googler · Voice Cinema · Portal ·
  Codyssey · InKY Calculator · AI Ways Incheon (줄임말·별명·번역어 금지).
- **보고 경로**: 앱 담당은 팀장(Project Engineering)과만 주고받는다. Bumm님이 직접 말을 걸면 그 건만 직접 답한다.
- 🔴 **`main` 푸시 = 라이브 배포.** Codex·클라우드·다른 기기에서 한 작업은 `main`에 직접 푸시하지 않는다 —
  작업 가지 → PR로 내고, 합치는 것은 팀장 확인 뒤. 되돌리기는 CI로만(프리즈 태그 기준), 라이브에 직접 손대지 않는다.
- 🔴 **멈추고 Bumm님께 묻는 것**: 콘솔 전용 작업(Firebase/GCP), 돈이 드는 결정, 법률·정책 판단, 되돌리기 어렵거나
  파괴적인 행동, 영구 식별자(프로젝트·사이트 ID, 버킷 이름) 생성, 새 제품 방향.
- **한 번에 완성**: "일단", "차선책", "우회", "나중에" 금지. 제대로 못 하면 멈추고 보고. `TODO`/`FIXME`/`임시` 금지.
  검사를 느슨하게 하거나 빼서 통과시키지 않는다. 검사는 실제로 돌리고 종료 코드로 확인한다.
- **숨길 것**: 어드민 화면·기능은 저장소·배포·커밋 어디에도 드러내지 않는다. 비밀 키·토큰·인증 코드는 쓰지 않는다.
- **인계(도구·기기를 바꿔 가며 이어서 할 때)**: 단계를 끝낼 때마다 작업 가지에 올리고, PR 설명에
  "한 일 / 다음에 할 일 / 주의할 것"을 적는다. 같은 가지를 두 도구가 동시에 고치지 않는다 — 한쪽이 올린 뒤 이어받는다.
- **로컬(집 PC) 전용 작업** — 클라우드에서는 하지 않는다: 콘솔 작업, 운영 데이터 읽기·쓰기, 배포 승인,
  집 PC 모니터를 쓰는 측정. 클라우드는 코드 수정·검사·PR까지만.
  이 앱에서는 특히 **Storage `dubs/` 조회·정리**(학생 목소리가 담긴 운영 경로다 — 비우라고 올리기 전에
  안부터 본다)와 **스플래시·카드 재생 실측**(조건을 같은 PC에서 번갈아 재야 비교가 된다 — 다른 기기 값과
  섞지 않는다), **부스 기기 예열·실기기 업로드/QR 확인**이 로컬 전용이다.

> **이 저장소의 기본 가지는 `main`이 아니라 `master`다.** 위의 `main`은 여기서는 `master`로 읽는다 —
> `master` push가 곧 라이브 배포다.

## 이 앱이 하는 일

학생이 무성 클립(6종)에 자기 목소리를 더빙 → **브라우저의 ffmpeg.wasm**이 합성 → Cloud Functions가
검증·저장 → QR로 전달. 영상 합성은 서버가 아니라 클라이언트에서 일어난다.

라이브: https://voice.edutogether.kr · Firebase 프로젝트 `inky-voice-cinema`(`asia-northeast3`).
옛 주소 `voice-cinema.web.app`은 같은 Hosting 사이트라 계속 살아 있다(행사 전에는 끄지 않는다).
프론트는 Vite + React + TypeScript. **배포처는 Firebase Hosting 한 곳뿐이다** — GitHub Pages는
2026-09-08 폐지했고 되살릴 계획이 없다(다시 조사하지 않아도 된다).

## 명령

```bash
npm run dev       # 개발 서버 (http://localhost:4321)
npm run build     # tsc --noEmit + vite build → dist/
npm test          # vitest — 루트 19개 + functions 39개 = 58개
npm run lint      # eslint (src/는 tsc가 담당하므로 제외)
npm run test:e2e  # Playwright 25개. 빌드 후 dist/를 서빙해 실제 산출물로 검증한다
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

`master`에 push → `CI`(lint + 유닛 + E2E) 통과 → `Deploy Backend`가 **자동으로** 프론트를 빌드하고
`storage,functions` → `hosting:voice-cinema` 순으로 배포한다. 수동 승인 게이트가 없다 — **push = 배포**.
문서(`.md`·`_docs/`·`.claude/`)만 바뀐 커밋은 배포를 건너뛴다. 배포 잡은 반드시 `npm run build`를
거친다 — 빼면 빈 폴더가 배포된다.

**빌드는 결정적이다.** `functions/`만 바뀐 배포는 기기 캐시를 건드리지 않지만, **프론트가 한 글자라도
바뀌면 모든 기기가 엔진 31MB를 다시 받는다.** 그래서 행사 직전(2026-11-07~11-14)은 배포 동결이다 — `app.md`.

## 이 저장소의 함정 — 실제로 사고가 났던 것들

상세 경위는 `app.md`에 있다. 여기는 규칙과 이유 한 줄씩이다.

### 1. Functions의 `concurrency: 1`을 올리지 말 것
`/upload`는 요청 하나가 약 47MB를 붙든다. 기본값(80)으로 겹치면 256MiB 인스턴스가 OOM으로 죽고
**그 인스턴스의 다른 학생 업로드까지 같이 죽는다.** 처리량은 `maxInstances`(10)가 정한다.

### 2. 오프라인 부팅 — 캐시 목록은 손대지 말 것(자동 생성이다)
행사장에서 인터넷이 끊겨도 앱이 떠야 한다. 손으로 적던 목록에서 파일이 빠져 앱이 통째로 안 뜬 적이 있어,
지금은 `tools/precache-plugin.js`가 산출물에서 목록과 캐시 버전을 뽑는다.
- **`dist/sw.js`를 직접 고치지 말 것** — 고칠 일이 있으면 `tools/sw-template.js`
- 목록에서 앱 셸이나 `vendor/`가 비면 빌드가 실패한다. `CACHE_NAME`은 사람이 올리지 않는다
- `clips/`(37MB)는 일부러 프리캐시에서 뺀다 — 느린 와이파이에서 설치 자체가 실패한다
- 캐시 조회에는 **`ignoreVary: true`가 필요하다**(Hosting의 `Vary: Origin` 때문에 있는데도 못 찾는다)
- **탐색 요청 분기가 프리캐시 분기보다 먼저 와야 한다** — 뒤에 오면 `/privacy.html`이 새로 배포해도
  옛 화면으로 남는다. `e2e/document-freshness.spec.js`·`e2e/offline-boot.spec.js`가 고정한다

### 3. 업로드 타임아웃은 클라이언트·서버 양쪽을 같이 고친다
`src/config.ts`의 `UPLOAD_TIMEOUT_MS`와 `functions/index.js`의 `timeoutSeconds`, 현재 둘 다 **110초**.
서버가 먼저 끊으므로 클라이언트만 늘리면 효과가 없다. 어긋나면 `test/contract.test.js`가 실패한다 —
테스트를 고치지 말고 값을 맞출 것.

### 4. `BOOTH_TOKEN`은 두 파일에서 반드시 일치해야 한다
`functions/index.js`와 `src/config.ts`. 어긋나면 부스 업로드 전체가 403이다(E2E는 업로드를 가로채
못 잡는다 — `test/contract.test.js`가 비교한다). 진짜 비밀이 아니다. 실제 방어선은 App Check다.

### 5. 영상 코덱은 반드시 H.264
H.265/HEVC는 브라우저에서 검게 나온다. 클립 교체는 H.264/AAC 유지
([`_docs/ops/clip-replacement-guide.txt`](_docs/ops/clip-replacement-guide.txt)). **원본 오디오 트랙도
지우지 말 것** — 스튜디오 "미리 보기"에서 학생이 그 소리를 듣는다.

### 6. ffmpeg 벤더 파일은 번들러에 태우지 말 것
`public/vendor/`의 ffmpeg는 Worker + WebAssembly + blob: URL로 코어를 스스로 로드한다. `src/lib/vendor.ts`의
절대 경로 동적 import(`import(/* @vite-ignore */ '/vendor/...')`)를 유지할 것.

### 7. 인라인 스크립트를 만들지 말 것
CSP가 인라인을 해시로만 허용해, 해시를 박으면 고칠 때마다 같이 고쳐야 하고 잊으면 **배포된 사이트에서만**
화면이 죽는다(인라인 `onclick`으로 실제로 겪었다). 지금 인라인은 0개다. Vite modulePreload 폴리필도 꺼져 있다.

### 8. 인앱 브라우저(카카오톡 등)에서만 다르게 보일 때
- **`color-mix()`를 쓰지 말 것** — 옛 WebView는 선언 전체를 버린다. 색은 `src/genres.ts`의 `withAlpha()`로
- **동시 재생 제한** — 브라우저 이름이 아니라 **`play()`가 거듭 거부되는 사실**로 판별해 한 장씩 돌린다.
  `Home`이 카드에 넘기는 콜백을 **렌더마다 새로 만들지 말 것** — 엔진 진행률마다 여섯 장이 멈췄다 다시
  틀고, 그 끊김이 "거부"로 세어진다(2026-09-27 수정)
- **웹폰트**는 자체 호스팅한다(`fonts/` 원본 → 빌드가 서브셋). 원본을 `public/`에 두지 말 것

### 9. "배포했는데 화면이 그대로"일 때
캐시가 세 겹이다(CDN 엣지 / 서비스워커 / 브라우저 HTTP 캐시). **기기에서 안 바뀌면 거의 항상 서비스워커다** —
비공개 탭으로 열면 즉시 최신본이다. 새 버전은 알림을 누를 때만 새로고침한다(녹음 중 작업이 날아가지 않게).
서버 원본은 `curl`로 확인한다.

### 10. CI에서 브라우저를 설치할 때 `--with-deps`를 붙이지 말 것
apt를 건드리는 유일한 부분이고, 2026-09-10에 Google apt 저장소가 깨져 **테스트가 0개 실행된 채** CI가 세 번
떨어졌다. 브라우저는 Playwright 버전을 키로 캐시한다. **"설치 성공"과 "테스트가 돌았다"는 다르다** — 로그에서
실행된 테스트 수를 본다.

## 서버 측 업로드 제약 (`functions/validate.js`)

- `video/mp4`만 허용 + 실제 파일 내용의 mp4 시그니처(`ftyp`) 검사
- 디코딩 후 크기 20MB, 파일명 120자
- IP당 분당 60회 레이트리밋 — Cloud Run 뒤에서는 `app.set('trust proxy', 1)`이 필수이고
  값은 반드시 `1`(`true`로 하면 클라이언트가 `X-Forwarded-For`를 위조해 무력화할 수 있다)
- `/upload`는 헤더만 보는 검사(레이트리밋 → `BOOTH_TOKEN` → App Check)를 전부 통과한 요청에만
  본문을 파싱한다. **이 순서를 바꾸지 말 것** — 인증 안 된 요청에 28MB 파싱 비용을 물리게 된다

## 커밋

`type: 한글 설명` (type은 feat / fix / docs / chore / refactor / test). 승인이 필요한 건은
`(승인 Bumm M/D)`를 덧붙인다.

- **집 PC의 담당 세션**은 `master`에 직접 커밋한다 — 라이브를 보며 바로 확인해야 하는 수정이 많아서다.
  규모가 큰 작업(폰트 서브셋·서비스워커 구조 변경처럼 이유가 남아야 하는 일)은 짧은 가지에서 PR을 열어
  설명을 쓴 뒤 머지한다(머지도 `master` push라 배포는 그대로 일어난다)
- **Codex·클라우드·다른 기기**는 위 공통 규칙대로 `master`에 직접 푸시하지 않는다 — 작업 가지 → PR,
  합치는 것은 팀장 확인 뒤
