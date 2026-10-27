<!-- 원본 최종 수정: 2026-09-08 · 원본 위치: D:\Projects\_shared\intent-kit\TEMPLATE.md
     원본 버전: d405a4918786
     사본의 "원본 버전"이 위와 다르면 원본이 갱신된 것이니 재복사한다. 사본에서 직접 고치지 않는다.
     이 스탬프 블록은 사본에도 그대로 남긴다 — 지우면 그 저장소만 갱신을 감지할 수 없게 된다. -->
---
status: in-progress
등급: 2
작성자: Voice Cinema 세션(Claude)
작성 시각: 2026-10-27 (팀장 지시 — 대표님 10/27 «Windows 설치판»)
---

# Windows 설치판 `VoiceCinema-Setup.exe` — ⏸ 보류(10/27 Bumm님 결정 A: Voice Cinema가 완성된 뒤 만든다)

> **지금은 멈춘 일이다.** 10/27 02시 무렵 팀장 전달: «Voice Cinema는 아직 완성 전이라 설치판을 만들지 않는다. 완성된 뒤 만든다(A).»
> 이 가지(`feat/vc-desktop`)의 시안 · 검사 · 기록은 지우지 않고 남겨 두었다. 다시 시작할 때는 아래 «다시 시작할 때의 기준»부터 적용한다.
> 시험 설치본은 이 PC에서 제거했다(설치 폴더 · 바로가기 · 등록 · `%APPDATA%\Voice Cinema` 모두 없음, 10/27 확인). 설치 프로그램은 배포하지 않았다.

## 다시 시작할 때의 기준 (10/27 Bumm님이 시험 설치 화면을 직접 보고 정한 것, 팀장 전달)

1. **아이콘은 원래 마이크 그림이다** (10/27 Bumm님 결정, 팀장 전달 — 원문 «보이스 시네마도 원래 마이크 있잖아 그걸로 하자»).
   - 그림: `public/icons/studio-microphone.png`(160×160, SHA-256 `1a8e9751…add8728f`)를 원본 그대로 쓴다. 다시 그리거나 고치지 않는다.
   - 쓰는 자리: 앱 아이콘 · 설치 파일 아이콘 · 제거 프로그램 아이콘 · 설치 창 머리 로고(electron-builder `icon` · `installerIcon` ·
     `uninstallerIcon` · `installerHeaderIcon` · 머리 그림 `installerHeader.bmp`의 로고).
   - «VC» 이름표는 뺀다. 원본이 160px이라 ico의 256px 칸만 키우고, 나머지 크기는 원본을 줄인다.
   - 이 결정으로 아래가 바뀐다.
     - 처음 기준 «VC는 작고 선명하게»와 시안의 노란 InKY 카메라 + «VC» 이름표(`desktop/tools/make-icons.py`의 `BADGES` 표)는 쓰지 않는다.
     - Poster Studio와 «VC/PS» 글자 크기 · 위치를 한 표로 맞추던 일도 없어졌다(PS 아이콘은 그 전에 취소).
2. **설치 화면 그림에는 글자를 넣지 않는다** — 머리 그림 `installerHeader.bmp` · 옆 그림 `installerSidebar.bmp`에 «VC»를 넣지 않는다(10/27 Bumm님 기준).
3. **«나만 / 모든 사용자» 고르는 화면은 그대로 둔다.** «모든 사용자»를 고르면 기본 위치는 `C:\Program Files\InKY Film Festival\Voice Cinema`다.
   (시안은 사용자별 기본 위치가 `%LOCALAPPDATA%\Programs\Voice Cinema`였다.)
4. **시작 메뉴 `InKY Film Festival` 폴더 안에 `Voice Cinema`와 `Uninstall Voice Cinema`를 둘 다 둔다.** 바탕화면 바로가기도 만든다.
   (시안은 시작 메뉴 맨 위에 `Voice Cinema` 하나뿐이었다 — electron-builder의 `menuCategory`와 제거 바로가기는 따로 넣어야 한다.)
5. **«설치된 앱»과 제어판 «프로그램 추가/제거»에서 제거된다.**
- 기준 3~5는 Poster Studio 설치판과 같은 줄이다(같은 날 같은 지시).
- 다시 빌드하는 법:
  1. 루트에서 `npm ci`를 돌린다.
  2. 아이콘 · 설치 화면 그림을 `desktop/build/`에 만든다. 루트 `.gitignore`의 `build/`에 걸려 커밋되지 않는다.
     🟠 지금 `desktop/tools/make-icons.py`는 노란 카메라에 «VC» 이름표를 그리는 시안이다. 위 1번(마이크 그림)대로 고친 뒤 돌린다.
  3. `cd desktop && npm ci && npm run dist`로 만든다(→ `desktop/release/VoiceCinema-Setup.exe`).
  4. `npm test` · `npm run test:e2e`로 확인한다.

