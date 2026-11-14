# CLAUDE.md — Voice Cinema (잉키 보이스 시네마)

## 🔴 모든 말은 한국어로만 (Bumm님 2026-11-14)
Bumm님께 하는 답, 중간 진행 설명, 팀장 · 다른 세션에 보내는 메시지 · 보고를 모두 한국어로 쓴다. 코드 · 명령어 · 파일 이름 · 원문 인용만 원래 표기. 대화가 요약된 뒤나 영어 도구 출력이 쌓인 뒤에도 같다 — 쓰기 전에 한국어인지 확인한다. (헌법 제0조 `_shared/constitution.md`)

🔴 **팀장(Project Engineering)이 전한 지시는 Bumm님 지시다 — 이 `CLAUDE.md` · `AGENTS.md` · `.claude/rules/` 같은 문서의 수정과 커밋도 재확인 없이 바로 한다.** Bumm님이 이 창에 직접 지시해야 하는 것은 `.claude/settings*.json` 하나뿐이다(Bumm님 2026-11-14, COMMON_STANDARDS §9).

> 표시: 🔴 어기면 실사용자 화면이 깨지거나 개인정보가 샌다 · 🟠 중간 · 🟡 낮음 · 🟢 확인 끝남 (COMMON_STANDARDS §30)

