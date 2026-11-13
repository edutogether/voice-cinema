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
      // mp4마다 길이(초)도 함께 내보낸다 — 장면 길이를 숫자로 박지 않고 원판 파일에서 읽는다(11/14 Bumm님 «길이가 편마다 다르다»).
      const lengths = {};
      for (const abs of listFiles(dir)) {
        const key = path.relative(dir, abs).split(path.sep).join('/');
        const bytes = readFileSync(abs);
        versions[key] = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
        if (key.endsWith('.mp4')) lengths[key] = Math.round(mp4Seconds(bytes, key) * 1000) / 1000;
      }
      return `export default ${JSON.stringify(versions)};\nexport const lengths = ${JSON.stringify(lengths)};`;
    },
  };
}

/** mp4 길이(초) — 맨 위 상자들에서 moov를 찾고 그 안의 mvhd(동영상 머리)에서 읽는다(ffprobe 없이, CI 러너에 기대지 않는다). */
export function mp4Seconds(bytes, name = 'mp4') {
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  const mvhd = moov && findBox(bytes, moov.body, moov.end, 'mvhd');
  if (!mvhd) throw new Error(`${name}: moov/mvhd 없음`);
  const at = mvhd.body;
  return bytes[at] === 1
    ? Number(bytes.readBigUInt64BE(at + 24)) / bytes.readUInt32BE(at + 20)
    : bytes.readUInt32BE(at + 16) / bytes.readUInt32BE(at + 12);
}

function findBox(bytes, from, to, type) {
  for (let at = from; at + 8 <= to;) {
    let size = bytes.readUInt32BE(at);
    let head = 8;
    if (size === 1) { size = Number(bytes.readBigUInt64BE(at + 8)); head = 16; }
    else if (size === 0) size = to - at;
    if (size < head) return null;
    if (bytes.toString('latin1', at + 4, at + 8) === type) return { body: at + head, end: at + size };
    at += size;
  }
  return null;
}

function listFiles(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const abs = path.join(dir, name);
    return statSync(abs).isDirectory() ? listFiles(abs) : [abs];
  });
}