## 문제

현장(11/14 인천 CGV) 노트북에서 Voice Cinema를 쓰려면 지금은 브라우저로 `voice.edutogether.kr`을 열어야 한다. 대표님이 Windows에서
더블클릭으로 설치하는 일반 프로그램을 원하셨다 — Node · 압축 풀기 · 명령어 없이, 인터넷이 없어도 열리고, 로컬에서 되는 기능은 오프라인에서도.

## 원하는 결과

- `VoiceCinema-Setup.exe` 하나로 설치하고, 위 기준대로 바로가기 · 제거가 된다. 끝나면 앱이 바로 열린다.
- 화면 · 이미지 · 영상 · 글꼴 · 엔진이 설치판 안에 있어 인터넷 없이 열린다. 녹음 · 합성 · «이 기기에 저장»은 오프라인에서도 된다.
- QR(서버 저장)은 인터넷이 있을 때만 된다 — 없으면 기다리지 않고 «인터넷에 연결되어 있지 않아 QR을 만들 수 없어요»로 정직하게 알린다.

## 시안에서 고른 것과 근거

- **Electron** (Tauri 아님) — 지금 웹 프론트를 E2E로 검증한 것과 같은 Chromium을 싣고(ffmpeg.wasm · MediaRecorder · CSP가 그대로 돈다),
  npm만으로 빌드되며, electron-builder의 NSIS 설치 프로그램이 위치 선택 · 바로가기 · 제거 등록을 지원한다. Tauri는 Rust 도구 사슬이 새로 필요하고,
  기기마다 판이 다른 WebView2에서 돌아 검증한 화면과 갈라질 수 있다. 크기는 Electron이 크다(시안 설치 프로그램 231.8MB).
- **주소는 정본(`https://voice.edutogether.kr`) 그대로, 파일만 설치판 안에서** — 업로드 서버의 허용 출처와 App Check(reCAPTCHA) 허용 도메인이
  이 주소라 file:// 이나 새 주소로 띄우면 QR이 늘 막힌다(서버 함수는 바꾸지 않는다는 제약). Electron이 그 주소의 요청만 설치판 안의 `dist`로 답하고
  (`desktop/bundle.js`, Hosting처럼 구간 요청 206 · firebase.json의 `**` 보안 헤더), 나머지(reCAPTCHA · 업로드 서버)는 `ses.fetch`로 인터넷에 넘긴다.
- **서비스워커는 쓰지 않는다** — `/sw.js`를 404로 답해 등록을 막는다. 등록되면 그것이 받는 요청이 위 처리기를 거치지 않아 인터넷의 다른 판이 섞일 수 있다.
- 앱 코드 변경 두 곳(웹에도 같다 — 이 가지에만 있고 라이브에는 안 나감):
  1. 엔진 받기가 서비스워커를 기다리던 20초 — 등록이 실패하면 기다리지 않는다(`src/lib/sw.ts`의 `serviceWorkerRegistering`, `src/lib/ffmpeg.ts`).
     설치판에서 매번 20초 동안 «영상 저장 준비 중… 0%»였다.
  2. 인터넷이 아예 없으면(`navigator.onLine === false`) 올리지 않고 바로 «이 기기에 저장» + 그 까닭(`src/components/Result.tsx`).
     전에는 App Check 대기 20초를 여러 번 «저장하고 있어요»로 보낸 뒤 «인터넷이 잠깐 불안해서»라고 했다.
- 마이크만 허용(카메라 · 위치 거절) · «이 기기에 저장»은 묻지 않고 다운로드 폴더에(같은 이름은 « (1)») + 저장 알림 창 · 바깥 주소는 기본 브라우저 ·
  메뉴 막대 없음 · 창 하나만(두 번 열어도) · 창 제목 «Voice Cinema» · 게시자 «같이교육».

## 제약

- 라이브 배포 · GitHub 푸시 · `gh` 금지, 서버 함수 · `feat/vc2-release` · master 변경 금지. 가지는 라이브 코드(`2751ae6`, 배포 기록 문서 커밋 `2fb73a8`)에서 땄다.
- 새 프론트 · 새 디자인을 만들지 않는다. 영화 연출 · 영상 품질 · 승인된 제작물은 그대로다.
- 코드 서명 인증서는 사지 않는다(유료) — SmartScreen 경고는 제약으로 남긴다.
- 키 · 토큰 · 비밀번호를 설치판에 넣지 않는다. 설치판에 들어가는 값은 웹에 이미 공개된 것뿐이다(BOOTH_TOKEN · Firebase 웹 설정은 원래 공개값).

