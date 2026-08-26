# CLAUDE.md — Voice Cinema (잉키 보이스 시네마)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\voice-cinema`
- **스택(2026-08-26 재설계)**: 정적 프론트엔드(`docs/`, GitHub Pages 배포) — 영상 합성이 서버가 아니라 브라우저 안 ffmpeg.wasm으로 처리됨. Google Apps Script가 Drive 자동저장 전담. 예전 Node.js/Express 로컬 서버는 poster-studio와 같은 이유(MDM 노트북 설치 불가·방화벽)로 제거됨.
- **기능**: 무성영상 6종(장르별)에 더빙 → 브라우저에서 합성 → Drive 자동저장 → QR 전달
- **배포**: `https://edutogether.github.io/voice-cinema/` — GitHub Pages(브랜치 `master` · `/docs` 폴더) 배포 확인됨, ffmpeg.wasm 로딩·화면 전환·미리보기까지 실사용 확인 완료(2026-08-26).

## 🔴 콘텐츠 미완성 — 행사 전 필수 조치 (2026-08-26 발견)
`clips/`·`docs/clips/`에 있는 6개 mp4(action/animation/drama/fantasy/horror/sitcom)가 **전부** 진짜 영화 클립이 아니라 "SAMPLE - replace with Kling video"라는 문구가 박힌 컬러바 테스트 영상이다(6개 전부 직접 재생해서 확인함, 예외 없음). 인프라·코드는 완전히 정상이지만 이 상태로 행사를 열면 아이들이 테스트 영상에 더빙하게 된다. Kling AI 등으로 실제 무성 클립 6종을 제작해 두 폴더(`clips/`, `docs/clips/`) 모두에 동일 파일명으로 교체 필요 — 이건 코드 작업이 아니라 콘텐츠 제작이라 대표(또는 원작자) 확인·처리 필요.

## 알아야 할 것
- **인증 없는 공개 엔드포인트**: Google Apps Script 웹앱이 "모든 사용자" 접근으로 배포됨 — **설계상 의도된 것**(인증 붙이면 저장 실패). 보안 감사 시 이 특성을 이미 알고 있는 상태로 판단할 것.
- `config.json`에 실제 배포된 `appsScriptUrl`이 이미 들어있음(공개 웹앱 주소라 시크릿은 아님). 재배포 시 "새 배포" 대신 "배포관리→새 버전"으로 올려야 주소가 유지됨.
- 인터넷이 끊겨도 로컬(`outputs/` 폴더)로 폴백 저장 가능 — poster-studio와 달리 완전 중단은 안 됨.
- 영상 코덱은 반드시 **H.264**(H.265/HEVC는 브라우저에서 화면 검게 나옴) — 프로그램 시작 시 자동 코덱점검 있음.
- 학생 음성 녹음 임시저장 — **행사 종료 후 로컬(outputs)+Drive 저장물 모두 수동 삭제 필요.**
- 아이패드(사파리)는 마이크 호환 문제 있어 권장 안 함 — 노트북 또는 안드로이드 태블릿 권장.

## 다음 단계 (사용자 요청 시 진행)
"프론트 백엔드 전부 풀스택으로 100점 만점으로" — GitHub 업로드는 완료됐음(edutogether 조직 등록·포탈 카드 추가는 미확인, 필요 시 팀장에게 확인). 처음 코드 감사는 `COMMON_STANDARDS.md` §4-1(2026-08-25 갱신: 모호한 "~점 근처" 표현 금지, 결함 근거 기반 감점, 수정 완료 시 정확히 100점) 기준 최대강도(실행+실측 포함)로 한 번에 진행할 것.

## 자율 권한
`.claude/settings.json` = `bypassPermissions`. push/배포/프리즈태그까지 전부 자율 진행, 완료 후 팀장에게 결과만 보고(코디세이만 예외).
