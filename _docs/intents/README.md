<!-- 원본 최종 수정: 2026-09-08 · 원본 위치: D:\Projects\_shared\intent-kit\README-template.md
     원본 버전: eb0eda204b4e
     사본의 "원본 버전"이 위와 다르면 원본이 갱신된 것이다. 다만 이 파일은 통째로 덮어쓰지 않는다 —
     아래 인덱스 표는 저장소마다 내용이 다르므로 반드시 보존하고, 등급표·설명 등 나머지만 원본에 맞춘다.
     (intent-workflow.md·TEMPLATE.md는 순수 사본이라 통째로 재복사하면 된다.)
     이 스탬프 블록은 사본에도 남긴다 — 지우면 그 저장소만 드리프트를 감지할 수 없게 된다. -->
# Intent 문서

이 폴더는 이 저장소에서 진행한(또는 진행 중인) 의미 있는 작업 하나하나가
"왜" 필요했는지, 뭘 원했는지, 어떤 제약 안에서 했는지를 기록한다. 규칙 원본은
`.claude/rules/intent-workflow.md` 참고.

> **이 저장소에서 주의**: 이 폴더는 반드시 `_docs/` 아래에 둔다. `public/`에 두면
> 빌드가 `dist/`(배포 폴더)로 그대로 복사해 라이브 사이트에 공개된다. 2026-09-08
> 리액트 전환 전에는 `docs/`가 곧 배포 폴더여서 같은 함정이 더 컸다.

## 등급 기준

| 등급 | 해당하는 것 |
|---|---|
| 0 | 오탈자, 명백한 버그 수정, 이미 확정된 결정의 재확인·재적용 — intent 문서 없이 진행 |
| 1 | 여러 파일/화면에 걸치거나 되돌리기가 약간 번거로운 작업 — 간단한 intent.md |
| 2 | 사용자 데이터·과금·보안·배포·실사용자 경험에 영향, 되돌리기 어려운 작업 — 전체 intent.md, 미결 질문은 멈추고 확인 |

## 인덱스

