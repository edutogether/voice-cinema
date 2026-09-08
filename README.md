# InKY Voice Cinema (잉키 보이스 시네마)

제4회 인천어린이청소년영화제(InKY Festival, 2026-11-14, 인천 CGV) "InKY 놀이터" 부스 프로그램.
학생이 무성 영상 6종(장르별) 중 하나를 골라 자기 목소리로 더빙하면, **브라우저 안에서** 영상과
음성을 합쳐 완성본 mp4를 만들고 클라우드에 저장한 뒤 QR로 전달한다.

- **라이브**: https://voice-cinema.web.app
- **백엔드**: Firebase Functions + Storage (`inky-voice-cinema` 프로젝트, `asia-northeast3`)
- **합성 엔진**: ffmpeg.wasm — 서버가 아니라 학생 브라우저에서 처리한다

## 저장소 구조

| 경로 | 내용 |
|---|---|
| `docs/` | 정적 프론트엔드 **겸 Firebase Hosting 배포 폴더**(`firebase.json`의 `public`). 앱 코드·클립·ffmpeg 엔진이 전부 여기 있다 |
| `functions/` | Cloud Functions — 업로드 검증·저장(`voiceCinema`), 기한 후 자동 삭제(`cleanupAfterCutoff`). 루트와 별개인 독립 npm 패키지 |
| `e2e/` | Playwright 실사용 흐름 테스트(녹음→합성→업로드→QR/폴백) |
| `test/` | 루트 유닛 테스트 |
| `_docs/` | 내부 문서 — 배포되지 않는다. `_docs/ops/`(부스 운영 자료), `_docs/CHANGELOG.md`(날짜별 이력), `_docs/intents/` |

> **부스 운영 자료(설치·운영 설명서, 부스 게시물 PDF)는 [`_docs/ops/`](_docs/ops/)에 있다.**
> 행사 당일 현장에서 필요한 인쇄물·설명서가 여기 들어있다.

> **주의**: `docs/`는 문서 폴더가 아니라 **배포되는 웹 루트**다(`firebase.json`의 `public`).
> 내부 문서를 `docs/` 아래 만들면 라이브 사이트에 그대로 공개된다 — 내부 문서는 전부 `_docs/`에 둔다.

## 명령

```bash
npm test          # 유닛 테스트 (루트 + functions, vitest)
npm run lint      # eslint
npm run test:e2e  # Playwright E2E (최초 1회 npx playwright install chromium 필요)
```

배포는 `master` push → GitHub Actions(CI 통과 시 자동으로 Functions·Storage·Hosting 배포).

작업 규칙은 [CLAUDE.md](CLAUDE.md)(사람·Claude 공용 상세 이력)와 [AGENTS.md](AGENTS.md)(도구 공용 요약)를 참고.

## 개인정보

학생 음성이 담긴 완성본은 Firebase Storage의 `dubs/` 아래 공개 URL로 저장되며, **2026-12-01부터
매일 새벽 3시(KST) 예약 함수가 전부 삭제**한다("다운로드는 11월 안에만 가능" 정책). 자세한 내용은
[docs/privacy.html](docs/privacy.html).
