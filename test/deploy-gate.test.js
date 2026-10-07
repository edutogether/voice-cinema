// 배포 판정(tools/deploy-gate.js)을 고정한다(2026-10-08).
// GitHub 장애로 묶인 옛 배포 실행이 나중에 풀려도 새 배포를 덮어쓰지 않아야 하고,
// 판정을 못 하면 "건너뜀"이 아니라 실패로 끝나야 한다.
import { test, expect, describe } from 'vitest';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideDeploy } from '../tools/deploy-gate.js';

const A = 'a'.repeat(40); // 옛 커밋
const B = 'b'.repeat(40); // 지금 master 끝
const L = 'c'.repeat(40); // 마지막으로 실제 배포된 커밋

describe('decideDeploy', () => {
  test('이 실행의 커밋이 master 끝이 아니면 배포하지 않는다(코드가 바뀌었어도)', () => {
    const r = decideDeploy({ now: A, tip: B, last: L, changed: ['src/App.tsx'] });
    expect(r.deploy).toBe(false);
    expect(r.reason).toContain('master 끝');
  });
  test('master 끝을 확인하지 못하면 건너뛰지 않고 예외로 멈춘다', () => {
    expect(() => decideDeploy({ now: B, tip: '', last: L, changed: ['src/App.tsx'] })).toThrow('master 끝');
    expect(() => decideDeploy({ now: B, tip: 'not-a-sha', last: L, changed: [] })).toThrow();
  });
  test('이 실행의 커밋을 모르면 예외로 멈춘다', () => {
    expect(() => decideDeploy({ now: undefined, tip: B, last: L, changed: [] })).toThrow();
  });
  test('끝 커밋이고 코드가 바뀌었으면 배포한다', () => {
    expect(decideDeploy({ now: B, tip: B, last: L, changed: ['src/App.tsx', '_docs/CHANGELOG.md'] }).deploy).toBe(true);
  });
  test('끝 커밋이어도 문서만 바뀌었으면 배포하지 않는다', () => {
    const r = decideDeploy({ now: B, tip: B, last: L, changed: ['README.md', '_docs/x.md', '.claude/rules/app.md', ''] });
    expect(r.deploy).toBe(false);
  });
  test('같은 커밋이 이미 배포됐으면(중복 실행) 다시 배포하지 않는다', () => {
    const r = decideDeploy({ now: B, tip: B, last: B, changed: [] });
    expect(r.deploy).toBe(false);
    expect(r.reason).toContain('이미 배포');
  });
  test('비교 기준이 없거나 비교 결과가 0건이면 배포한다(§21-1)', () => {
    expect(decideDeploy({ now: B, tip: B, last: '', changed: [] }).deploy).toBe(true);
    expect(decideDeploy({ now: B, tip: B, last: L, changed: [''] }).deploy).toBe(true);
  });
});

// 워크플로가 실제로 부르는 방식(환경변수 → GITHUB_OUTPUT, 종료 코드)까지 본다.
describe('명령으로 실행', () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'deploy-gate.js');
  const run = (env) => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'gate-')), 'out');
    const r = spawnSync(process.execPath, [script], { env: { ...process.env, GITHUB_OUTPUT: out, ...env }, encoding: 'utf8' });
    return { code: r.status, stdout: r.stdout, output: existsSync(out) ? readFileSync(out, 'utf8') : '' };
  };
  test('옛 커밋 실행은 deploy_needed=false와 이유 한 줄을 남기고 정상 종료한다', () => {
    const r = run({ NOW: A, TIP: B, LAST: L, CHANGED: 'src/App.tsx' });
    expect(r.code).toBe(0);
    expect(r.output).toBe('deploy_needed=false\n');
    expect(r.stdout).toContain('지금 master 끝');
  });
  test('master 끝을 못 구하면 종료 코드 1이고 판정 값을 쓰지 않는다', () => {
    const r = run({ NOW: B, TIP: '', LAST: L, CHANGED: 'src/App.tsx' });
    expect(r.code).toBe(1);
    expect(r.output).toBe('');
  });
  test('끝 커밋의 코드 변경은 deploy_needed=true', () => {
    expect(run({ NOW: B, TIP: B, LAST: L, CHANGED: 'src/App.tsx\nREADME.md' }).output).toBe('deploy_needed=true\n');
  });
});
