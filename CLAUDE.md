# CLAUDE.md — Voice Cinema (잉키 보이스 시네마)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\voice-cinema`
- **스택(2026-08-26 재설계, 2026-08-26 저장소 백엔드 2차 교체)**: 정적 프론트엔드(`docs/`, GitHub Pages 배포) — 영상 합성이 서버가 아니라 브라우저 안 ffmpeg.wasm으로 처리됨. 저장소는 Google Apps Script+Drive에서 poster-studio와 동일한 **Firebase Functions + Firebase Storage**(`inky-voice` 프로젝트)로 교체 — 특정 개인 구글 계정에 소유권이 묶이는 문제를 없애기 위함(대표 판단, 2026-08-26). 예전 Node.js/Express 로컬 서버(`server.js`, `public/`, `config.json`, `start.bat`/`start.command`)는 poster-studio와 같은 이유(MDM 노트북 설치 불가·방화벽)로 더 이상 쓰지 않지만, 삭제하지 않고 설치판 회귀 대비용으로 저장소에 그대로 남겨둠. `apps-script/Code.gs`도 마찬가지로 더 이상 쓰지 않는 이전 버전이지만 참고용으로 남겨둠.
- **기능**: 무성영상 6종(장르별)에 더빙 → 브라우저에서 합성 → Firebase Storage 자동저장 → QR 전달
- **자동삭제**: 2026년 12월 1일부터 예약 함수(`cleanupAfterCutoff`, Cloud Scheduler)가 매일 새벽 3시(KST)에 저장된 영상을 전부 삭제 — "다운로드는 11월 안에만 가능" 정책, 결과 화면에도 안내 문구 표시됨.
- **배포**: `https://edutogether.github.io/voice-cinema/` — GitHub Pages(브랜치 `master` · `/docs` 폴더) 배포 확인됨, ffmpeg.wasm 로딩·화면 전환·미리보기까지 실사용 확인 완료(2026-08-26). **Firebase 백엔드 전환 배포는 진행 중** — 아래 "남은 배포 단계" 참고.

## 재설계 후 남은 배포 단계 (2026-08-26)
1. ~~Firebase 프로젝트 `inky-voice` 생성 + Blaze 전환~~ — 완료
2. **Firebase Storage 활성화** — 대표 처리 중
3. `firebase use --add`로 이 폴더에 `inky-voice` 프로젝트 연결
4. `firebase deploy --only functions` 실행 → 발급되는 함수 URL을 [docs/app.js](docs/app.js)의 `API_BASE`에 반영
5. 실제 더빙→저장→QR까지 실사용 확인, `.gitignore`의 `outputs/` 폴백 동작도 유지되는지 확인
6. 위 끝나면 이 섹션 지우고 "정상 운영중"으로 갱신

## 🔴 콘텐츠 미완성 — 행사 전 필수 조치 (2026-08-26 발견)
`clips/`·`docs/clips/`에 있는 6개 mp4(action/animation/drama/fantasy/horror/sitcom)가 **전부** 진짜 영화 클립이 아니라 "SAMPLE - replace with Kling video"라는 문구가 박힌 컬러바 테스트 영상이다(6개 전부 직접 재생해서 확인함, 예외 없음). 인프라·코드는 완전히 정상이지만 이 상태로 행사를 열면 아이들이 테스트 영상에 더빙하게 된다. Kling AI 등으로 실제 무성 클립 6종을 제작해 두 폴더(`clips/`, `docs/clips/`) 모두에 동일 파일명으로 교체 필요 — 이건 코드 작업이 아니라 콘텐츠 제작이라 대표(또는 원작자) 확인·처리 필요.

## 알아야 할 것
- Firebase Functions는 GitHub Pages(edutogether.github.io) 출처만 CORS 허용 — poster-studio와 동일 패턴.
- 인터넷이 끊기면 클라우드 업로드가 실패하고, 그 기기에서 직접 다운로드하는 방식으로 폴백된다(코드상 `local_fallback` 처리, 자동 재시도 없음).
- 영상 코덱은 반드시 **H.264**(H.265/HEVC는 브라우저에서 화면 검게 나옴) — 프로그램 시작 시 자동 코덱점검 있음.
- 학생 음성 녹음 임시저장 — **12월 1일부터 자동삭제되지만, 그 전에 남은 테스트 파일은 대표가 수동 확인·삭제 필요.**
- 아이패드(사파리)는 마이크 호환 문제 있어 권장 안 함 — 노트북 또는 안드로이드 태블릿 권장.

## 다음 단계 (사용자 요청 시 진행)
"프론트 백엔드 전부 풀스택으로 100점 만점으로" — GitHub 업로드는 완료됐음(edutogether 조직 등록·포탈 카드 추가는 미확인, 필요 시 팀장에게 확인). 처음 코드 감사는 `COMMON_STANDARDS.md` §4-1(2026-08-25 갱신: 모호한 "~점 근처" 표현 금지, 결함 근거 기반 감점, 수정 완료 시 정확히 100점) 기준 최대강도(실행+실측 포함)로 한 번에 진행할 것.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외).