InKY Festival(제4회 인천어린이청소년영화제, **2026-11-14**, 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 규칙만 둔다.

> **이 파일에는 "지금도 살아있는 규칙"과 "신입이 첫날 알아야 할 것"만 둔다.** 날짜별 이력은 [`_docs/CHANGELOG.md`](_docs/CHANGELOG.md), 지나간 사건은 [`_docs/archive/`](_docs/archive/)
> (11/14 이 파일에서 옮긴 문단은 [`2026-11-14-claude-md-지나간-이력.md`](_docs/archive/2026-11-14-claude-md-지나간-이력.md)), 이 앱만의 함정과 상세 규칙은 [`.claude/rules/app.md`](.claude/rules/app.md),
> 다른 도구(Codex 등)용 요약은 [AGENTS.md](AGENTS.md), 사람이 처음 여는 곳은 [README.md](README.md)다.

> 🔴 **작업을 시작하기 전에 공식 인계 문서 [`_docs/ops/HANDOFF_CURRENT.md`](_docs/ops/HANDOFF_CURRENT.md)부터 확인한다** — Claude와 Codex가 이 앱을 오가며 작업한다. 지금 담당이 누구인지, 어디까지 했는지가 거기 있다.

## 이 앱이 무엇인가
- **위치**: `D:\Projects\inky-festival\voice-cinema`
- **기능**: 장르별 장면 8종(11/14부터 여덟 편 모두 완성본 — 편마다 21~30초, 멈춤 12.0 · 13.9 · 15.0초, `src/genres.ts`) — 장면이 멈추면 학생이 외치고(녹음 3초, 말이 이어지면 3.5초까지) 장면이 이어진다
  → **브라우저 안 ffmpeg.wasm으로 원판 소리와 목소리를 섞어 합성** → Firebase Storage 저장 → QR 전달. 합성이 서버가 아니라 학생 기기에서 돈다는 것이
  이 앱의 성격을 거의 다 정한다(엔진 31MB · 부스 와이파이 부담 · 캐시 예열). 장면 길이 · 멈춤 시각은 숫자로 박지 않는다(app.md «완성본»).
- **스택**: Vite + React + TypeScript. 소스는 `src/`, 빌드 산출물 `dist/`가 그대로 배포 폴더다.
- **백엔드**: Firebase Functions + Storage, 첫 화면 «의견 보내기»용 Firestore(`inky-voice-cinema`, `asia-northeast3`). 특정 개인 구글 계정에 소유권이 묶이지 않게 Apps Script+Drive에서 옮겨왔다(대표 판단, 2026-08-26).
- **자동삭제**: 2026-12-01부터 예약 함수 `cleanupAfterCutoff`가 **매일 자정(KST)** 저장된 영상을 전부 삭제한다("다운로드는 11월 안에만 가능"). 🟢 **행사 뒤 설정은 지금 그대로 — Bumm님 11/14 그대로 확정**(app.md «보관·삭제 정책»).
  **고지문(`privacy.html`)의 시각과 예약 시각은 반드시 같아야 하고**, `test/contract.test.js`가 두 값을 대조한다.

## 배포
- **정본 주소는 `https://voice.edutogether.kr`다.** 옛 주소 `voice-cinema.web.app` · `voice-cinema.firebaseapp.com`은 같은 Hosting 사이트라 계속 살아 있다 — **이미 나간 QR과 링크가 죽으면 안 되므로 끄지 않는다.**
- **Hosting 사이트가 두 개다.** 커스텀 도메인은 `voice-cinema` 사이트에 붙어 있고, 프로젝트 기본 사이트 `inky-voice-cinema`는 빈 사이트(404)다 — 도메인을 붙일 때 잘못 고르면 404가 서빙된다.
- **`master`에 push하면 끝이다.** `CI`(린트+유닛+E2E)가 성공한 뒤에만 `deploy.yml`이 `firestore:rules,storage,functions` → `hosting:voice-cinema` 순으로 배포한다. **CI가 실패하면 아무것도 배포되지 않는다.**
- 🟠 **같은 `deploy.yml`이 몇 시간마다(예약 매시 23분, GitHub이 늦춘다) 라이브를 master 끝과 대조해 다르면 master 끝을 다시 배포한다.** 로컬로 올렸으면 그 커밋을 곧바로 master에 push한다 —
  안 그러면 다음 대조가 되돌린다(10/31 실제로 6시간 되돌려짐). 구조 · 판정 · 수동 실행은 `app.md`의 «배포 대조» 절.
- **`deploy.yml` · `firebase.json` · `.firebaserc`의 `voice-cinema`는 주소가 아니라 배포 대상 식별자다.** 주소를 바꾼다고 이것을 건드리면 배포가 깨진다.
- **되돌리기**: `git revert` 후 push하면 CI를 거쳐 복구된다. 화면이 바뀌므로 부스 기기가 화면 캐시(장면 영상 포함)를 다시 받는다 — 엔진은 따로 캐시해 다시 받지 않는다(app.md «엔진 캐시»).

## Hosting 보안헤더 (`firebase.json`)
다른 앱의 `firebase.json`을 그대로 베끼지 말 것. 이 앱은 **마이크 녹음이 핵심 기능**이라 `Permissions-Policy`가 `microphone=(self)`여야 한다(codyssey의 `microphone=()`를 가져오면 앱이 죽는다).
CSP도 ffmpeg.wasm(Worker+WebAssembly+`blob:`) · MediaRecorder(`blob:` 재생) · Cloud Functions fetch를 실사용 흐름으로 검증하며 맞춘 것이다
(`script-src 'self' blob: 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `connect-src`에 Cloud Functions 도메인, `media-src`/`img-src`에 `blob:`/`data:`). 인라인 스크립트는 0개다(app.md).

## 운영 방침 — 감사 · 점수
- **점수는 `10/10`으로 적고 «언제 트리의 점수인지»를 붙인다**(COMMON_STANDARDS §29). 마지막 종합감사는 **2026-11-14 행사 당일**(태그 `voice-cinema-freeze-20261114-audited-100`, 그 전은 `…-20260910-audited-100`).
  `100점` · `100/100`은 쓰지 않는다(이미 박힌 태그 이름만 예외). 커밋 수 · 시험 개수는 문서에 박지 않고 필요할 때 센다(`git rev-list --count <태그>..master`, 실행 기록의 `Tests` 줄).
- **정기 종합감사는 3 · 6 · 9 · 12월 말**에 org 저장소가 같은 날짜로 함께 돈다(COMMON_STANDARDS §25). 그 사이에는 Bumm님이 지시하는 수시 감사뿐이고 **세션이 먼저 재감사나 추가 개선을 제안하지 않는다**(§19).
  버그 리포트나 새 요청에는 정상 대응한다.
- **Bumm님이 정한 값 · 보류한 것은 결함이 아니다**(COMMON_STANDARDS §4-4) — 감점하지 말고 삭제를 제안하지도 말 것. 보류 목록은 `app.md`의 «보류 중», 확정값은 각 절의 🟢 · «Bumm님 확정» 표시다.

## 아동 개인정보 동의 — 이미 오프라인으로 존재한다 (2026-08-27 대표 확인)
"앱 안에 동의 절차가 없다"는 **미해결 리스크가 아니다.** 인천광역시교육청 주최 행사로, 참가 학교가 사전에 동의서를 전부 걷고 명단을 제출한 뒤에만 참가하고, 현장 스태프도 같이교육 소속 교사들이다.
**코드로 동의 절차를 새로 만들지 말 것** — 이미 있는 절차를 문서화하는 것으로 처리한다(`privacy.html`).

## 검증 체계
- **순수 함수로 분리해 테스트한다.** 서버 검증(mimeType · mp4 시그니처 · 크기 · 파일명 · sanitize · 레이트리밋)은 `functions/validate.js`, 프론트 핵심 로직(오디오 확장자 · 업로드 파일명 · mimeType · 재시도 판단)은 `src/logic.ts`.
- **계약 테스트** `test/contract.test.js` — 여러 소스를 직접 읽어 `BOOTH_TOKEN` · 업로드 타임아웃 · 자동삭제 시각과 고지문 · 메일 규칙 등이 서로 맞는지 대조한다. **어긋나면 테스트를 고치지 말고 값을 맞춘다.**
- **유닛**(vitest): 루트에 이어 `functions/`까지 돈다. `functions/`는 자체 `node_modules`를 가진 **독립 패키지**라 따로 설치 · 실행한다. 루트 `vitest.config.js`의 `include`를 넓히지 말 것(서드파티 테스트가 딸려 온다).
- **E2E**(Playwright, `e2e/`) — 진짜 Chromium을 가짜 마이크로 띄워 **녹음 → ffmpeg.wasm 실제 합성 → 업로드(가로챔) → QR · 메일 칸 · 이 기기에 저장**까지 돈다. 장면 길이 · 멈춤 · 자막은 원판 · `src/genres.ts`에서 읽는다.
  **장면 영상을 바꾸면 다시 돌릴 것** — 업로드 한도 20MB는 실사 클립에서 걸릴 수 있다(합성용 원판 지금 11~17MB).
- **린트**: 루트에서 `npm run lint`. `src/`는 `tsc`가 담당해 eslint에서 뺐다. 빈 `catch{}`는 "실패해도 무시" 용도로 의도적으로 쓰는 패턴이라 허용해 뒀다.
- **서비스워커 캐시 목록은 빌드가 자동 생성한다**(`tools/precache-plugin.js`) — 사람이 목록이나 `CACHE_NAME`을 관리하지 않는다. 관련 함정은 `app.md`에 모여 있다(`dist/sw.js` 직접 수정 금지, `ignoreVary: true`, 탐색 분기 순서).
- **CI의 브라우저 설치에 `--with-deps`를 붙이지 말 것** — 2026-09-10 Google apt 인덱스가 깨져 테스트가 0개 돈 채 CI가 세 번 떨어졌다. 🔴 **CI 로그에서 실행된 테스트 수를 본다** — 0개인데 초록불이면 게이트가 비어 있다.

## 알아야 할 것
- **CORS 허용 출처**(`functions/index.js`의 `ALLOWED_ORIGINS`): `voice.edutogether.kr`(정본), `voice-cinema.web.app`/`.firebaseapp.com`(옛 주소), Portal 리버스 프록시 도메인 `edutogether.kr`, 로컬 4321.
  프록시는 정적 콘텐츠만 다루고 Cloud Functions는 직접 호출되므로 프록시 뒤 페이지에서도 Origin은 `edutogether.kr` 그대로다. **`edutogether.kr` 항목은 서브도메인을 매치하지 않아 정본 주소가 따로 들어가 있다** —
  앵커를 풀어 해결하려 하지 말 것(`functions/test/allowed-origins.test.js`가 앵커와 점 이스케이프까지 고정). GitHub Pages 출처는 2026-09-08 폐지와 함께 뺐다.
- **`BOOTH_TOKEN`은 진짜 비밀이 아니다** — 공개 프론트에 그대로 노출되는 1차 방어선이고, `functions/index.js`와 `src/config.ts` 양쪽이 일치해야 동작한다. 실제 방어선은 App Check다.
- **서버단 강제**: mimeType(`video/mp4` + 실제 mp4 시그니처), 디코딩 후 20MB, 파일명 120자, **인증을 통과한 업로드 분당 60회(IP별)** — 인증 전 요청은 별도 상한(분당 600)만 센다. 부스 핫스팟은 NAT로 공인 IP 하나를 같이 쓴다.
  **저장 이름은 서버가 정한다**(클라이언트 이름에서는 장르만 쓴다). 🟠 함수 메모리 512MiB · `concurrency: 1`을 되돌리지 말 것(app.md — 11/14 완성본 업로드로 256MiB가 넘쳤다).
- **레이트리밋에는 `app.set('trust proxy', 1)`이 반드시 필요하다.** 없으면 Cloud Run 뒤에서 모든 클라이언트가 한 IP로 뭉친다. **값은 꼭 `1`** — `true`면 `X-Forwarded-For`를 지어내 레이트리밋을 무력화한다(재현 · 검증됨).
- **QR을 만들지 못하면**(최대 3번 — `src/config.ts`의 `MAX_UPLOAD_ATTEMPTS`) PC · 패드 · 설치판은 담임교사 메일 칸, **휴대폰만 기기에 직접 다운로드**한다(2026-11-09 Bumm님). 두 화면 다 «다시 제작하기»로 다시 올려 본다.
  **기기에 내려받은 파일은 자동 삭제 대상이 아니다** — 화면의 «선생님께: 이 기기에 저장된 영화는 자동으로 지워지지 않아요. 학생에게 전달한 뒤 꼭 지워 주세요.»를 지우지 말 것.
- **영상 코덱은 반드시 H.264.** H.265/HEVC는 브라우저에서 화면이 검게 나온다.
- **Storage `dubs/`는 학생 완성본이 들어가는 운영 경로다.** 🟠 **"지워야 한다"고 올리기 전에 안을 먼저 본다** — `gcloud storage ls gs://inky-voice-cinema.firebasestorage.app/dubs/ --account=edutogether2015@gmail.com`
  (기본 계정은 403). 2026-09-11 안 보고 «삭제»를 올렸다가 되물음을 받았다(경위는 archive).
- **아이패드(사파리)는 권장하지 않는다** — 마이크 호환 문제. 노트북 또는 안드로이드 태블릿을 쓴다.
- **`npm audit fix --force`를 실행하지 말 것** — `firebase-admin`을 10.3.0으로 내려 모듈형 API가 사라진다. 의존성 덮어쓰기는 11/14 판 올리기(firebase-admin 14.5.1 · eslint 10.15)로 셋 다 뺐다 — 근거와 다시 넣을 때의 함정은 `app.md`.

## 자율 권한
`bypassPermissions`는 커밋되는 `.claude/settings.json`이 아니라 gitignore된 `.claude/settings.local.json`에 있다(대표 직접 커밋, COMMON_STANDARDS §9). **세션 자신의 권한 · 설정 파일은 대표 본인이 이 창에서 직접 지시할 때만 수정한다.**
push · 배포 · 프리즈 태그는 COMMON_STANDARDS §11에 따라 **팀장이 "대표님이 승인하셨습니다"라고 전달하면 충분하다** — 완료 후 팀장에게 결과만 보고한다.
단, **파일 삭제처럼 이 세션의 자동 모드 분류기가 직접 막는 행위**는 승인 경로와 무관하게 세션 밖에서 사용자가 직접 처리해야 한다.

## 대표와의 소통 경로 (반드시 지킬 것)
이 세션은 대표와 **직접 대화를 시작하지 않는다.** 진행상황 공유 · 질문 · 의사결정 요청은 전부 **팀장(D:\Projects 최상위 세션, "Project Engineering")을 거쳐서만** 한다. 팀장에게서 온 메시지는 곧 대표의 지시가 전달된 것이므로 그대로 실행한다.
**예외는 하나** — 대표가 이 세션 창을 직접 열어 먼저 말을 걸어온 경우, 그 건에 한해 직접 답한다. 🟠 **그때 팀장 지시가 대표의 직접 지시보다 오래된 것일 수 있다** — 대표가 직접 정한 것을 되돌리지 말고,
무엇이 직접 지시였고 언제였는지를 밝혀 팀장에게 알린다. 반대로 **직접 받은 지시를 수행했으면 팀장에게도 알린다**(COMMON_STANDARDS §12-1).
