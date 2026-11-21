# RUNBOOK — Voice Cinema

> 이 저장소에서 되풀이하는 일을 **그대로 따라 하면 끝나는 순서**로 적는다. 명령은 복사해서 바로 돌릴 수 있게 쓰고,
> 단계마다 «됐는지 확인하는 법»을 붙인다. 무엇을 지켜야 하는지는 `_docs/RULES.md`, 함정이 생긴 사연은
> `.claude/rules/app.md`에 있다 — 이 문서는 «어떻게 하나»만 다룬다(원본 양식: `D:\Projects\_shared\doc-kit\`).
> 일을 시작할 때 그 일의 절을 열고, 첫 진행 설명과 완료 보고에 «읽은 것: RUNBOOK §1»을 적는다.
> 검사기는 자잘하게 고치는 동안 돌리지 않는다 — 한 덩어리가 끝나면 «이제 검사기를 한 번에 돌리겠습니다»라고 알리고 한 번 돌린다.
>
> 2026-11-22 처음 모았다 — `AGENTS.md` · `.claude/rules/app.md` · `_docs/CHANGELOG.md`에 이미 있는 명령을 절로 옮겼다. 저장소 폴더는 `D:\Projects\inky-festival\voice-cinema`.

## 목차

| 일 | 언제 하나 | 절 |
|---|---|---|
| 개발 서버 · 빌드 | 화면을 고치는 동안 | §1 |
| 시험(린트 · 유닛 · E2E) | 한 덩어리를 끝냈을 때 | §2 |
| 장면(완성본) 영상 바꿔 넣기 | 팀장이 통과본을 줄 때 | §3 |
| 배포(변경 → 라이브) | 승인받은 변경을 내보낼 때 | §4 |
| 배포 뒤 라이브 확인 | 배포가 끝난 직후 | §5 |
| 배포 대조 수동 실행 | 라이브가 master와 다른지 볼 때 | §6 |
| 의존성 · Node · 고정 액션 올리기 | 정기 최신화 지시가 올 때 | §7 |
| 서버 기록 · Storage 확인 | 업로드 · 메일 · 메모리를 볼 때 | §8 |
| 의견 · 메일 대기 정리 | 의견 · 메일 데이터를 내보내거나 지울 때 | §9 |
| 설치 파일(설치판) 바꿔 공개 | 설치판 새 판을 낼 때 | §10 |
| 일이 끝나면 남길 기록 | 모든 일의 마지막 | §11 |

## 1. 개발 서버 · 빌드

- **언제**: 화면(`src/`)을 고치며 눈으로 볼 때
- **시작 전에 읽을 규칙**: `RULES.md` R-2 · R-13 · R-14 · R-62(화면 요소 · 휴대폰 · CSS 단위)
- **순서**
  1. `npm run dev` → **확인**: http://localhost:4321 이 열린다(포트 4321을 다른 개발 서버가 잡고 있으면 E2E가 가짜로 전부 실패한다)
  2. `npm run build`(`tsc --noEmit` + `vite build` → `dist/`) → **확인**: 종료 코드 0, `dist/assets/main-<해시>.js`가 생긴다
  3. 휴대폰 화면은 «실제 브라우저 높이»(390×664 · 360×640 등)로 흉내 낸다 → **확인**: 첫 화면이 한 화면에 든다
- **끝나면 남길 것**: 새로 겪은 함정은 그 자리에서 `app.md`에
- **막히면**: 서버가 안 뜨면 포트 4321부터 본다. 그 밖은 팀장에게 한 줄

## 2. 시험(린트 · 유닛 · E2E)

- **언제**: 한 덩어리를 끝냈을 때 한 번(자잘하게 고치는 동안은 고친 그 자리만 연다)
- **시작 전에 읽을 규칙**: `RULES.md` 그 일에 걸린 줄 전부(검사 칸의 시험 이름이 곧 목록)
- **순서**
  1. `npm ci` · `cd functions && npm ci` → **확인**: 취약점 0건(`npm audit` 루트 · functions)
  2. `npm run lint` → **확인**: 오류 0
  3. `npm test > <작업 폴더>/test.txt` → **확인**: 파일의 `Tests` 줄(루트 + functions 두 줄)이 모두 통과. 출력을 걸러 보지 말고 파일로 받는다
  4. `npm run test:e2e > <작업 폴더>/e2e.txt` → **확인**: 끝 줄의 `passed` · `failed` · `skipped`. 약 23분이고 두 벌을 겹쳐 돌리지 않는다(4321 서버에 붙는다)
  5. 실패가 병렬 부하 때문인지 보려면 그 시험만 다시: `npx playwright test e2e/<파일>.spec.js:<줄> --workers 2` → **확인**: 단독 통과면 흔들린 검사로 `app.md`의 «흔들린 검사 기록»에 남기고, 단독에서도 실패하면 코드 결함으로 다룬다
- **끝나면 남길 것**: 보고에 «유닛 루트 N · functions N · E2E 통과 N · 건너뜀 N · 실패 N»(개수는 문서에 박지 않는다)
- **막히면**: 8개가 전부 실패하면 포트 4321 · Playwright 브라우저 설치(`npx playwright install chromium`)부터

## 3. 장면(완성본) 영상 바꿔 넣기

- **언제**: 팀장이 통과본 영상(Bumm님 통과)을 넘길 때
- **시작 전에 읽을 규칙**: `RULES.md` R-18 · R-20 · R-21 · R-37 · R-42 · R-43 · R-45 · R-46 · R-47
- **순서**
  1. `node tools/build-scene.mjs <장르> --film <완성본.mp4> --pause <멈춤초>` → **확인**: 원판 · 합성용 원판 · 미리보기 · 정지 · 썸네일이 `public/clips`에 생기고, 합성용 원판이 업로드 한도(20MiB) 아래(약 17MB 이하)
  2. 로고만 바꿀 때는 `node tools/build-scene.mjs <장르> --final --pause <그 장르 멈춤>` → **확인**: 합성용 원판만 다시 만들어지고 녹음실 원판 · 미리보기는 그대로
  3. 자막은 원판 소리에서 다시 재어 `src/genres.ts`의 `say('대사', 시작, 끝)`을 고친다(눈대중 금지) → **확인**: `test/scene-clips.test.js` 통과(길이가 박혀 있지 않은지 · 미리보기 끝 · 목소리 칸 · 마지막 자막 뒤)
  4. 한 덩어리가 끝나면 §2를 돌린다 → **확인**: E2E 중 `dubbing-flow` 「장르마다 다른 길이 · 멈춤 시각」통과
- **끝나면 남길 것**: `_docs/CHANGELOG.md` 한 줄, 판타지를 다시 만들면 목소리 옮기기도 다시(`_docs/archive/2026-11-16-fantasy-voice-shift/`)
- **막히면**: 장면 영상이 바뀌면 화면 캐시(장면 영상 약 6MB/장르)가 새로 받아진다 — 배포 전에 팀장에게 알린다

## 4. 배포(변경 → 라이브)

- **언제**: 팀장이 «배포 승인»을 전달한 뒤(승인 전에는 master에 합치지 않는다)
- **시작 전에 읽을 규칙**: `RULES.md` R-3 · R-4 · R-5 · R-6
- **순서**
  1. 동결 태그: `git tag -a voice-cinema-freeze-<날짜>-<이름> -m "…" && git push origin <태그>` → **확인**: `git tag`에 보인다
  2. 가지에 올리고 PR: `git checkout -b <가지> && git push -u origin <가지>` 후 `gh pr create --base master …`(PR은 기록용) → **확인**: PR의 CI(유닛 · E2E 약 1시간 · CodeQL)가 모두 초록. `gh pr checks <번호>`
  3. 화면 산출물이 바뀌는지 적는다(번들 해시 `main-<해시>.js` 비교) → **확인**: 승인 요청에 «화면 산출물 변경 여부»가 들어 있다
  4. 팀장 승인 뒤 병합: `gh pr merge <번호> --merge` → **확인**: master CI → `Deploy Backend`가 자동으로 나간다(`gh run list --branch master`). 문서만 바뀐 커밋은 배포를 건너뛴다
- **끝나면 남길 것**: §5 확인 후 `_docs/CHANGELOG.md` 한 줄(라이브 커밋 · 캐시 이름)
- **막히면**: CI가 빨간 동안은 배포가 안 나간다. 로컬 `firebase deploy`로 우회하지 않는다 — 어쩔 수 없이 로컬로 올렸으면 그 커밋을 곧바로 master에 push한다(R-6)

## 5. 배포 뒤 라이브 확인

- **언제**: `Deploy Backend`가 성공한 직후
- **시작 전에 읽을 규칙**: `RULES.md` R-6 · R-57 · R-67
- **순서**
  1. `curl -s https://voice.edutogether.kr/version.json` → **확인**: `commit`이 방금 병합한 master 끝(`git rev-parse HEAD`)과 같다
  2. `curl -s https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/` → **확인**: `commit`이 같은 값
  3. `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Origin: https://voice.edutogether.kr" -H "Content-Type: application/json" -d '{}' <함수 주소>/upload` → **확인**: 403(인증 없이). 같은 주소에 `-X OPTIONS -H "Access-Control-Request-Method: POST"` → 204. 실제 업로드는 일으키지 않는다
  4. `gcloud run services describe voicecinema --region asia-northeast3 --project inky-voice-cinema --account=edutogether2015@gmail.com --format="value(metadata.labels,spec.template.metadata.annotations)"` → **확인**: 런타임이 `nodejs24`
  5. 세션 브라우저(내부 브라우저)로 정본 주소를 열어 콘솔 오류 0 · 화면 번들 이름 확인. 화면이 바뀐 배포는 배포 전에 옛 화면을 한 번 열어 두었다가 배포 뒤 다시 열어, 새 서비스워커가 옛 화면 캐시를 지우고 새 캐시를 채우며 엔진 캐시 이름은 그대로인지 `caches.keys()`로 본다
- **끝나면 남길 것**: `_docs/CHANGELOG.md`에 «라이브 = `<커밋>`» 한 줄
- **막히면**: 새 화면이 안 보이면 배포 실패로 오인하지 말고 서비스워커 캐시(비공개 탭 · 새 탭)부터. `curl -sD- https://voice.edutogether.kr/ -o /dev/null | grep -i cache-control`로 서버 원본을 본다

## 6. 배포 대조 수동 실행

- **언제**: 라이브가 master와 같은지 확인하고 싶을 때(예약 실행은 몇 시간씩 늦다)
- **시작 전에 읽을 규칙**: `RULES.md` R-6
- **순서**
  1. 판정만: `gh workflow run deploy.yml --ref master -f dry_run=true` → **확인**: 실행 로그 판정 단계 두 줄이 «라이브가 이미 이 커밋 → 건너뜀»
  2. 다르면 다시 올리기: `gh workflow run deploy.yml --ref master -f dry_run=false` → **확인**: master 끝의 CI가 초록이 아니면 수동 실행도 건너뛴다(기다린다)
  3. 가정 시험: `-f dry_run=true -f pretend_live=<40자리 커밋>` → **확인**: «배포했을 것», deploy 잡은 skipped
- **끝나면 남길 것**: 이상이 있었으면 `_docs/CHANGELOG.md` · `app.md` «배포 대조»
- **막히면**: 예약 실행이 끊겼는지는 `gh run list --workflow "Deploy Backend" --event schedule`

## 7. 의존성 · Node · 고정 액션 올리기

- **언제**: 팀장이 «안정된 최신판으로 올려라»를 전달할 때(COMMON_STANDARDS §36)
- **시작 전에 읽을 규칙**: `RULES.md` R-7 · R-8 · R-9 · R-3 · R-5
- **순서**
  1. 프리즈 태그 → 가지 만들기(§4 1~2단계의 앞부분)
  2. `npm outdated`(루트) · `cd functions && npm outdated` → **확인**: 올릴 목록. `npm update`는 범위 안에서 잠금 파일만 바꾼다
  3. 고정 액션(SHA)은 `gh api repos/<소유자/이름>/releases/latest -q .tag_name`과 `gh api repos/<…>/git/ref/tags/<태그> -q .object.sha`로 새 SHA를 얻어 `.github/workflows/*.yml`의 `uses:` 줄과 `# vX.Y.Z` 주석을 함께 바꾼다
  4. firebase-tools 판은 `npm view firebase-tools version` 후 `deploy.yml` 세 줄 · `app.md` · `AGENTS.md`를 같은 판으로 → **확인**: `test/contract.test.js` 통과(세 줄이 같은 판)
  5. Node: `ci.yml` · `deploy.yml`의 `node-version`, 루트 `engines.node`, `functions/package.json`의 `engines.node`(Cloud Functions 정식 최신판)를 맞춘다
  6. §2를 돌린다 → §4로 PR · 승인 · 병합 → §5 확인
- **끝나면 남길 것**: `_docs/CHANGELOG.md` 한 절(올린 목록 · 태그 · 화면 산출물 변경 여부). 이 PC의 이전 판 임시 환경(`tmp/…`)은 휴지통으로(영구 삭제 금지)
- **막히면**: `npm audit fix --force`는 쓰지 않는다. 올릴 수 없는 것은 이유와 함께 팀장에게 보고

## 8. 서버 기록 · Storage 확인

- **언제**: 업로드 실패 · 메모리 · 메일을 확인할 때, 또는 R-57의 «첫 큰 업로드 확인»
- **시작 전에 읽을 규칙**: `RULES.md` R-50 · R-57 · R-60
- **순서**
  1. 함수 기록: `npx firebase-tools@<판> functions:log --only voiceCinema --json`(이 저장소 폴더 안에서, 판은 `deploy.yml`의 것) → **확인**: 이름 · 메일 주소 · 키가 기록에 없다
  2. 메모리: `gcloud logging read 'resource.labels.service_name="voicecinema" AND textPayload:"Memory limit"' --project inky-voice-cinema --account=edutogether2015@gmail.com --freshness=1d` → **확인**: 0건
  3. 업로드 크기: 업로드 성공 줄 `[upload:…] 성공: … (N바이트)`의 바이트만 읽는다(저장 이름은 공개 주소라 보고에 옮기지 않는다)
  4. Storage: `gcloud storage ls gs://inky-voice-cinema.firebasestorage.app/dubs/ --account=edutogether2015@gmail.com`(기본 계정은 403) → **확인**: 안을 보기 전에는 «삭제하자»고 올리지 않는다
  5. 예약 작업: `gcloud scheduler jobs list --location asia-northeast3 --project inky-voice-cinema --account=edutogether2015@gmail.com` → **확인**: `cleanupAfterCutoff` · `feedbackMaintenance` · `keepWarm` ENABLED
- **끝나면 남길 것**: 확인 결과를 `app.md`의 해당 대기 줄에(🟢로 바꿈)
- **막히면**: gcloud 기본 계정을 바꾸지 않고 명령마다 `--account`를 붙인다

## 9. 의견 · 메일 대기 정리

- **언제**: 받은 의견을 내보내거나 지울 때(의견은 90일 지나면 예약 함수가 지운다)
- **시작 전에 읽을 규칙**: `RULES.md` R-50 · R-51
- **순서**
  1. `node tools/feedback-export.mjs export <저장소 밖 폴더>`(CSV · JSON) → **확인**: 결과 폴더가 저장소 안이 아니다. 내용 · 이름은 보고에 옮기지 않고 건수와 날짜만
  2. 지울 때: `node tools/feedback-export.mjs delete <그 json> --confirm` → **확인**: 그 json에 적힌 문서만 지워진다
  3. 메일 대기는 사이트 데이터(IndexedDB `voice-cinema-mail`)에 있고 2026-12-01 00:00(KST) 뒤 처음 열 때 저절로 지워진다 → **확인**: `e2e/web-mail.spec.js`의 1초 전 · 그 시각 시험
- **끝나면 남길 것**: 건수 · 날짜만 `_docs/CHANGELOG.md`
- **막히면**: 카카오 연결이 필요하면 Bumm님 계정으로 먼저 연결(먼저 연결한 계정이 받는다) — 콘솔 작업은 Bumm님이 직접

## 10. 설치 파일(설치판) 바꿔 공개

- **언제**: 설치판 새 판(`feat/vc-desktop-mail` 가지)을 공개할 때. 설치판 시험은 창이 뜨므로 RDP 접속 중이 아닐 때 · 아래 모니터에서만 한다
- **시작 전에 읽을 규칙**: `RULES.md` R-53
- **순서**
  1. 새 exe가 §2 계열 설치판 시험(9번 · 13개 전부)을 통과했는지 확인한다 → **확인**: 통과 기록
  2. 먼저 파일부터 올린다: `gcloud storage cp <exe> gs://inky-voice-cinema-download/VoiceCinema-Setup.exe --content-type=application/vnd.microsoft.portable-executable --content-disposition='attachment; filename="Voice Cinema Setup.exe"' --cache-control=no-cache --predefined-acl=publicRead --account=edutogether2015@gmail.com` → **확인**: `--predefined-acl=publicRead`가 있어야 한다(없으면 403)
  3. 라이브 링크: 첫 화면 아이콘의 `/…` 302 → 200(attachment) · 받은 파일 해시 같음 · 버킷 목록 익명 403
- **끝나면 남길 것**: `app.md`의 «지금 공개 파일은 …» 줄(판 · 해시 · 시각), `_docs/CHANGELOG.md`
- **막히면**: 버킷에 `allUsers`를 주지 않는다. 파일을 올리기 전에 아이콘을 배포하지 않는다(그 사이 아이콘이 403)

## 11. 일이 끝나면 남길 기록

- **언제**: 모든 일의 마지막
- **순서**
  1. `_docs/CHANGELOG.md` 맨 위에 한 줄 또는 한 절(날짜 · 지시 · 무엇을 · 확인한 것)
  2. 새로 겪은 함정은 그 자리에서 `.claude/rules/app.md`에, Bumm님이 새로 정하거나 바로잡은 것은 들은 자리에서 `_docs/RULES.md`에 한 줄 → **확인**: 번호 · 날짜 · 원문 · 검사 칸이 비어 있지 않다
  3. 완료 보고에 «읽은 것: RULES R-n · RUNBOOK §n» · «규칙 N개 중 N개 통과 · 빨간불 시험 함 · 직접 열어 본 것 N건» 한 번

## 따로 있는 상세 런북

- `_docs/ops/HANDOFF_CURRENT.md` — 지금 담당 · 최신 승인 · 인계 원장(§10 남은 것)
- `_docs/ops/print/operator-manual.html` — 행사 운영자 설명서(개장 전 · 장애 대응)
- `_docs/ops/rollback-20261016.md` · `rollback-20261025.md` — 되돌리기 기록
