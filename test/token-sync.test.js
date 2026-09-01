// 종합감사(2026-09-01) L2 발견 반영: functions/index.js와 docs/app.js에 각각
// 하드코딩된 BOOTH_TOKEN이 일치하는지 검사하는 자동화가 전혀 없었다 — 한쪽만
// 고치면 부스 전체 업로드가 100% 403으로 죽는데(functions/index.js의 토큰
// 비교 분기) 유닛테스트도 E2E(업로드를 stub함)도 이 드리프트를 못 잡았다.
// 두 파일을 실제로 import하지 않고(functions/index.js는 firebase-admin 등
// functions/node_modules 안에만 있는 의존성을 로드하려 해서 이 위치에서 import가
// 실패한다) 소스 텍스트에서 정규식으로 뽑아 비교한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

function extractBoothToken(relPath) {
  const src = readFileSync(path.join(root, '..', relPath), 'utf8');
  const m = src.match(/const BOOTH_TOKEN = '([^']+)'/);
  assert.ok(m, `${relPath}에서 BOOTH_TOKEN을 찾지 못함`);
  return m[1];
}

test('BOOTH_TOKEN: functions/index.js와 docs/app.js가 같은 값을 쓴다', () => {
  const serverToken = extractBoothToken('functions/index.js');
  const clientToken = extractBoothToken('docs/app.js');
  assert.equal(clientToken, serverToken);
});
