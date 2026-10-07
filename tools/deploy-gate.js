// 배포 판정 — .github/workflows/deploy.yml의 changes 잡이 부른다(2026-10-08).
//
// 판단만 여기서 하고, git·gh로 값을 모으는 일은 워크플로가 한다. 그래야 판단을 단위 검사로
// 고정할 수 있다(test/deploy-gate.test.js). 규칙은 순서대로:
//
// 1. 이 실행의 커밋이 **지금 master 끝이 아니면 배포하지 않는다.** GitHub 장애로 대기열에 묶인
//    옛 실행이 나중에 풀리면, 더 오래된 커밋을 새 배포 위에 덮어쓴다(2026-10-07 실제로 묶였다).
//    끝 커밋의 배포가 앞 커밋들의 변경까지 함께 싣고 나가므로 건너뛰어도 빠지는 것이 없다.
// 2. master 끝을 **확인하지 못하면 실패로 끝낸다** — 판정을 못 한 것을 "건너뜀"으로 세면 진짜
//    배포가 조용히 안 나간다. 사람이 보게 멈춘다.
// 3. 비교 기준(마지막으로 **deploy 잡이 실제로 성공한** 커밋)이 없으면 배포한다.
// 4. 비교 결과가 0건이면 "비교가 안 됐다"로 보고 배포한다(§21-1).
// 5. 문서(.md·_docs/·.claude/)만 바뀌었으면 배포하지 않는다(COMMON_STANDARDS §23).
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const DOCS_ONLY = /(\.md$|^_docs\/|^\.claude\/)/;

export function decideDeploy({ now, tip, last, changed = [] }) {
  if (!SHA.test(now || '')) throw new Error(`이 실행의 커밋을 알 수 없다(${now || '빈 값'}) — 판정할 수 없어 멈춘다`);
  if (!SHA.test(tip || '')) throw new Error(`master 끝 커밋을 확인하지 못했다(${tip || '빈 값'}) — 판정할 수 없어 멈춘다`);
  if (tip !== now) {
    return {
      deploy: false,
      reason: `이 실행의 커밋(${now.slice(0, 7)})은 지금 master 끝(${tip.slice(0, 7)})이 아니다 — 더 새 커밋의 배포가 맡으므로 배포하지 않는다`,
    };
  }
  if (!last) return { deploy: true, reason: '기준이 될 배포 이력이 없다 — 배포한다' };
  const files = changed.filter(Boolean);
  if (files.length === 0) return { deploy: true, reason: '비교 결과가 0건이라 판정을 신뢰할 수 없다 — 배포한다' };
  const targets = files.filter((f) => !DOCS_ONLY.test(f));
  if (targets.length === 0) return { deploy: false, reason: `문서만 바뀌었다(${files.length}개) — 배포하지 않는다` };
  return { deploy: true, reason: `배포가 필요한 변경 ${targets.length}개:\n${targets.map((f) => '  ' + f).join('\n')}` };
}

// 워크플로에서 `node tools/deploy-gate.js`로 부른다. 값은 환경변수로 받는다.
function main() {
  const { NOW, TIP, LAST, CHANGED = '', GITHUB_OUTPUT } = process.env;
  try {
    const r = decideDeploy({ now: NOW, tip: TIP, last: LAST, changed: CHANGED.split('\n') });
    console.log(`기준 ${LAST ? LAST.slice(0, 7) : '없음'} → ${NOW.slice(0, 7)} (master 끝 ${TIP.slice(0, 7)})`);
    console.log(r.reason);
    if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `deploy_needed=${r.deploy}\n`);
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
