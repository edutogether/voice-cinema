# CLAUDE.md — Voice Cinema (잉키 보이스 시네마)

InKY Festival(제4회 인천어린이청소년영화제, 2026.11.14. 인천 CGV) "InKY 놀이터" 6부스 중 하나. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 — 여기는 이 저장소 전용 상태/규칙만 기록한다.

## 정체성
- **위치**: `D:\Projects\inky-festival\voice-cinema`
- **스택**: Node.js(>=18) + Express, Google Apps Script(Drive 자동저장)
- **기능**: 무성영상 6종(장르별)에 더빙 → Drive 자동저장 → QR 전달
- **상태**: 온보딩 단계. 다른 사람이 만든 v1.1(출시 전 점검 반영판) 원본 코드, 아직 코드 감사(Sonnet+Opus 크로스체크) 안 함. GitHub `edutogether/voice-cinema`(public)에 업로드 완료, origin 연결됨 — 이후 커밋·push는 이 세션이 자율 진행. `clips/`(18MB 영상)·`outputs/`는 `.gitignore` 처리됨.

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
