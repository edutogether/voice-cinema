// 배포 판정 — .github/workflows/deploy.yml의 changes 잡이 부른다(2026-10-08).
//
// 판단만 여기서 하고, git·gh·라이브 주소로 값을 모으는 일은 워크플로가 한다. 그래야 판단을 단위 검사로
// 고정할 수 있다(test/deploy-gate.test.js). 워크플로는 두 가지로 돈다:
//
// - CI가 master push에서 통과했을 때(workflow_run) — 이 실행의 커밋(now)은 그 CI의 커밋
// - 매시 대조(schedule)와 수동 실행(workflow_dispatch) — now는 지금 master 끝. 묶여 있던 옛 실행이
//   나중에 풀려 옛 커밋을 덮어썼거나 배포가 반쯤 실패했으면, 다음 대조가 master 끝을 다시 배포한다
//
// 비교 기준은 **라이브 자체**다 — 배포 잡이 Hosting(/version.json)과 Functions(GET /)에 남긴 배포 커밋.
// 실행 기록에서 "마지막으로 성공한 배포"를 찾던 방식은 매시 대조의 실행이 기록을 채워 쓸 수 없고,
// 기록 밖에서 라이브가 바뀐 것(묶여 있던 옛 실행, 로컬 배포)도 못 본다.
//
// 규칙은 순서대로:
//
// 1. 이 실행의 커밋이 **지금 master 끝이 아니면 배포하지 않는다.** 끝 커밋의 배포가 앞 커밋들의 변경까지
//    함께 싣고 나가므로 건너뛰어도 빠지는 것이 없다.
// 2. master 끝이나 그 CI 결과를 **확인하지 못하면 실패로 끝낸다** — 판정을 못 한 것을 "건너뜀"으로 세면 진짜
//    배포가 조용히 안 나간다. 사람이 보게 멈춘다.
// 3. master 끝의 CI가 통과한 상태가 아니면(아직 도는 중·실패) 배포하지 않는다 — 검사를 통과한 것만 배포한다.
// 4. 라이브 두 곳이 모두 이 커밋이면 이미 배포된 것이니 다시 배포하지 않는다(같은 push에 CI가 두 번 돈
//    2026-10-08의 중복 실행도 여기서 걸린다). 같은 커밋을 일부러 다시 배포해야 하면 빈 커밋을 하나 올린다.
// 5. 라이브 표시가 없거나 두 곳이 서로 다르면 배포한다 — 확인이 안 되는 라이브를 믿지 않는다.
// 6. 비교 결과가 0건이면 "비교가 안 됐다"로 보고 배포한다(§21-1).
// 7. 라이브 뒤로 문서(.md·_docs/·.claude/)만 바뀌었으면 배포하지 않는다(COMMON_STANDARDS §23).
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const DOCS_ONLY = /(\.md$|^_docs\/|^\.claude\/)/;
const short = (sha) => (sha ? sha.slice(0, 7) : '없음');

export function decideDeploy({ now, tip, ci, live = {}, changed = [] }) {
  if (!SHA.test(tip || '')) throw new Error(`master 끝 커밋을 확인하지 못했다(${tip || '빈 값'}) — 판정할 수 없어 멈춘다`);
  if (!SHA.test(now || '')) throw new Error(`이 실행의 커밋을 알 수 없다(${now || '빈 값'}) — 판정할 수 없어 멈춘다`);
  if (tip !== now) {
    return {
      deploy: false,
      reason: `이 실행의 커밋(${short(now)})은 지금 master 끝(${short(tip)})이 아니다 — 더 새 커밋의 배포가 맡으므로 배포하지 않는다`,
    };
  }
  if (!ci) throw new Error(`master 끝(${short(tip)})의 CI 결과를 확인하지 못했다 — 판정할 수 없어 멈춘다`);
  if (ci !== 'success') {
    return { deploy: false, reason: `master 끝(${short(tip)})의 CI가 통과한 상태가 아니다(${ci}) — 검사를 통과한 것만 배포한다` };
  }
  const hosting = SHA.test(live.hosting || '') ? live.hosting : '';
  const functions = SHA.test(live.functions || '') ? live.functions : '';
  if (hosting === now && functions === now) {
    return { deploy: false, reason: `라이브가 이미 이 커밋(${short(now)})이다(Hosting·Functions 둘 다) — 다시 배포하지 않는다` };
  }
  if (!hosting || !functions) {
    return { deploy: true, reason: `라이브의 배포 커밋 표시가 없다(Hosting ${short(hosting)} · Functions ${short(functions)}) — 배포한다` };
  }
  if (hosting !== functions) {
    return { deploy: true, reason: `라이브 두 곳의 배포 커밋이 다르다(Hosting ${short(hosting)} · Functions ${short(functions)}) — 배포한다` };
  }
  const files = changed.filter(Boolean);
  if (files.length === 0) return { deploy: true, reason: `라이브(${short(hosting)})와 비교한 결과가 0건이라 판정을 신뢰할 수 없다 — 배포한다` };
  const targets = files.filter((f) => !DOCS_ONLY.test(f));
  if (targets.length === 0) return { deploy: false, reason: `라이브(${short(hosting)}) 뒤로 문서만 바뀌었다(${files.length}개) — 배포하지 않는다` };
  return {
    deploy: true,
    reason: `라이브(${short(hosting)}) 뒤로 배포가 필요한 변경 ${targets.length}개:\n${targets.map((f) => '  ' + f).join('\n')}`,
  };
}

// 워크플로에서 `node tools/deploy-gate.js`로 부른다. 값은 환경변수로 받는다.
// DRY_RUN=true면 판정만 남기고 배포하지 않는다(수동 실행으로 "다르면 배포" 경로를 확인할 때).
function main() {
  const { NOW, TIP, CI, LIVE_HOSTING, LIVE_FUNCTIONS, CHANGED = '', DRY_RUN, GITHUB_OUTPUT } = process.env;
  try {
    const r = decideDeploy({ now: NOW, tip: TIP, ci: CI, live: { hosting: LIVE_HOSTING, functions: LIVE_FUNCTIONS }, changed: CHANGED.split('\n') });
    const go = r.deploy && DRY_RUN !== 'true';
    console.log(`라이브 Hosting ${short(LIVE_HOSTING)} · Functions ${short(LIVE_FUNCTIONS)} → 이 실행 ${short(NOW)} (master 끝 ${short(TIP)}, CI ${CI || '확인 안 함'})`);
    console.log(r.reason);
    if (r.deploy && !go) console.log('드라이런 — 실제 실행이었다면 배포했다. 이번에는 배포하지 않는다');
    if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `deploy_needed=${go}\nsha=${NOW}\n`);
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