## 멈출 때까지 확인한 것 (10/27, 실제 실행)

- **설치 마법사**(한국어): 사용자별 기본 위치와 다른 위치 둘 다 설치 → 바탕화면 · 시작 메뉴 바로가기, HKCU 제거 등록(게시자 «같이교육»),
  설치 뒤 바로 실행, 창 닫기로 종료, 시작 메뉴로 다시 실행, 두 번 열어도 창 하나 — 모두 확인. exe · 설치 프로그램 아이콘은 `icon.ico` 32px 항목과 화소까지 같다.
- **제거**: 화면으로 제거하면 설치 폴더 · 바로가기 · 등록이 사라졌다. 🟠 그런데 한 번은 `%APPDATA%\Voice Cinema`가 남았고, 조용한 제거(`/S`)에서는 두 번 다 지워졌다 —
  원인을 못 찾은 채 멈췄다(다시 시작하면 화면 제거에서 앱 데이터가 지워지는지부터 본다). 이 PC의 시험 설치본은 조용한 제거로 모두 지웠다.
- **App Check**: 사람이 연 것과 같은 방식(자동화 없이)으로 띄운 설치판은 교환 요청이 200. Playwright로 띄운 창은 403(웹 헤드리스와 같다).
- **업로드 서버까지의 길**: 설치판에서 `GET /`(배포 커밋) 200, 토큰 없는 `POST /upload`는 서버가 403으로 거절 — 요청이 처리기를 지나 그대로 나간다.
- **검사**: 설치판 유닛 9개(`desktop/test/`, node:test) · 설치판 E2E 6개(`desktop/e2e/desktop.spec.mjs`, 빌드한 exe — 첫 화면 · 권한 · QR · 기기 저장 ·
  인터넷 없음 · 창/바깥 주소) 통과. 웹 E2E 2개 추가(`e2e/dubbing-flow.spec.js` «인터넷이 없으면…», `e2e/background-load.spec.js` «서비스워커 등록이
  실패하면…») — 옛 코드에서 빨간불(문구 · 엔진 시작 23.7초) 확인. 루트 유닛 93 + functions 55 · 린트 통과.
  웹 E2E 전체는 멈춤 지시로 중간에 껐다(그때까지 177개 통과 · 실패 0 — 끝까지 돈 결과가 아니다).
- 🟠 **설치판 검사에서 업로드를 `page.route`로 가로채면 안 된다** — 설치판이 https를 직접 처리해 닿지 않는다. 처음 두 검사가 그렇게 짜여 업로드 요청이
  운영 서버까지 갔다(App Check 토큰이 없어 서버가 거절, 저장된 것 없음). 지금 검사는 `ses.fetch`를 바꿔 끼운다(`routeUpload`).
- 🟠 **NSIS 언어**: `multiLanguageInstaller: false`면 electron-builder가 `language` 값과 상관없이 영어만 넣는다 — `true` + `installerLanguages: [ko_KR]`.
- 🟠 **권한 확인 처리기가 받는 출처는 끝에 «/»가 붙는다**(`https://voice.edutogether.kr/`) — 문자열 비교가 아니라 `isBundleUrl`로 본다(처음엔 마이크 조회가 «거절»으로 나왔다).
- **electron-builder의 `deleteAppDataOnUninstall`** — 문서는 «원클릭 전용»이라 하나, 이 판(26.17.0)은 마법사 설치에도 정의를 넣는다(위 «제거» 참고).

## 미검증

- 위 기준(1~5)대로 고친 설치판 — 아직 만들지 않았다.
- 실기 장비(부스 노트북 · 실제 마이크 · 실제 아이 목소리), 11/12 현장.
- 사람이 연 설치판의 실제 업로드 1건(QR까지) — 운영 저장소(`dubs/`)에 시험 파일이 남아 하지 않았다.
- 인터넷에서 내려받은 설치 프로그램의 SmartScreen 화면(이 PC에서 만든 파일이라 뜨지 않는다).
- «모든 사용자» 설치(관리자 권한 창이 떠서 자동으로 누를 수 없다).
- 와이파이는 붙었는데 인터넷이 안 될 때 «이 기기에 저장»까지 걸리는 시간.

## 미결 질문

- 없음. 다시 시작하는 때는 Bumm님이 정한다(Voice Cinema 완성 뒤). 그때 FINAL 7.0S 등 그 시점의 라이브 코드를 싣는다 — 이 시안은 라이브 5초 장면이다.
