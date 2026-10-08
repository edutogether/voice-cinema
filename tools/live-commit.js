// 라이브에 지금 배포된 커밋을 읽는다 — .github/workflows/deploy.yml이 부른다(2026-10-08).
//
// 배포 잡이 두 곳에 표시를 남긴다: Hosting은 /version.json, Functions는 GET /의 commit.
// 판정은 tools/deploy-gate.js가 하고, 여기서는 응답을 커밋 값으로 바꾸기만 한다.
//
// - 200이고 commit이 40자리 커밋이면 그 값
// - 404이거나, 200인데 commit이 없거나 형식이 다르면 빈 값("표시 없음") — 표시를 남기기 전의 배포,
//   표시를 남기지 않는 로컬 배포가 여기에 든다. 판정은 이것을 "확인 안 됨 → 다시 배포"로 센다
// - 그 밖의 응답(연결 실패·5xx 등)은 몇 번 다시 묻고, 끝내 안 되면 실패로 끝낸다 — 라이브를 못 본 것을
//   "표시 없음"으로 세면 서버가 잠깐 흔들릴 때마다 다시 배포한다. 멈추고 사람이 보게 한다
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SHA = /^[0-9a-f]{40}$/;

export function commitFromResponse(status, body) {
  if (status === 404) return '';
  if (status !== 200) throw new Error(`응답 ${status}`);
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return '';
  }
  const commit = data && typeof data.commit === 'string' ? data.commit : '';
  return SHA.test(commit) ? commit : '';
}

export async function readLiveCommit(url, { attempts = 3, waitMs = 5000, fetchImpl = fetch } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { 'cache-control': 'no-cache' } });
      return commitFromResponse(res.status, await res.text());
    } catch (e) {
      last = e;
    }
    if (i < attempts) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(`${url}을 읽지 못했다(${attempts}번 시도) — ${last.message}`);
}

// `node tools/live-commit.js <주소>` — 커밋(또는 빈 줄)만 표준출력에 쓴다. 설명은 표준에러로 보낸다.
async function main() {
  const url = process.argv[2];
  try {
    const commit = await readLiveCommit(url);
    console.error(`${url} → ${commit || '표시 없음'}`);
    console.log(commit);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
