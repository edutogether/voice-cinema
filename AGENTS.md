# Voice Cinema

## 기준 원장

현재 앱 상태·담당·최신 승인 사항은 `_docs/ops/HANDOFF_CURRENT.md`를 먼저 확인한다. 작업 전에 `.claude/rules/app.md`의 금지·함정 목록도 직접 읽는다. 구조는 `README.md`·`CLAUDE.md`, 작업 의도·승인 기록은 `_docs/intents/README.md`를 참고한다. 과거 기록보다 최신 사용자 지시·인계 사항을 우선하며, 도구 전환은 같은 원장의 §1 절차를 따른다.

## WRITE SCOPE — LOCKED

- 담당은 Voice Cinema 앱 worker이며 기본 write scope와 명령 cwd는 `D:\Projects\inky-festival\voice-cinema` repository 내부다. 쓰기·Git 작업 전에 `Get-Location`과 `git rev-parse --show-toplevel`로 일치를 확인한다.
- 대상 경로와 범위를 명시한 cross-app 권한 없이 sibling app·다른 repository·parent project 파일을 수정하지 않는다.
- 다른 앱의 수정이 필요하면 직접 고치지 않고 `CROSS-APP DEPENDENCY: <대상 앱/경로>에 별도 변경 필요`로 보고한다.
- 상위 Root `AGENTS.md`와 공용 authoritative handoff는 별도 지시가 없는 한 read-only다.

- 담당 역할은 Voice Cinema 앱 worker이며 기본 명령 cwd는 `D:\Projects\inky-festival\voice-cinema`다. 쓰기·Git 작업 전에 `Get-Location`과 `git rev-parse --show-toplevel`로 저장소를 확인한다. 경로가 다르면 작업을 멈추고 팀장에게 보고한다.
- 작업은 이 저장소와 명시적으로 할당된 worktree 안에서만 수행한다. 자동 로드에 의존하지 않고 이 `AGENTS.md`와 `.claude/rules/app.md`를 직접 확인한다.
- Full access는 실행 능력이며 다른 앱 수정의 승인이 아니다. 자기 역할을 팀장으로 선언하거나 ownership을 스스로 확대하지 않는다.
- 다른 앱·사용자 전역 config·parent project·공용 기록은 대상 경로와 범위의 명시적 배정 없이는 수정하지 않는다. cross-app 의존은 Project Engineering에 보고한다. 기존 LOCKED·APPROVED와 push·병합·배포·파괴적 작업 승인 규칙을 유지한다.

## 구조·보호 대상

- React·TypeScript·Vite의 `src/`를 `dist/`로 빌드한다. 학생 목소리는 브라우저 ffmpeg.wasm으로 합성하고 Functions가 검증·Storage 저장을 맡는다. `functions/`는 독립 npm 프로젝트다.
- LOCKED: Functions `concurrency: 1`·`maxInstances: 10`, `trust proxy: 1`, 업로드 검사 순서(인증 전 상한 → BOOTH_TOKEN → App Check → 업로드 한도 → 본문). 저장 이름은 서버가 정한다. MP4 MIME·바이트 시그니처·디코딩된 크기 20MiB·파일명 120자 검증과 CORS 앵커·점 이스케이프를 유지한다.
- 업로드 110초와 `BOOTH_TOKEN`의 클라이언트·서버 일치는 `src/config.ts`·`functions/index.js` 및 `test/contract.test.js`로 유지한다. Functions의 `uuid` override를 유지하고 `npm audit fix --force`를 사용하지 않는다.
- 클립은 H.264/AAC와 원본 오디오를 보존한다. 상세 재생용 `public/clips/studio/` 사본은 클립 교체 시 `node tools/create-studio-clips.mjs`로 갱신하며 최종 합성에는 원본을 사용한다. ffmpeg는 `public/vendor/` 절대 경로 동적 import를 유지한다.
- `firebase.json`의 `Permissions-Policy: microphone=(self)`와 ffmpeg Worker·WASM·blob 재생을 허용하는 CSP를 유지한다. 보안 헤더 변경은 실제 녹음→합성 흐름으로 검증한다.
- 학생 목소리가 담긴 완성 MP4를 다루며 이름·학교·연락처는 수집하지 않는다. 완성 파일은 링크 보유자가 열 수 있다는 고지를 유지한다. 랜덤 토큰 없는 파일명을 허용하지 않고 클라이언트 Storage 직접 접근 deny를 유지한다.
- `dubs/`의 2026-12-01 KST 자정부터 매일 실행하는 삭제 예약·고지·경계 테스트를 일치시킨다. 로컬 폴백 파일은 자동 삭제 대상이 아니므로 운영자의 삭제 안내를 유지한다.
- 참가 학교의 사전 오프라인 동의가 승인된 운영 방식이다. 앱 내 동의 절차를 임의로 추가하지 않는다.
- 서비스워커 목록·캐시 버전은 자동 생성이다. `dist/sw.js` 대신 `tools/sw-template.js`·`tools/precache-plugin.js`를 수정하고 `public/clips/`의 영상은 프리캐시하지 않는다. 탐색 요청은 프리캐시보다 먼저 처리하며 캐시 조회의 `ignoreVary: true`를 유지한다. 업데이트로 녹음 중인 탭을 강제 새로고침하지 않는다.
- 메인 미리보기는 무음, 상세 진입은 정지 상태, 사용자가 시작한 상세 미리보기는 원본 소리를 유지한다. 로컬 체험 모드는 루프백 주소와 `?preview=home-design`에만 한정하며 실제 녹음·합성·업로드 검사를 대신하지 않는다.

