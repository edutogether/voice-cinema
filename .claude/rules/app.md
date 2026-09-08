# InKY Voice Cinema 개별 규칙
헌법(D:\Projects\CLAUDE.md → _shared/CONVENTIONS.md)에 없는 것만.

## 앱
- 무엇: 무성 클립 6종에 학생이 자기 목소리로 더빙 → 브라우저 ffmpeg.wasm으로 합성 → Firebase Storage 저장 → QR 전달
- 사용자: 제4회 인천어린이청소년영화제 "InKY 놀이터" 부스 방문 학생. **행사일 2026-11-14(인천 CGV), 하루짜리 행사.**
  현장 예상 인원은 `[확인]` — 다만 "하루 2000명" 가정으로 실측 스트레스테스트를 통과해둔 상태(2026-08-28, 1989/2000 성공, 레이트리밋 429 0건)
- 배포: Firebase Hosting + Functions (`inky-voice-cinema`, `asia-northeast3`). GitHub Pages(`edutogether.github.io/voice-cinema`)는
  포털 카드 링크 교체 전까지 병행 운영 중인 옛 주소일 뿐, 정본은 https://voice-cinema.web.app

## 배포 폴더
- `firebase.json` public = `docs`. `_docs/`는 이 저장소에 없고, `.claude/`는 루트에 있어 배포 대상 밖임을 확인함 (확인일 9/8)
- **주의**: 이 저장소는 배포 폴더 이름이 하필 `docs`다. `docs/` 아래 새로 만드는 파일은 전부 공개 웹에 서빙되므로
  내부 문서(intent, 메모, 계획)를 여기 두면 안 된다 — 그런 문서가 필요해지면 루트의 `_docs/`에 만든다
  (`firebase.json`의 `ignore`는 `**/.*`와 `test/**`만 제외한다)

## 데이터
- 개인정보·미성년자 데이터: **있음.** 학생 목소리가 담긴 완성 mp4. 이름·학교·연락처 등 신원 정보는 일절 수집하지 않는다
- 저장 위치: Firebase Storage `dubs/` 아래, `makePublic()`으로 **링크를 아는 사람은 누구나 볼 수 있는 공개 URL**
  (QR 전달 방식상 로그인을 요구할 수 없는 구조 — 결과 화면에도 이 공유 범위를 그대로 고지한다)
- 파일명은 `dub_<장르>_<타임스탬프>_<6바이트 랜덤토큰>.mp4` — 토큰이 없으면 좁은 시간대를 순차 대입해 남의 영상을
  추측할 수 있어, `buildUploadFilename()`이 토큰 없이 호출되면 예외를 던진다. 이 방어를 없애지 말 것
- 보관·삭제 정책:
  - **2026-12-01부터** 예약 함수 `cleanupAfterCutoff`가 매일 새벽 3시(KST)에 `dubs/` 전체를 삭제한다
    ("다운로드는 11월 안에만 가능" 정책, 화면에도 안내됨)
  - GCS 버킷 라이프사이클 규칙(`dubs/` prefix, 60일 삭제)이 콘솔에 별도로 걸려 있다(2026-08-27 대표 확인)
  - **로컬 폴백으로 내려받은 파일은 자동 삭제 대상이 아니다** — 인터넷이 끊겨 폴백이 발동하면 부스 기기 다운로드
    폴더에 아동 음성이 그대로 남는다. 화면 안내에 "운영자가 이 파일을 꼭 삭제해 주세요"를 넣어뒀고, 이 문구를 지우면 안 된다
- rules: `storage.rules` 있음 — 클라이언트 직접 접근을 전부 deny하고 `functions/`의 Admin SDK로만 읽고 쓴다(방어적 기본값)
- 동의: 앱 안에 동의 절차가 없는 것은 누락이 아니다. 인천광역시교육청 주최 행사로, 참가 학교가 사전에 동의서를 걷고
  명단을 제출한 뒤에만 참가하는 구조다(2026-08-27 대표 확인). 코드로 동의 절차를 새로 만들지 말 것

## 이 앱에서 절대 하면 안 되는 것
- **클립을 H.265/HEVC로 인코딩하지 말 것** — 브라우저에서 화면이 검게 나온다. H.264/AAC 유지
- **클립의 원본 오디오 트랙을 지우거나 무음으로 바꾸지 말 것** — 최종 합성물엔 학생 음성만 들어가지만(`-map 1:a:0`),
  스튜디오 화면의 "미리 보기"에서는 학생이 이 원본 오디오를 실제로 듣는다
