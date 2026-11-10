// 움직임 줄이기(prefers-reduced-motion) 신호를 보고 멈추거나 건너뛰는 코드를 두지 않는다
// (11/11 Bumm님 «여덟 앱 모두, 움직임 줄이기와 상관없이 늘 정상처럼 돌게», 팀장 전달).
// Bumm님이 이 PC에 원격으로 들어와 연 브라우저가 이 신호를 보고해 스플래시 · 장면 · 3·2·1이 멈춰 보였다 — 켠 적 없는 설정이다.
// 화면에서 도는지는 e2e/motion-always.spec.js가 두 조건으로 본다. 여기서는 새로 들어오는 신호 읽기를 막는다.
import { test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function files(dir) {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : files(rel);
    return /\.(tsx?|css|js|html)$/.test(entry.name) ? [rel] : [];
  });
}

test('화면 코드(src · public · index.html)가 움직임 줄이기 신호를 읽지 않는다', () => {
  const sources = [...files('src'), ...files('public'), 'index.html'];
  expect(sources.length).toBeGreaterThan(20);
  const found = sources.filter((rel) => /prefers-reduced-motion/i.test(readFileSync(path.join(root, rel), 'utf8')));
  expect(found).toEqual([]);
});