| 날짜 | 슬러그 | 등급 | 상태 | 요약 |
|---|---|---|---|---|
| 2026-09-08 | [react-typescript-migration](2026-09-08-react-typescript-migration/intent.md) | 2 | done | 프론트를 바닐라 JS에서 Vite+React+TypeScript로 다시 짜고, 전후 화면을 기계 대조해 동일함을 증명 (**사후 작성**) |
| 2026-09-09 | [domain-migration](2026-09-09-domain-migration/intent.md) | 2 | done | 정본 주소를 `voice-cinema.web.app`에서 `voice.edutogether.kr`로 이전 |
| 2026-10-08 | [deploy-reconcile](2026-10-08-deploy-reconcile/intent.md) | 2 | done | 예약 실행으로 라이브 배포 커밋을 master 끝과 대조해 뒤처졌으면 다시 배포 — 묶인 옛 실행 대비 (**사후 작성**) |
| 2026-10-08 | [drama-scenes](2026-10-08-drama-scenes/intent.md) | 2 | dropped | 장면 더빙 2.0 첫 기획(6장르) — 10/11 대표님 재구성으로 대체. 소리·크레딧 단가·관문 결정은 이어 쓴다 |
| 2026-10-11 | [scene-homage](2026-10-11-scene-homage/intent.md) | 2 | in-progress | 장면 더빙 2.0 다시 짜기 — 8장르 명장면 오마주, 장르마다 10초 한 편(5.0초 멈춤·녹음 3.5초 = 목소리 칸, 완성본 정확히 10.0초). 그림·크레딧 0 |
| 2026-10-23 | [responsive-fit](2026-10-23-responsive-fit/intent.md) | 2 | in-progress | 해상도별 화면 맞춤 — 기준 화면(PC 1366 · 태블릿 1024/768 · 휴대폰 390)을 통째로 비율 조정, 자동 조사 150화면 0건 (**작업 시작 뒤 작성**) |
| 2026-10-24 | [wifi-speed](2026-10-24-wifi-speed/intent.md) | 2 | in-progress | 와이파이에서 느림 — 화질 그대로, 엔진 두 번 받기 없애고 화면에 필요한 것 먼저(엔진 · 원판은 뒤에서), App Check 상한 |
| 2026-10-24 | [recording-hardening](2026-10-24-recording-hardening/intent.md) | 2 | in-progress | 녹음·합성 품질 보강 — 녹음 3초(말이 이어지면 3.5초)·녹음기 켜진 뒤 신호·무음/끊김 감지·섞은 뒤 리미터·미리 듣기 = 완성본 소리 (**작업 전 의도는 Bumm님 지시문, 이 문서는 작업 중 작성**) |
| 2026-11-07 | [studio-autoplay](2026-11-07-studio-autoplay/intent.md) | 2 | done | 녹음실에 들어가면 장면이 멈춤·3·2·1 없이 소리와 함께 한 번 흐르고 대사 구간에 문구만 나온다(Bumm님 11/7, 10/01 «진입 자동재생 금지»를 바꿈) |
| 2026-11-07 | [pc-fit](2026-11-07-pc-fit/intent.md) | 2 | done | PC 웹 — 큰 창에서 통째로 커지는 것(키우지 않기) · 메인 영상 위아래 잘림(16:9 그대로) · 스플래시를 Poster Studio와 같게. responsive-fit의 PC 부분을 대신한다 |
| 2026-11-07 | [res-all](2026-11-07-res-all/intent.md) | 2 | done | 모든 해상도 · 설치판 2차 — 2560 화면을 기준으로 휴대폰 · 패드 · PC · 설치판을 맞추고 전체 크기를 자동으로 잰다. 화면 문구 표, 합성 오류 원문 빼기, 엔진 캐시 분리를 함께 낸다 |
| 2026-11-08 | [web-offline-mail](2026-11-08-web-offline-mail/intent.md) | 2 | done | 웹(크롬)에서도 끊기면 인솔 선생님 메일 칸 — 영상은 그 크롬의 IndexedDB에 맡기고 인터넷이 돌아오면 올리고 메일을 보낸 뒤 지운다(Bumm님 11/8 ⭐). 실제 발송에서 App Check 다시 받기 · `/mail` 주소 검사 결함을 찾아 고쳤다 |
| 2026-11-08 | [field-feedback](2026-11-08-field-feedback/intent.md) | 2 | in-progress | 웹 첫 화면 «의견 보내기»를 Poster Studio와 똑같이 — 이름 · 의견 · 판 번호 · 화면 크기 · 기기 · 단계를 Firestore에 저장하고 Bumm님 카카오톡으로 알린다, 90일 자동 삭제 · 내보내기 도구, 2026-11-14 00:00(KST)에 배포 없이 빠진다 |
| 2026-11-09 | [save-flow-by-device](2026-11-09-save-flow-by-device/intent.md) | 2 | done | 저장 화면 흐름을 기기별로 — 노트북(크롬 · 설치판)은 장애 때 담임교사 메일 칸, «이 기기에 저장»은 휴대폰만, 모든 장애 화면에 «다시 제작하기»(Bumm님 11/8 Q1) |
| 2026-11-09 | [keep-warm](2026-11-09-keep-warm/intent.md) | 1 | done | 행사 주간 서버 예열 — 11/9~11/14 9~18시 5분마다 GET /, 11/15부터는 부르지 않음, 최소 인스턴스 없이(Bumm님 11/9, Poster Studio와 같은 방식) |
| 2026-11-09 | [end-screens-and-wait](2026-11-09-end-screens-and-wait/intent.md) | 2 | done | 무음 녹음도 끝까지 흐르고 저장 · «다른 더빙하기»는 모든 끝 화면에서 빨간 주 단추 · 저장 대기 화면은 Poster Studio 로딩 화면 그대로(영상 12편 · 문구) · 재생 중인 대기 영상은 끝까지 · 녹음실 받는 중 퍼센트(Bumm님 11/9) |

## 폴더 규칙

- 새 intent: `_docs/intents/YYYY-MM-DD-슬러그/intent.md` (TEMPLATE.md 복사해서 시작)
- 초기 개발 단계(기능이 아직 잡히는 중)라 건별 intent보다 전체 방향 문서가 더
  맞으면, 건별 대신 `_docs/intents/00-charter.md` 하나로 시작해도 된다.
- 상태는 `draft` → `accepted` → `in-progress` → `done` | `dropped` 이고, 파일 맨 위
  frontmatter 의 `status` 로만 관리한다(폴더를 옮겨서 표시하지 않는다).
  상태를 바꾸는 것은 Bumm님이고, 바뀔 때마다 별도 커밋으로 남긴다.
  단, **팀장이 지시한 작업은 그 지시 자체가 승인**이므로(헌법 §1), 세션이 `accepted`로
  쓰고 바로 `in-progress`로 진행한다 — 기다리지 않는다. 위 규칙은 **세션이 스스로
  제안한 건**에 적용된다. 자세한 것은 `intent-workflow.md`의 “상태” 절을 본다.
- `done`/`dropped` 상태가 된 intent도 지우지 않는다 — 나중에 "왜 그때 이렇게
  안 했는지"를 다시 확인할 수 있는 유일한 기록이다.