- **업로드 타임아웃을 한쪽만 고치지 말 것** — `docs/app.js`의 `UPLOAD_TIMEOUT_MS`와 `functions/index.js`의
  `timeoutSeconds`를 항상 같은 값으로(현재 110초). 서버가 먼저 끊으므로 클라이언트만 늘리면 효과가 없다
- **`docs/` 아래 파일을 추가·삭제·개명하고 `docs/sw.js`를 그냥 두지 말 것** — 캐시 목록에서 빠진 파일이 하나라도
  있으면 오프라인에서 앱이 통째로 안 뜬다. 목록 수정 + `CACHE_NAME` 버전 올리기를 같은 커밋에서 한다
- **`voiceCinema`의 `concurrency: 1`을 올리지 말 것** — 요청 하나가 최대 ~47MB를 붙들어, 256MiB 인스턴스에서
  겹치면 OOM으로 다른 학생 요청까지 연쇄로 죽는다. 처리량은 `maxInstances`가 담당한다
- **`app.set('trust proxy', 1)`을 `true`로 바꾸지 말 것** — 클라이언트가 `X-Forwarded-For`를 위조해 레이트리밋을
  무력화할 수 있다(실제 스푸핑으로 재현·검증됨)
- **`/upload`의 검사 순서를 바꾸지 말 것** — 헤더만 보는 검사(레이트리밋 → `BOOTH_TOKEN` → App Check)를
  통과한 요청에만 본문을 파싱한다. 순서가 뒤집히면 인증 안 된 요청에 28MB 파싱 비용을 물릴 수 있다
- **`onclick=""` 같은 인라인 이벤트 핸들러를 쓰지 말 것** — CSP가 막는다(해시 예외로도 안 됨).
  `docs/app.js`의 `init()`에서 `addEventListener`로 연결한다
- **`npm audit fix --force`를 실행하지 말 것** — `firebase-admin`을 10.3.0으로 다운그레이드해 지금 쓰는 모듈형
  API가 사라지면서 코드가 깨진다. 남은 moderate 취약점은 Google 쪽 전이 의존성(`uuid<11.1.1`) 문제로 업스트림 대기 상태다
- 행사 직전 배포 동결 기간에 대한 정책은 아직 정해진 바 없다 `[확인]`

## 명령
- 테스트: `npm test` (vitest, 루트 8 + functions 13 = 21개). 개별 실행은 `cd functions && npm test`
- 린트: `npm run lint` (eslint). 빈 `catch(e){}`는 이 코드베이스가 의도적으로 쓰는 패턴이라 허용해뒀다 — 버그가 아니다
- 로컬 실행: `npx serve -l 4321 docs` (Playwright의 `webServer`와 같은 방식)
- E2E: `npm run test:e2e` — 최초 1회 `npx playwright install chromium` 필요. Playwright 버전을 올리면 이 설치를 다시 해야 한다
- 에뮬레이터: 쓰지 않음 — 서버 쪽은 순수 함수만 유닛테스트하고, 실제 동작은 배포 후 라이브로 확인한다

## 자주 틀리는 것
- **`CACHE_NAME` 올리기를 빼먹는다.** `docs/app.js`/`index.html`/클립만 바꾸고 `sw.js`를 안 건드리면, 이미 방문한
  기기(대표님 포함)는 배포된 새 화면을 못 본다. 하루에 두 번 반복한 적이 있다 — 지금은 수동 습관에만 의존하는 구조다
- **"배포했는데 반영이 안 된다"를 배포 실패로 오인한다.** 캐시가 세 겹이다(CDN 엣지 / 서비스워커 CacheStorage /
  브라우저 일반 HTTP 캐시). 서버 원본은 `curl`로 확인하고, 브라우저는 강력 새로고침이나 시크릿 창으로 다시 본다
- **로컬 E2E가 8개 전부 실패하면 포트 4321부터 의심한다.** 다른 프로젝트 개발 서버가 먼저 점유하고 있으면
  `reuseExistingServer`가 그쪽에 붙어 가짜로 전부 실패한다. CI는 격리된 러너라 이 문제와 무관하다
- **`functions/`를 루트 패키지로 착각한다.** 자체 `node_modules`/`package-lock.json`/`vitest.config.js`를 가진
  독립 패키지다. 루트 `vitest.config.js`의 `include`가 `functions/`를 아예 안 건드리도록 좁혀둔 것도
  `functions/node_modules` 안 서드파티 테스트가 딸려 들어오는 걸 막기 위한 것이니 넓히지 말 것
- **인라인 `<script>`를 고치고 CSP 해시를 안 고친다.** `firebase.json`의 `script-src`에 `sha256-...` 두 개가
  박혀 있어, 인라인 스크립트 내용이 바뀌면 해시도 다시 계산해 넣어야 한다
