// 클라이언트(src/config.ts)와 서버(functions/index.js)가 반드시 같은 값을 써야 하는
// 항목들을 강제한다. 두 파일은 서로 다른 npm 패키지에 있고 functions/는 배포 시
// 자기 디렉터리만 업로드되므로 공용 모듈로 묶을 수 없다 — 대신 여기서 두 소스를
// 텍스트로 읽어 비교해, 한쪽만 고치면 CI가 떨어지게 한다.
//
// 두 파일을 import하지 않고 정규식으로 읽는 이유: functions/index.js는
// firebase-admin 등 functions/node_modules 안에만 있는 의존성을 로드하려 해서
// 이 위치에서 import가 실패한다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

function extract(source, pattern, label) {
  const m = source.match(pattern);
  expect(m, `${label}을(를) 찾지 못함`).toBeTruthy();
  return m[1];
}

test('BOOTH_TOKEN: functions/index.js와 src/config.ts가 같은 값을 쓴다', () => {
  const server = extract(read('functions/index.js'), /const BOOTH_TOKEN = '([^']+)'/, '서버 BOOTH_TOKEN');
  const client = extract(read('src/config.ts'), /export const BOOTH_TOKEN = '([^']+)'/, '클라이언트 BOOTH_TOKEN');
  expect(client).toBe(server);
});

// 업로드 타임아웃은 클라이언트(AbortController)와 서버(Cloud Run) 두 곳에 있는데,
// Cloud Run이 먼저 끊으므로 클라이언트만 늘리면 아무 효과가 없다. 실제로 한쪽만
// 60초로 방치돼 있던 적이 있어(2026-09-06 발견) 여기서 일치를 강제한다.
test('업로드 타임아웃: 클라이언트(ms)와 서버(초)가 같은 시간을 가리킨다', () => {
  // voiceCinema 블록 안의 값만 본다 — 같은 파일의 cleanupAfterCutoff에도
  // timeoutSeconds가 있어서 앞에서부터 찾으면 엉뚱한 값을 집을 수 있다.
  const serverSeconds = Number(
    extract(
      read('functions/index.js'),
      /export const voiceCinema = onRequest\([\s\S]*?timeoutSeconds:\s*(\d+)/,
      '서버 voiceCinema timeoutSeconds'
    )
  );
  const clientMs = Number(
    extract(read('src/config.ts'), /export const UPLOAD_TIMEOUT_MS = (\d+)/, '클라이언트 UPLOAD_TIMEOUT_MS')
  );
  expect(clientMs).toBe(serverSeconds * 1000);
});

// 개인정보처리방침이 약속한 삭제 시각과 실제 예약 시각이 어긋나면 그건 틀린 고지다.
// 2026-09-09에 실제로 어긋나 있었다 — 방침은 "12월 1일 00:00", 예약은 새벽 3시라
// 그 사이 세 시간 동안 파일이 남아 있었다. 예약을 자정으로 옮겨 맞췄고, 다음에 누가
// 예약 시각을 바꾸면 방침 문구도 같이 고치도록 여기서 강제한다.
test('자동삭제: 예약 시각과 개인정보처리방침에 적힌 시각이 같다', () => {
  const cron = extract(
    read('functions/index.js'),
    /export const cleanupAfterCutoff = onSchedule\([\s\S]*?schedule: '([^']+)'/,
    'cleanupAfterCutoff schedule'
  );
  const [minute, hour] = cron.split(' ');
  const 시각 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  expect(read('privacy.html')).toContain(`2026년 12월 1일 ${시각}`);
});

// 2026-10-05: 서버가 저장 이름을 정할 때 쓰는 장르 목록이 앱의 장르와 같아야 한다.
// 어긋나도 업로드는 실패하지 않지만(이름이 dub으로 바뀔 뿐) 파일 이름에서 장르를 잃는다.
test('장르 목록: functions/validate.js와 src/genres.ts가 같은 장르를 쓴다', () => {
  const 앱 = [...read('src/genres.ts').matchAll(/^\s+id: '([a-z]+)'/gm)].map((m) => m[1]).sort();
  const 서버 = [...read('functions/validate.js').match(/GENRE_IDS = new Set\(\[([^\]]+)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  expect(앱.length).toBeGreaterThan(0); // 아무것도 못 읽은 채 같다고 하지 않게(§21-1)
  expect(서버).toEqual(앱);
});

// 2026-10-09: 배포 도구는 package-lock으로 하위 의존성까지 잠근 로컬 바이너리만 쓴다. 배포 단계에서 npx로 받으면
// 자격증명이 깔린 뒤에 잠기지 않은 하위 의존성을 내려받는다.
test('배포 도구: firebase-tools를 정확한 버전으로 잠그고 배포는 로컬 바이너리로만 한다', () => {
  const 버전 = JSON.parse(read('package.json')).devDependencies['firebase-tools'];
  expect(버전, 'package.json에 범위(^·~)가 아닌 정확한 버전').toMatch(/^\d+\.\d+\.\d+$/);
  const 잠금 = JSON.parse(read('package-lock.json')).packages['node_modules/firebase-tools'];
  expect(잠금.version).toBe(버전);
  expect(잠금.integrity).toMatch(/^sha512-/);
  const 배포 = read('.github/workflows/deploy.yml');
  const 명령 = [...배포.matchAll(/^\s+- run: (.*firebase.* deploy .*)$/gm)].map((m) => m[1]);
  expect(명령.length, '배포 명령을 못 찾음').toBe(2); // storage,functions와 hosting
  for (const c of 명령) expect(c).toMatch(/^node_modules\/\.bin\/firebase deploy /);
  expect(배포).not.toMatch(/npx[^\n]*firebase-tools/);
});
