# Voice Cinema Windows 설치판 (`desktop/`)

웹 Voice Cinema(저장소 루트의 `dist/`, 정본 주소 `voice.edutogether.kr`과 같은 화면)를 Windows 프로그램으로 싸는 곳이다.
Electron 앱(`main.js` · `bundle.js`)과 NSIS 설치 프로그램(`electron-builder.yml` · `nsis/`)으로 `release/Voice Cinema Setup.exe`를 만든다.
기준과 근거는 [`_docs/intents/2026-10-27-desktop-installer/intent.md`](../_docs/intents/2026-10-27-desktop-installer/intent.md).

## 새 설치 파일 만들기 — 한 줄

```bash
cd desktop && npm run dist
```

이 한 줄이 차례대로 한다:

1. `py -3 tools/make-icons.py` — 마이크 그림으로 아이콘 · 설치 화면 그림을 `build/`에 만든다(커밋하지 않는다)
2. `npm --prefix .. run build` — 루트에서 웹을 빌드해 `../dist/`를 새로 만든다(이것이 설치판에 실리는 앱 내용이다)
3. `node --test test/*.test.js` — 설치판 유닛(설치기 문구 · 바꿔 끼운 템플릿 · 설치판 안의 파일 처리)
4. `electron-builder --win nsis --x64` — `../dist/` 전체를 그대로 실어 `release/Voice Cinema Setup.exe`를 만든다

처음 한 번만: 루트에서 `npm ci`, `desktop/`에서 `npm ci`. Python 3과 Pillow가 있어야 한다.

## 앱 내용(영상 등)을 바꿀 때

설치 프로그램은 손대지 않는다. 웹(루트 `src/` · `public/`)을 바꾼 뒤 위 한 줄을 다시 돌리면 끝이다.

- 설치기에는 파일 목록 · 개수 · 크기 · 이름이 하나도 적혀 있지 않다. 진행 막대(압축 풀기는 푼 바이트, 복사는 파일 크기 + 파일 하나당 몫),
  «설치: / 삭제: …» 줄, 지울 파일은 모두 그때 설치기에 든 파일 · 설치된 파일로 센다. 영상이 몇 배 커지거나 개수 · 이름이 바뀌어도 그대로 맞는다.
- 이미 깔린 PC에 새 설치 파일을 돌리면 «이미 설치되어 있습니다 / 지우고 새로 설치할까요?»를 묻고, 예전 판을 그 판의 제거 프로그램으로 통째로
  지운 뒤 새 판을 설치한다 — 이름이 바뀌었거나 없어진 예전 영상 파일이 남지 않는다.
- 설치 파일 하나는 NSIS 한계로 2GB를 넘을 수 없다(지금 약 240MB — 영상은 거의 압축되지 않아 영상 크기만큼 커진다).

## 확인

- `npm test` — 설치판 유닛
- `npm run test:e2e` — 빌드한 앱을 직접 띄우는 검사(루트의 `@playwright/test`를 쓴다). 창은 가장 작은 모니터에 뜬다(시험 전용 환경 변수 `VC_TEST_SMALLEST_DISPLAY=1` — `main.js`가 처음부터 그 모니터에 창을 만든다)
- `tools/installer-probe.ps1` — 설치 · 제거 화면을 사람처럼 넘기며 원본 캡처 · 안내문 폭 검사 · 진행 화면 기록 · 창 녹화 · 명령 창 감시(쓰는 법은 파일 머리)
- `tools/progress-video.py` — 그 녹화로 막대 뒤로 감 · 멈춤 · 100% 시간 · 깜빡임을 잰다
- `node tools/layout-compare.mjs <결과 폴더>` — 설치판과 웹(로컬 빌드)을 같은 안쪽 크기로 1~3단계 찍어 견준다(창을 띄우지 않는다)
- `node tools/resize-check.mjs <결과 폴더>` — 빌드한 앱을 가장 작은 모니터에 띄워 창 크기를 바꿔 가며(최소 · 중간 · 최대화 · 끌기 · 다른 배율 모니터)
  1~3단계를 같은 크기로 새로 연 웹과 견준다
- 앱 창의 안쪽 최소 크기는 1040×540이다(`main.js` — 웹이 PC 화면으로 맞춰지는 가장 작은 크기)

`nsis/vc-ui.exe`는 NSIS 기본 화면 묶음에서 영어 «확인 중» 상자 하나만 글 없는 0×0 상자로 바꾼 것이다(`tools/make-ui.ps1`로 다시 만든다 — NSIS 판을 바꾸면 함께).

electron-builder는 26.17.0으로 고정이다. 판을 올리면 `test/nsis-template.test.js`가 바꿔 끼운 템플릿의 원래 내용이 그대로인지 먼저 본다.
