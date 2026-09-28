#!/usr/bin/env bash
# 앱 저장소용 SessionStart 훅 — 원본은 817beatles/projects 의 _shared/cloud/cloud-session-start.sh.
# 각 앱은 이 파일을 scripts/cloud-session-start.sh 로 복사해 두고 .claude/settings.json 의
# hooks.SessionStart 에서 부른다(_shared/CLAUDE-CLOUD.md §4). 사본을 직접 고치지 않는다 — 원본을 고치고 다시 복사한다.
#
# 하는 일 (Anthropic 클라우드 세션에서만 — 집 PC 로컬 세션에서는 첫 줄에서 바로 끝난다):
#   1) node_modules 가 없는 패키지만 `npm ci` (루트 · functions · pc-app · mobile-app 중 있는 것)
#   2) Playwright 설정이 있으면 이 저장소가 고정한 Chromium 빌드를 받는다 (이미 있으면 건너뜀)
#   3) AGENTS.md 의 «조직 공통 규칙» 절을 세션 컨텍스트에 넣는다 — 클라우드에는 D:\Projects 상위 CLAUDE.md 가 없다.
# 실패해도 세션은 뜬다(종료 코드 0). 무엇이 실패했는지는 첫 화면에 찍힌다.
set -u
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT" || exit 0

installed=() present=() failed=()
for dir in . functions pc-app mobile-app; do
  [ -f "$dir/package-lock.json" ] || continue
  if [ -d "$dir/node_modules" ]; then present+=("$dir"); continue; fi
  if npm --prefix "$dir" ci --no-audit --no-fund >/dev/null 2>&1; then installed+=("$dir"); else failed+=("$dir"); fi
done

pw="해당 없음"
if ls playwright.config.* >/dev/null 2>&1; then
  # 저장소가 고정한 @playwright/test 버전에 맞는 Chromium 빌드. 이미 있으면 바로 끝난다.
  if npx --no-install playwright install chromium >/dev/null 2>&1; then pw="준비됨"; else pw="실패 — 세션에서 'npx playwright install chromium' 을 다시 돈다"; fi
fi

echo "## 클라우드 세션 시작 점검 (scripts/cloud-session-start.sh)"
echo "- 의존성: 설치 ${installed[*]:-없음} · 이미 있음 ${present[*]:-없음} · 실패 ${failed[*]:-없음}"
echo "- Playwright Chromium: $pw"
echo "- 이 세션은 Anthropic 클라우드에서 돈다. D:\\Projects 의 상위 CLAUDE.md 가 없으므로 아래 «조직 공통 규칙»이 그 자리를 대신한다."
echo "- 클라우드에서는 코드 수정·검사·작업 가지 커밋·PR 까지만 한다. main 직접 푸시·배포·운영 데이터·콘솔 작업은 하지 않는다."
echo "- 이 앱만의 금지·함정은 .claude/rules/app.md 에 있다(자동 로드). 클라우드 세팅 원문은 817beatles/projects 의 _shared/CLAUDE-CLOUD.md."
echo
if [ -f AGENTS.md ]; then
  awk '/^## 조직 공통 규칙/{f=1} f && /^## / && !/조직 공통 규칙/{exit} f' AGENTS.md
else
  echo "🔴 AGENTS.md 가 없다 — 조직 공통 규칙을 넣지 못했다."
fi
exit 0
