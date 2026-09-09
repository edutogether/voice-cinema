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
