import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ID = 'virtual:clip-versions';
const RESOLVED = '\0' + ID;

/**
 * public/clips 아래 파일마다 내용 해시(8자리)를 모아 `virtual:clip-versions`로 내보낸다.
 * `src/genres.ts`가 주소 뒤에 `?v=<해시>`로 붙인다.
 *
 * 왜 필요한가: clips/**는 이름에 해시가 없고 하루 캐시(firebase.json `max-age=86400`)이며, 서비스워커도
 * 클립을 캐시 우선으로 낸다. 그래서 그림·영상을 바꿔 다시 배포해도 이미 본 기기는 같은 주소의 옛 파일을
 * 계속 쓴다 — 2026-10-20 미리보기에서 바꾼 장면의 카드·미리보기·그림 띠가 옛 장면과 섞여 보였다.
 * 내용이 바뀌면 주소가 바뀌므로 브라우저 캐시와 서비스워커 캐시 둘 다 새 파일을 받는다.
 */
export function clipVersions({ dir }) {
  return {
    name: 'voice-cinema-clip-versions',
    resolveId(id) {
      return id === ID ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      const versions = {};
      for (const abs of listFiles(dir)) {
        const key = path.relative(dir, abs).split(path.sep).join('/');
        versions[key] = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 8);
      }
      return `export default ${JSON.stringify(versions)};`;
    },
  };
}

function listFiles(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const abs = path.join(dir, name);
    return statSync(abs).isDirectory() ? listFiles(abs) : [abs];
  });
}