## 배포·산출물

- 정식 주소는 `voice.edutogether.kr`, Hosting 대상 사이트는 `voice-cinema`다. 프로젝트 기본 사이트 `inky-voice-cinema`와 혼동하지 않는다. 배포 대상은 빌드된 `dist/`이며 `public/`의 파일은 그대로 공개되므로 내부 자료를 넣지 않는다.
- 이 저장소의 운영 배포 가지는 `master`다. CI 통과 후 `storage,functions` → `hosting:voice-cinema` 순으로 배포된다. 같은 `deploy.yml`이 예약 실행(cron 매시 23분, GitHub 지연으로 실제로는 몇 시간에 한 번꼴)으로 라이브 배포 커밋(`/version.json`, 함수 `GET /`의 `commit`)을 master 끝과 대조해 뒤처졌으면 다시 배포한다 — master에 없는 코드를 로컬에서 배포하면 다음 대조 때 master 끝으로 되돌려진다. 배포 도구 firebase-tools는 루트 `devDependencies`에 정확한 버전으로 잠겨 있고 배포는 `node_modules/.bin/firebase`로만 한다 — `npx firebase-tools@…`로 받아 쓰지 않는다. 루트 `package.json`의 `overrides`(gaxios → uuid `^11.1.1`)는 지우지 않는다. 직접 push·병합·배포 승인은 상위 규칙을 따른다. 행사 전에는 기존 `voice-cinema.web.app` 주소를 끄지 않으며, 2026-11-07 마지막 배포 이후 11-14 행사 종료까지의 배포 동결을 유지한다.
- 폰트 원본·라이선스는 `fonts/`에 보존하고 배포에는 서브셋만 포함한다. `vite.config.ts`의 폰트 서브셋 생성 → 프리캐시 생성 순서를 유지한다.

## 검사·운영 회귀

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

- `npm run build`는 타입 검사와 빌드를, `npm test`는 프론트와 Functions 검사를 실행한다. E2E는 빌드된 `dist/`를 대상으로 Chromium 가짜 마이크를 사용한다. 재생·탐색·녹음·합성·업로드와 오프라인·문서 최신성·스플래시·카드 재생의 관련 회귀를 확인한다.
- E2E의 4321 포트가 이 앱의 최신 산출물을 제공하는지 확인한다(`reuseExistingServer`). 프론트·Functions 테스트 범위를 섞거나 로컬 체험 모드로 실제 마이크·합성 검증을 대체하지 않는다.
- 스플래시는 한 탭에서 한 번만 표시한다. 갱신·재진입 회귀는 `e2e/splash-once.spec.js`로 확인한다.
- 스플래시는 `_docs/ops/microphone-asset.md`의 마이크 PNG를 유지한다. 파비콘은 InKY 로고의 노란 카메라(`public/icons/favicon-inky.png`, Poster Studio·InKY Calculator와 같은 파일) 하나이고 탭 상태에 따라 바꾸지 않는다(회색 전환 폐기, 2026-10-07). 로고의 `filter: drop-shadow`·`will-change`를 추가하지 않고, 로딩바 두 바퀴 하한 `--hold: calc(var(--bar-cycle) * 2)`를 유지한다.
- 터치 기기의 카드 미리보기는 전부 음소거 재생한다. 동시 재생 제한은 UA가 아닌 반복 play 거부로 판정하고, 콜백을 안정적으로 유지해 엔진 다운로드 중 재생이 끊기지 않게 한다.
- 프론트 변경은 엔진 캐시 재다운로드 영향을 확인한다. 인라인 script와 `color-mix()`를 추가하지 않는다.
- 화면 묶음의 Windows 기준선은 `e2e/release-baseline.spec.js`를 `VOICE_VISUAL_BASELINE=1`로 실행한다. 승인된 변경을 대조한 뒤에만 갱신하고 갱신 옵션 없이 재검증한다. PNG와 레이아웃·조작 의미 JSON을 함께 보존한다.
- 배포 점검 명령·검증 범위는 `_docs/ops/release-20261003.md`를 참고한다. `tools/release-browser-stress.js`는 로컬 산출물만, `tools/verify-release.js`는 운영 산출물과 실제 녹음 경로를 검사한다. 자동 검사 마이크를 실기기 검증으로 보고하지 않는다.
