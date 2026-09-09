# InKY Voice Cinema (잉키 보이스 시네마)

제4회 인천어린이청소년영화제(InKY Festival, 2026-11-14, 인천 CGV) "InKY 놀이터" 부스 프로그램.
학생이 무성 영상 6종(장르별) 중 하나를 골라 자기 목소리로 더빙하면, **브라우저 안에서** 영상과
음성을 합쳐 완성본 mp4를 만들고 클라우드에 저장한 뒤 QR로 전달한다.

- **라이브**: https://voice.edutogether.kr (옛 주소 https://voice-cinema.web.app 도 같은 사이트로 계속 살아 있다)
- **백엔드**: Firebase Functions + Storage (`inky-voice-cinema` 프로젝트, `asia-northeast3`)
- **프론트**: Vite + React + TypeScript (2026-09-08 전환)
- **합성 엔진**: ffmpeg.wasm — 서버가 아니라 학생 브라우저에서 처리한다

## 저장소 구조

| 경로 | 내용 |
|---|---|
| `src/` | 앱 소스(React + TypeScript). 화면 컴포넌트, 훅, ffmpeg·업로드 라이브러리 |
| `public/` | 번들러가 건드리지 않고 그대로 복사되는 자산 — `clips/`(장르 영상 6종), `vendor/`(ffmpeg 엔진·qrcode·App Check 번들) |
| `tools/` | 빌드 도구 — 서비스워커 프리캐시 목록을 산출물에서 자동 생성하는 Vite 플러그인, 서비스워커 원본, 폰트 서브셋 플러그인 |
| `fonts/` | Pretendard 원본 woff2와 라이선스. **배포되지 않는다** — 빌드가 화면에 나올 글자만 남겨 `dist/fonts/`로 내보낸다(3.9MB → 328KB) |
| `dist/` | 빌드 산출물 **겸 Firebase Hosting 배포 폴더**(`firebase.json`의 `public`). 저장소에 커밋하지 않는다 |
| `functions/` | Cloud Functions — 업로드 검증·저장(`voiceCinema`), 기한 후 자동 삭제(`cleanupAfterCutoff`). 루트와 별개인 독립 npm 패키지 |
| `e2e/` | Playwright 실사용 흐름 테스트 — 녹음→합성→업로드→QR/폴백, 오프라인 부팅, 새 배포가 기기에 바로 반영되는지, 모바일 카드 재생·강조, 스플래시 |
| `test/` | 클라이언트·서버가 같은 값을 쓰는지 강제하는 계약 테스트 |
| `_docs/` | 내부 문서 — 배포되지 않는다. `_docs/CHANGELOG.md`(날짜별 이력), `_docs/intents/`, `_docs/ops/`(부스 운영 자료·현장 인쇄물), `_docs/archive/`(끝났지만 근거로 남기는 것) |

> **부스 운영 자료(설치·운영 설명서, 부스 게시물 PDF)는 [`_docs/ops/`](_docs/ops/)에 있다.**
> 행사 당일 현장에서 필요한 인쇄물·설명서가 여기 들어있다.

## 명령

```bash
npm run dev       # 개발 서버 (http://localhost:4321)
npm run build     # 타입 검사 + 프로덕션 빌드 → dist/
npm test          # 유닛 테스트 (루트 + functions, vitest)
npm run lint      # eslint
npm run test:e2e  # Playwright E2E (최초 1회 npx playwright install chromium 필요)
```

배포는 `master` push → GitHub Actions(CI 통과 시 자동으로 빌드·Functions·Storage·Hosting 배포).

작업 규칙은 [CLAUDE.md](CLAUDE.md)(사람·Claude 공용 상세 이력)와 [AGENTS.md](AGENTS.md)(도구 공용 요약)를 참고.

## 개인정보

학생 음성이 담긴 완성본은 Firebase Storage의 `dubs/` 아래 공개 URL로 저장되며, **2026-12-01
00:00(KST)에 예약 함수가 전부 삭제**한다("다운로드는 11월 안에만 가능" 정책). 이 시각은 방침 문구와
반드시 같아야 하며 `test/contract.test.js`가 두 값을 대조한다. 자세한 내용은
[privacy.html](privacy.html).
