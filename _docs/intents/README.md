<!-- 원본 최종 수정: 2026-09-08 · 원본 위치: D:\Projects\_shared\intent-kit\README-template.md
     원본 버전: 4ba3836d6f82
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
| 2026-09-09 | [domain-migration](2026-09-09-domain-migration/intent.md) | 2 | draft | 정본 주소를 `voice-cinema.web.app`에서 `voice.edutogether.kr`로 이전 |

## 폴더 규칙

- 새 intent: `_docs/intents/YYYY-MM-DD-슬러그/intent.md` (TEMPLATE.md 복사해서 시작)
- 초기 개발 단계(기능이 아직 잡히는 중)라 건별 intent보다 전체 방향 문서가 더
  맞으면, 건별 대신 `_docs/intents/00-charter.md` 하나로 시작해도 된다.
- 상태는 `draft` → `accepted` → `in-progress` → `done` | `dropped` 이고, 파일 맨 위
  frontmatter 의 `status` 로만 관리한다(폴더를 옮겨서 표시하지 않는다).
  상태를 바꾸는 것은 Bumm님이고, 바뀔 때마다 별도 커밋으로 남긴다.
- `done`/`dropped` 상태가 된 intent도 지우지 않는다 — 나중에 "왜 그때 이렇게
  안 했는지"를 다시 확인할 수 있는 유일한 기록이다.
