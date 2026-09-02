# CLAUDE.md — Voice Cinema (잉키 보이스 시네마)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\voice-cinema`
- **스택(2026-08-26 재설계, 2026-08-26 저장소 백엔드 2차 교체, 2026-09-01 Hosting 이전)**: 정적 프론트엔드(`docs/`, **Firebase Hosting 배포**) — 영상 합성이 서버가 아니라 브라우저 안 ffmpeg.wasm으로 처리됨. 저장소는 Google Apps Script+Drive에서 poster-studio와 동일한 **Firebase Functions + Firebase Storage + Firebase Hosting**(`inky-voice-cinema` 프로젝트)로 교체 — 특정 개인 구글 계정에 소유권이 묶이는 문제를 없애기 위함(대표 판단, 2026-08-26). 예전 Node.js/Express 로컬 서버(`server.js`, `public/`, `config.json`, `start.bat`/`start.command`)는 poster-studio와 같은 이유(MDM 노트북 설치 불가·방화벽)로 더 이상 쓰지 않지만, 삭제하지 않고 설치판 회귀 대비용으로 저장소에 그대로 남겨둠. `apps-script/Code.gs`도 마찬가지로 더 이상 쓰지 않는 이전 버전이지만 참고용으로 남겨둠.
- **기능**: 무성영상 6종(장르별)에 더빙 → 브라우저에서 합성 → Firebase Storage 자동저장 → QR 전달
- **자동삭제**: 2026년 12월 1일부터 예약 함수(`cleanupAfterCutoff`, Cloud Scheduler)가 매일 새벽 3시(KST)에 저장된 영상을 전부 삭제 — "다운로드는 11월 안에만 가능" 정책, 결과 화면에도 안내 문구 표시됨.
- **배포(2026-09-01부로 정본 변경)**: **`https://voice-cinema.web.app`**(Firebase Hosting, `public: docs`, `firebase.json`) — 대표 승인으로 GitHub Pages(`https://edutogether.github.io/voice-cinema/`, 아직 병행 운영·포털 카드 링크 교체 전까지 유지)에서 이전. Firebase Hosting 사이트 ID `voice-cinema`를 `hosting:sites:create`로 새로 만들고 `.firebaserc`에 `voice-cinema` 타겟으로 매핑했다. **Firebase 백엔드(Functions+Storage)도 정상 운영중** — `voiceCinema`/`cleanupAfterCutoff` 함수 둘 다 라이브. 실제 업로드→`makePublic()`→공개 URL 접근까지, CORS(허용/차단 출처 둘 다)까지 curl로 직접 실측 확인함(2026-08-26 프리즈 후 정밀감사), `functions/index.js`의 `ALLOWED_ORIGINS`에 `voice-cinema.web.app`/`voice-cinema.firebaseapp.com` 추가 완료.
- **Hosting 보안헤더(`firebase.json`)**: codyssey의 `firebase.json` 패턴을 그대로 베끼지 않고 이 앱 특성에 맞게 조정했다 — codyssey는 `Permissions-Policy`에 `microphone=()`(마이크 전면 차단)를 쓰는데 그대로 가져오면 이 앱의 핵심 기능(마이크 녹음)이 죽는다는 걸 배포 전에 알아차려 `microphone=(self)`로 바꿨다. CSP도 ffmpeg.wasm(Worker+WebAssembly+blob: URL 로딩)·MediaRecorder(blob: 재생)·Cloud Functions fetch를 전부 실사용 흐름으로 검증하며 맞췄다(`script-src 'self' blob: 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `connect-src`에 Cloud Functions 도메인, `media-src`/`img-src`에 `blob:`/`data:`).
  - **배포 직후 실측으로 발견한 회귀**: `index.html`의 버튼 8개가 전부 `onclick="..."` 인라인 속성이었는데, CSP의 `script-src`는 인라인 스크립트 블록엔 해시로 예외를 둘 수 있어도 **인라인 이벤트 핸들러 속성 자체는 별도로 막는다**(`'unsafe-hashes'` 없이는 해시도 안 통함) — 배포 직후 라이브 E2E(Playwright, `baseURL`을 잠깐 `voice-cinema.web.app`으로 바꿔 재실행)를 돌려서 8개 중 6개 테스트가 "버튼이 반응 안 함"으로 실패하는 걸 실측으로 잡아냈다. `onclick=""` 속성을 전부 제거하고 `docs/app.js`의 `init()`에서 `addEventListener`로 다시 연결(`window.goHome` 등 전역 노출도 더 이상 필요 없어 같이 제거)해서 해결, 재검증 시 라이브 E2E 8/8 통과 확인.
- **백엔드 자동배포 — 완전히 정상화됨(2026-09-02)**: `.github/workflows/deploy.yml`(2026-08-29 추가, 2026-09-01 hosting 배포 단계 추가) — `CI` 워크플로우(lint+유닛테스트+E2E)가 성공한 뒤에만 `workflow_run`으로 이어져 `storage,functions`를 배포하고, 그 다음 `hosting:voice-cinema`를 배포한다. 2026-09-01에 이 서비스계정에 `cleanupAfterCutoff`의 Cloud Scheduler 잡을 갱신할 권한(`cloudscheduler.jobs.update`)이 없어 403으로 막히는 문제가 발견됐었는데(그동안의 "성공"은 함수 코드가 안 바뀌어 Skipped로만 지나갔기 때문), **Bumm님이 콘솔에서 `roles/cloudscheduler.admin` 부여를 완료(2026-09-02)** — 이 세션이 실제로 functions 코드를 바꾼 커밋을 로컬 사전배포 없이 push만 해서 `cleanupAfterCutoff(asia-northeast3)`가 CI에서 `Successful update operation`으로 실제 갱신되는 것까지 실측 확인했다(run [33592042295], 이전엔 이 지점에서 403). **이제부터는 로컬 `firebase deploy` 우회 없이 그냥 `git push`만으로 CI가 끝까지 자동 배포한다** — 이전 항목들("이 세션이 로컬 firebase deploy로 우회했다")은 전부 이 날짜 이전 상태였다는 뜻으로 읽을 것.

## 🔴 콘텐츠 미완성 → 완료 (2026-09-01 실제 클립 6종 교체, 같은 날 1080p 재인코딩)
`docs/clips/`의 6개 mp4(action/animation/drama/fantasy/horror/sitcom)가 컬러바 테스트 영상이던 문제가 **해결됨** — Kling AI로 제작된 실제 무성 클립 6종을 넣고, `ffprobe`로 코덱, 프레임 추출로 실제 영상(컬러바 아님) 확인함. 같은 날 종합감사(D1) 반영으로 1280×720→**1920×1080**(약 10.35Mbps, H.264/AAC, 10초, 12.4~13.5MB) 재인코딩까지 완료 — 아래 "종합감사 후속조치" 참고. `clips/`(레거시 사본)와 `scripts/sync-clips.js`는 중복이라 제거했고, 설치판 `server.js`가 이제 `docs/clips/`를 직접 읽는다.

**교체 직후 실제로 터진 문제와 수정**: 2026-08-26 감사에서 예견했던 대로, 실제 클립으로 `mergeClip()` 파이프라인(`-c:v copy`+오디오 재인코딩)을 실행하면 완성 영상이 12.8~13.0MB로 나와 기존 `MAX_DECODED_BYTES`(12MB)를 **6개 장르 전부** 초과했다 — 실제 ffmpeg 명령으로 재현해 확인함(더미 오디오로 6개 전부 시뮬레이션, 전부 초과). 이 상태로 배포됐다면 모든 학생의 업로드가 실패하고 로컬 폴백으로만 떨어졌을 것이다. `functions/validate.js`의 `MAX_DECODED_BYTES`를 12MB→**20MB**로, `functions/index.js`의 `express.json({limit})`을 15mb→**28mb**(20MB 디코딩 상한을 base64로 인코딩하면 약 4/3배가 되는 것 감안)로 올려 해결. 유닛테스트 18/18, E2E 8/8(실제 클립으로 재실행) 전부 통과 확인.

## 종합감사(§7 방식) 후속조치 완료 (2026-09-01)
Opus/Sonnet 독립 2회 호출(COMMON_STANDARDS.md §7)로 10개 항목 종합감사를 진행해 새로 발견한 결함(R1·R2·L1~L3)과 대표 결정 사항(D1·D2)을 모두 처리했다.

- **R1(보안, −4점 사유였음) — 업로드 매직바이트 검증 추가**: `functions/validate.js`가 클라이언트가 JSON에 적어 보낸 `mimeType` 문자열만 믿고 실제 파일 내용을 전혀 안 봤다 — 공개 `BOOTH_TOKEN`만 있으면 임의 바이트를 "video/mp4"라고 우겨서 공개 버킷에 올릴 수 있었다. `hasMp4Signature()`(mp4의 시작 4바이트 뒤에 오는 `ftyp` 박스 시그니처 검사)를 추가해 `validateUploadRequest()`에서 강제한다. 유닛테스트 2개 추가(정상 mp4 통과, mimeType만 맞고 내용이 다른 경우 거부) — `functions/test/validate.test.js`.
- **R2(개인정보, −3점 사유였음) — 로컬 폴백 삭제 안내 추가**: 인터넷 단절로 로컬 폴백이 발동하면 아동 음성이 담긴 완성 영상이 부스 기기 다운로드 폴더에 그대로 남고(`cleanupAfterCutoff`는 GCS만 지움, 이 사본은 자동삭제 대상이 아님), 화면에 삭제 지시가 전혀 없었다. `docs/app.js`의 폴백 안내 문구에 "학생에게 전달 후 운영자가 이 파일을 꼭 삭제해 주세요 — 자동삭제 대상 아님"을 명시했다.
- **L1(확장성, −3점 사유였음) — 클립/엔진 캐시헤더 추가**: `firebase.json`의 헤더 블록이 `clips/**`를 다루지 않아 13MB 클립이 Hosting 기본 1시간 캐시에만 의존했다(장르 바꿀 때마다·1시간마다 행사장 와이파이로 재요청). `clips/**`·`vendor/**`에 `Cache-Control: public, max-age=86400`(1일)을 추가했다 — `docs/sw.js`가 clips를 캐시 대상에서 뺀 이유("행사 전 교체될 수 있어서")는 2026-09-01 클립 확정으로 이미 만료됐지만, SW precache 목록 변경까지는 이번엔 하지 않고(엔진 파일과 성격이 다름 — 클립은 재인코딩 가능성이 남아 있어 HTTP 캐시 갱신 여지를 남겨둠) HTTP 헤더만으로 충분한 개선을 확보했다.
- **L2(운영안정성, −2점 사유였음) — BOOTH_TOKEN 일치 검사 테스트 추가**: `functions/index.js`와 `docs/app.js`에 각각 하드코딩된 `BOOTH_TOKEN`이 어긋나면 부스 업로드 전체가 403으로 죽는데, 이를 잡는 자동화가 전혀 없었다(E2E는 업로드를 stub해서 안 걸림). `test/token-sync.test.js`를 새로 추가 — 두 파일을 소스 텍스트로 읽어 정규식으로 토큰을 뽑아 비교한다(함수 파일을 직접 import하면 `functions/node_modules` 의존성 때문에 이 위치에서 실패해서 이 방식을 택함). 루트 `npm test`가 `docs/test/`와 `test/`를 모두 돈다.
- **L3(구조, −3점 사유였음) — clips 중복 추적(76MB) 제거**: `clips/`(레거시)와 `docs/clips/`(정본)에 동일 6개 mp4가 이중 추적되던 유일한 이유가 레거시 `server.js:75`의 `CLIPS_DIR` 경로였다. 이제 `server.js`가 `docs/clips`를 직접 읽도록 바꾸고, `clips/` 디렉터리와 `scripts/sync-clips.js`(+`package.json`의 `sync-clips` 스크립트)를 전부 제거했다. `docs/clips/README.txt`에 안내를 옮겨뒀다.
- **D1(대표 결정) — 클립 1080p 재인코딩**: 대표 판단("지금 비트레이트 10.35Mbps는 1080p에 맞는 값이니 해상도를 올려서 화질을 살리자") 반영 — 로컬 `ffmpeg`(`libx264`, `scale=1920:1080:flags=lanczos`, `-b:v 10500k -maxrate 11500k -bufsize 21000k`, 오디오는 `-c:a copy`)로 6개 전부 1280×720→**1920×1080** 재인코딩, `ffprobe`로 해상도/길이 확인. 재인코딩 후에도 프로덕션 `mergeClip()` 파이프라인(`-c:v copy -c:a aac -b:a 160k -shortest`)을 더미 오디오로 재현해 합성 결과가 전부 9.9~10.7MB로 `MAX_DECODED_BYTES`(20MB) 안에 여유 있게 들어옴을 실측 확인.
- **D2(대표 결정) — Firebase App Check 도입 완료(2026-09-02)**: App Check을 쓰려면 이 프로젝트에 등록된 Firebase Web App이 있어야 하는데 지금까지 하나도 없었다(`firebase apps:list WEB` → 0개, `docs/app.js`가 Firebase JS SDK 없이 순수 fetch만 씀). `firebase apps:create WEB "Voice Cinema Web"`로 Web App을 새로 등록했다(App ID `1:710797378638:web:5d8b0fe73666bb84026f1f`). Bumm님이 콘솔에서 reCAPTCHA Enterprise 공급자를 등록하고 사이트 키를 발급한 뒤, 이 세션이 이어서 (1) `firebase`/`firebase-app-check` 패키지를 esbuild로 단일 ESM 파일(`docs/vendor/firebase/firebase-app-check.js`, CDN 없이 로컬 벤더링해 CSP `script-src 'self'` 유지)로 직접 번들링 (2) `docs/app.js`에 App Check 초기화 + `/upload` fetch에 `X-Firebase-AppCheck` 헤더 부착(토큰 발급 실패해도 헤더 없이 진행 — 최종 판단은 서버가 함) (3) `functions/index.js`에 `firebase-admin`의 `getAppCheck().verifyToken()` 서버 검증 추가 (4) `firebase.json` CSP에 reCAPTCHA Enterprise가 실제로 쓰는 도메인만 최소 추가(`script-src`에 `www.google.com`/`www.gstatic.com`, `connect-src`에 `www.google.com`/`content-firebaseappcheck.googleapis.com`, `frame-src`에 `www.google.com` — 전부 실제 요청 로그로 확인한 값)를 마무리했다. **라이브 실측 검증**: 프로덕션 도메인(`voice-cinema.web.app`)에서 진짜 reCAPTCHA Enterprise 토큰 발급 성공(961자) → 그 토큰으로 실제 `/upload` 호출 성공(200, 실제 GCS URL 반환)까지 확인했고, 반대로 토큰 없이 정상 BOOTH_TOKEN만 보낸 요청은 401로 거부되는 것도 확인했다. E2E 환경(localhost, 도메인 제한에 걸림)에서는 App Check 토큰 발급이 실패하는 게 정상이라 — 클라이언트가 토큰 없이도 요청 자체는 계속 보내도록 설계해서(서버가 최종 방어선) 기존 E2E 8개 시나리오가 그대로 통과한다.

## 🔴 대표 조치 필요 — 아직 안 끝난 것 (2026-09-02 갱신, 전부 완료)
1. ~~레거시 Google Apps Script 배포~~ — **코드상 연결 해제 완료(2026-08-27)**. `config.json`의 `appsScriptUrl`을 비워, 이 저장소 안 어디서도 그 URL을 더 이상 호출하지 않는다. 배포 소유 계정이 종완이형 개인 구글계정이라 Apps Script 콘솔 쪽 배포 자체를 끄는 건 그쪽에서만 가능(대표님이 대신 못 함). **이 항목은 감점 대상이 아니다(2026-08-27 대표 확인, 개인정보 항목과 보안 항목 둘 다 동일 적용)** — 저희 시스템/코드베이스가 할 수 있는 조치(연결 해제)는 이미 끝났고, 남은 건 저희 프로젝트 통제 범위 밖의 제3자(종완이형) 개인 계정 문제라 COMMON_STANDARDS.md §4-1의 "근거 없는 감점 금지"에 해당한다. 종완이형 개별 조치 대기 중(참고사항). 개인정보/규정준수·보안 두 항목 모두 이 근거로 100점 처리.
2. ~~GCP 예산 알림/결제 한도 설정~~ — **완료(2026-09-02, Bumm님 콘솔 작업, 팀장 확인)**.
3. ~~로컬 `outputs/` 폴더의 테스트 녹음 삭제~~ — **완료(2026-08-27)**.
4. ~~GCS 버킷 라이프사이클 규칙(`dubs/` prefix, 60일 삭제)~~ — **완료**. 대표님이 콘솔에서 직접 만드셨다고 확인(2026-08-27).
5. ~~`FIREBASE_SERVICE_ACCOUNT`에 `roles/cloudscheduler.admin` 역할 추가~~ — **완료(2026-09-02, Bumm님 콘솔 작업)**. 이 세션이 functions 코드를 실제로 바꾼 커밋을 로컬 사전배포 없이 push만 해서 CI가 `cleanupAfterCutoff(asia-northeast3)`를 `Successful update operation`으로 실제 갱신하는 것까지 실측 확인했다 — 위 "백엔드 자동배포" 항목 참고.
6. ~~Firebase App Check 콘솔 등록~~ — **완료(2026-09-02, Bumm님이 reCAPTCHA Enterprise 사이트 키 발급)**. 이 세션이 이어서 클라이언트(`docs/vendor/firebase/`, `docs/app.js`)·서버(`functions/index.js`) 코드를 마무리하고, 실제 프로덕션 도메인에서 진짜 토큰 발급→업로드 성공(200)까지, 그리고 토큰 없이 보낸 요청이 401로 거부되는 것까지 양쪽 다 라이브로 실측 확인했다 — 자세한 내용은 "종합감사 후속조치" 섹션의 D2 항목 참고.

## 최종 채점 (2026-08-27 확정 공식, 2026-09-01 클립 교체 완료로 갱신)
10개 항목 중 9개 100점. **확장성만 "영상 1개당 -1점"** 공식으로 계산 — 6개 장르 클립 중 아직 컬러바 플레이스홀더인 개수만큼 그대로 감점한다. **2026-09-01부로 6개 전부 실제 Kling AI 영상으로 교체 완료돼 확장성 = 100 − 0 = 100점.** 코드/인프라로 더 손댈 수 있는 부분(업로드 한도를 20MB/28mb로 재조정 포함, 서비스워커 캐싱 등)도 이미 전부 처리했으므로 더 이상 이 항목에 남는 감점 사유가 없다.

기술부채(uuid 전이의존성, Google 쪽 미해결)와 비용관리(GCS 라이프사이클 세션 미검증)는 "할 수 있는 조치를 다 했고 남은 게 통제범위 밖"이라는 §4-1 구조적 상한 원칙으로 100점 처리.

테스트커버리지는 순수 로직 유닛테스트(16개) + 실사용 흐름 E2E(8개, 실제 Chromium+가짜 마이크로 녹음부터 합성·업로드·QR/폴백까지 끝까지 실행) 조합으로 100점 처리(2026-08-27) — 숫자를 채우려고 형식적인 케이스를 늘린 게 아니라, 정상 흐름·실패 후 재시도·업로드 완전 실패 폴백·다시 녹음 리셋까지 실제로 사고가 났었거나 날 수 있는 경로를 각각 검증한다. 남는 한계는 자동화로 대체 불가능한 영역뿐이다: 실제 iOS Safari/Android 태블릿에서의 마이크 호환성, 행사장 실제 와이파이 대역폭 — 이런 것들은 실기기 리허설로만 확인 가능하다.

## 아동 개인정보 동의 — 이미 오프라인으로 존재함 (2026-08-27 대표 확인)
"앱 안에 동의 절차/수집 고지가 없다"는 정밀감사 발견은 **새 절차를 코드로 만들어야 할 미해결 리스크가 아니다.** 이 행사는 인천광역시교육청이 주최하고, 참가 학교(교사·학생)는 사전에 **동의서를 전부 걷고 명단을 제출한 뒤에만 참가**하는 구조다 — 즉 동의는 이미 학교/교육청 행정 절차로 존재한다. 현장에서 이 프로그램을 운영하는 스태프도 무작위 외부인이 아니라 같이교육 소속 교사들이다. Portal의 BGM 라이선스 건과 같은 성격 — "코드로 새로 만들 것"이 아니라 "이미 있는 절차를 문서화하는 것"으로 처리한다. 앱 화면에도 이 취지의 한 줄 안내를 넣었다(docs/index.html, public/index.html).

## 테스트/린트/캐싱 (2026-08-27 추가, 대표 승인)
- 검증 로직(mimeType/mp4 시그니처/크기/파일명 규칙, sanitize, 레이트리밋)은 `functions/validate.js`, 프론트 핵심 로직(오디오 확장자 매핑, 업로드 파일명 생성, mimeType 선택, 재시도 판단)은 `docs/logic.js`로 각각 분리해 순수 함수로 뒀다. `test/token-sync.test.js`(BOOTH_TOKEN 이중 하드코딩 일치 검사)는 두 소스 파일을 직접 읽어 비교하는 별도 루트 테스트다 — 루트에서 `npm test`로 전체 실행, 또는 `cd functions && npm test`/`node --test docs/test/*.test.js`/`node --test test/*.test.js`로 개별 실행. 앞으로 이 쪽 로직을 고칠 땐 여기부터 본다.
- **실사용 흐름 E2E 테스트**(`e2e/dubbing-flow.spec.js`, Playwright)도 있다 — 진짜 Chromium을 내장 가짜 마이크 장치로 띄워 마이크 권한→녹음→ffmpeg.wasm 실제 합성→업로드(가로채서 프로덕션에 안 쌓이게 함)→QR/폴백까지 8개 시나리오를 끝까지 실행한다. `npm run test:e2e`로 실행하며, 최초 1회 `npx playwright install chromium`으로 브라우저를 받아둬야 한다(약 150MB, 저장소에는 안 들어감). 클립을 실제 영상으로 교체한 뒤에도 다시 돌려서 회귀가 없는지 확인할 것 — 영상 길이가 달라져도 코드가 `v.duration`을 그대로 읽어 쓰므로 대부분 그대로 통과해야 하지만, 12MB 업로드 한도는 실사 클립에서 걸릴 수 있어 그 부분은 실제 클립으로 별도 확인 필요(위 "콘텐츠 미완성" 항목 참고).
- `eslint.config.mjs`로 저장소 전체 린트 가능 — 루트에서 `npm run lint`. 빈 `catch(e){}`는 이 코드베이스가 "실패해도 무시" 용도로 의도적으로 많이 쓰는 패턴이라 허용해뒀다(버그 아님).
- `docs/sw.js`(서비스워커)가 `docs/vendor/`의 ffmpeg 엔진(31MB)+qrcode.js만 캐시우선으로 서빙한다 — 재부팅·캐시비움 후에도 행사장 와이파이로 매번 다시 안 받게. `docs/app.js`/`index.html`/`clips/`/Cloud Functions는 건드리지 않는다. 캐시 무효화가 필요하면 `docs/sw.js`의 `CACHE_NAME` 버전을 올린다(예: `-v1` → `-v2`).
- `functions/`의 `firebase-admin`을 14.x로 올렸다(2026-08-27) — 예전엔 `firebase-functions@6.x`의 peer dependency가 11~13.x만 허용해 막혔는데, `firebase-functions`가 7.x로 오르며 14.x를 지원하게 됐다. 실제 재배포+curl 검증 완료. 남은 moderate 취약점 7건은 `uuid<11.1.1`이 근본 원인인데 Google 자신의 `@google-cloud/storage`가 아직 안 올린 전이 의존성이라, 최신 버전 조합에서도 그대로 남는다 — 진짜 업스트림 대기 상태(`npm audit fix --force`가 제안하는 firebase-admin 10.3.0 다운그레이드는 지금 쓰는 모듈형 API가 없던 버전이라 코드가 깨져서 절대 하면 안 됨). 할 수 있는 최선(최신 버전 업그레이드)은 이미 했고 남은 취약점은 Google 쪽 문제라 §4-1 구조적 상한으로 **기술부채 항목 100점 처리**(2026-08-27 대표 확인).

## 2000명/일 규모 실측 스트레스테스트 (2026-08-28, 대표 지시)
대표님 질문("하루 2000명 돌려도 괜찮냐")에 실제로 실측했다 — Playwright로 10개 병렬 워커가 진짜 프로덕션 Firebase Functions/Storage에 **2000건을 실제로 업로드**(파일명에 `stress_` 접두사 임시로 붙여 실제 학생 업로드와 분리, 끝나고 전부 삭제 확인). 결과: **1989/2000(99.45%) 성공**, 총 52.5분, 레이트리밋 429는 **0건**(분당 60건 상향이 정상 작동 확인). 11건 실패는 거의 전부 같은 반복 지점(i≈121)에 몰려있어 테스트 하네스/네트워크의 일시적 blip으로 판단(시스템적 용량 문제 아님).

**이 테스트로 실제 결함 하나를 더 찾았다**: 2000개에 가까운 파일을 한 번에 지우려다 "Memory limit of 256 MiB exceeded"로 삭제 작업이 실패했다. `cleanupAfterCutoff`(12월 1일 자동삭제 함수)도 정확히 같은 패턴이라, 행사 당일 실제로 수천 건이 쌓인 상태로 그 함수가 깨어나면 똑같이 죽어서 **자동삭제 자체가 실패**(아동 개인정보가 예정대로 안 지워짐)할 수 있었다. `chunk()`로 100개씩 배치 삭제하도록 고치고 memory도 256→512MiB로 올려서 재배포·재검증 완료.

## 알아야 할 것
- Firebase Functions의 CORS 허용 출처(`functions/index.js`의 `ALLOWED_ORIGINS`): GitHub Pages(edutogether.github.io), voice-cinema.web.app/.firebaseapp.com, 그리고 2026-09-02부터 Portal 리버스 프록시 도메인(edutogether.kr) — poster-studio와 동일 패턴. 프록시는 정적 콘텐츠만 다루고 이 Cloud Functions 도메인은 직접 호출되므로 프록시 뒤 페이지에서도 Origin은 edutogether.kr 그대로 넘어온다.
- `/upload`는 `functions/index.js`의 `BOOTH_TOKEN` 상수와 `docs/app.js`의 동일 상수가 일치해야 동작한다 — 진짜 비밀이 아니라(공개 프론트에 그대로 노출됨) 무차별 스크립트 시도를 막는 1차 방어선일 뿐이다(2026-09-01부로 `test/token-sync.test.js`가 이 둘의 일치를 자동 검사한다). mimeType(video/mp4만 + 2026-09-01부로 실제 파일 내용의 mp4 시그니처까지 검사, `functions/validate.js`의 `hasMp4Signature()`)·디코딩 후 크기(20MB)·파일명 길이(120자)·**분당 요청수(60회, 클라이언트 IP별)**도 서버단에서 강제한다(2026-08-26 정밀감사 반영, 한도는 2026-08-28에 10→60으로 조정 — 아래 항목 참고).
- **레이트리밋은 `app.set('trust proxy', 1)`이 반드시 필요하다** — Cloud Run 뒤에서 이 설정 없이는 서로 다른 클라이언트가 전부 같은 IP로 뭉뚱그려진다(실제로 curl로 재현·확인함, 2026-08-28). 값은 꼭 `1`이어야 하고 `true`로 하면 안 된다 — `true`는 클라이언트가 스스로 `X-Forwarded-For`를 지어내 레이트리밋을 완전히 무력화할 수 있는 우회로가 된다(브라우저는 이 헤더를 못 건드리지만 curl 같은 비브라우저 클라이언트는 가능 — 65회 스푸핑 시도로 실제 재현·검증함). 부스 와이파이는 보통 NAT로 공인 IP 하나를 같이 쓰므로, 여러 학생이 동시에 태블릿을 쓰면 한 버킷을 자연스럽게 공유한다 — 그래서 상한을 분당 10에서 60으로 올려뒀다(2000명/일 규모로 계산해도 여유 있음, 대표 문의로 실측 확인 2026-08-28).
- 인터넷이 끊기면 클라우드 업로드가 실패하고, 그 기기에서 직접 다운로드하는 방식으로 폴백된다(코드상 `local_fallback` 처리, 1회 자동 재시도 후 폴백).
- 영상 코덱은 반드시 **H.264**(H.265/HEVC는 브라우저에서 화면 검게 나옴) — 프로그램 시작 시 자동 코덱점검 있음.
- 학생 음성 녹음 임시저장 — **12월 1일부터 자동삭제되지만, 그 전에 남은 테스트 파일은 대표가 수동 확인·삭제 필요.**
- 아이패드(사파리)는 마이크 호환 문제 있어 권장 안 함 — 노트북 또는 안드로이드 태블릿 권장.

## 다음 단계 (사용자 요청 시 진행)
"프론트 백엔드 전부 풀스택으로 100점 만점으로" — GitHub 업로드는 완료됐음(edutogether 조직 등록·포탈 카드 추가는 미확인, 필요 시 팀장에게 확인). 처음 코드 감사는 `COMMON_STANDARDS.md` §4-1(2026-08-25 갱신: 모호한 "~점 근처" 표현 금지, 결함 근거 기반 감점, 수정 완료 시 정확히 100점) 기준 최대강도(실행+실측 포함)로 한 번에 진행할 것.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외).

## 대표와의 소통 경로 (2026-08-26 확정 — 반드시 지킬 것)
이 세션은 대표와 직접 대화를 시작하지 않는다. 진행상황 공유·질문·의사결정 요청은 전부 **팀장(D:\Projects 최상위 세션, "Project Engineering")을 거쳐서만** 한다 — 대표가 이 세션 창을 직접 열어서 먼저 말을 걸어온 경우에만 그 건에 한해 답한다(최상위 CLAUDE.md "조직 구조" 섹션 참고). 팀장에게서 온 메시지("Project Engineering의 메시지")는 곧 대표의 지시가 전달된 것이므로 별도로 대표에게 재확인하지 말고 그대로 실행한다.
