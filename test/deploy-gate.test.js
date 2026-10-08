// 배포 판정(tools/deploy-gate.js)을 고정한다(2026-10-08).
// GitHub 장애로 묶인 옛 배포 실행이 나중에 풀려도 새 배포를 덮어쓰지 않아야 하고, 그래도 라이브가
// 뒤처지면 매시 대조가 master 끝을 다시 배포해야 한다. 판정을 못 하면 "건너뜀"이 아니라 실패로 끝나야 한다.
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
const L = 'c'.repeat(40); // 지금 라이브에 배포된 커밋
const 라이브 = (h, f = h) => ({ hosting: h, functions: f });

describe('decideDeploy', () => {
  test('이 실행의 커밋이 master 끝이 아니면 배포하지 않는다(코드가 바뀌었어도)', () => {
    const r = decideDeploy({ now: A, tip: B, ci: 'success', live: 라이브(L), changed: ['src/App.tsx'] });
    expect(r.deploy).toBe(false);
    expect(r.reason).toContain('master 끝');
  });
  test('master 끝을 확인하지 못하면 건너뛰지 않고 예외로 멈춘다', () => {
    expect(() => decideDeploy({ now: B, tip: '', ci: 'success', live: 라이브(L), changed: ['src/App.tsx'] })).toThrow('master 끝');
    expect(() => decideDeploy({ now: B, tip: 'not-a-sha', ci: 'success', live: 라이브(L), changed: [] })).toThrow();
    expect(() => decideDeploy({ now: '', tip: '', ci: '', live: 라이브(L) })).toThrow('master 끝'); // 매시 대조에서 끝을 못 구함
  });
  test('이 실행의 커밋을 모르면 예외로 멈춘다', () => {
    expect(() => decideDeploy({ now: undefined, tip: B, ci: 'success', live: 라이브(L), changed: [] })).toThrow('이 실행의 커밋');
  });
  test('master 끝의 CI 결과를 확인하지 못하면 예외로 멈춘다', () => {
    expect(() => decideDeploy({ now: B, tip: B, ci: '', live: 라이브(L), changed: ['src/App.tsx'] })).toThrow('CI');
  });
  test('master 끝의 CI가 아직 돌거나 떨어졌으면 라이브가 뒤처져도 배포하지 않는다', () => {
    for (const ci of ['in_progress', 'failure', 'none']) {
      const r = decideDeploy({ now: B, tip: B, ci, live: 라이브(L), changed: ['src/App.tsx'] });
      expect(r.deploy, ci).toBe(false);
      expect(r.reason).toContain('CI');
    }
  });
  test('라이브 뒤로 코드가 바뀌었으면 배포한다', () => {
    expect(decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(L), changed: ['src/App.tsx', '_docs/CHANGELOG.md'] }).deploy).toBe(true);
  });
  test('묶여 있던 옛 실행이 라이브를 옛 커밋으로 덮어썼으면 master 끝을 다시 배포한다', () => {
    const r = decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(A), changed: ['functions/package-lock.json'] });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain('functions/package-lock.json');
  });
  test('라이브 뒤로 문서만 바뀌었으면 배포하지 않는다', () => {
    const r = decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(L), changed: ['README.md', '_docs/x.md', '.claude/rules/app.md', ''] });
    expect(r.deploy).toBe(false);
  });
  test('라이브 두 곳이 이미 이 커밋이면(같은 커밋의 중복 실행 포함) 다시 배포하지 않는다', () => {
    const r = decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(B), changed: [] });
    expect(r.deploy).toBe(false);
    expect(r.reason).toContain('이미 이 커밋');
  });
  test('라이브 표시가 없거나 형식이 다르면 배포한다', () => {
    expect(decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(''), changed: [] }).deploy).toBe(true);
    expect(decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(B, ''), changed: [] }).deploy).toBe(true); // Functions만 표시 없음
    expect(decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브('main'), changed: [] }).deploy).toBe(true);
  });
  test('라이브 두 곳의 커밋이 서로 다르면 배포한다(배포가 반쯤 실패한 경우)', () => {
    const r = decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(B, L), changed: ['README.md'] });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain('다르다');
  });
  test('비교 결과가 0건이면 배포한다(§21-1)', () => {
    expect(decideDeploy({ now: B, tip: B, ci: 'success', live: 라이브(L), changed: [''] }).deploy).toBe(true);
  });
});

// 워크플로가 실제로 부르는 방식(환경변수 → GITHUB_OUTPUT, 종료 코드)까지 본다.
describe('명령으로 실행', () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'deploy-gate.js');
  const run = (env) => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'gate-')), 'out');
    const r = spawnSync(process.execPath, [script], {
      env: { ...process.env, GITHUB_OUTPUT: out, CI: 'success', DRY_RUN: '', ...env },
      encoding: 'utf8',
    });
    return { code: r.status, stdout: r.stdout, output: existsSync(out) ? readFileSync(out, 'utf8') : '' };
  };
  test('옛 커밋 실행은 deploy_needed=false와 이유 한 줄을 남기고 정상 종료한다', () => {
    const r = run({ NOW: A, TIP: B, LIVE_HOSTING: L, LIVE_FUNCTIONS: L, CHANGED: 'src/App.tsx' });
    expect(r.code).toBe(0);
    expect(r.output).toBe(`deploy_needed=false\nsha=${A}\n`);
    expect(r.stdout).toContain('지금 master 끝');
  });
  test('master 끝을 못 구하면 종료 코드 1이고 판정 값을 쓰지 않는다', () => {
    const r = run({ NOW: B, TIP: '', LIVE_HOSTING: L, LIVE_FUNCTIONS: L, CHANGED: 'src/App.tsx' });
    expect(r.code).toBe(1);
    expect(r.output).toBe('');
  });
  test('라이브 뒤로 코드가 바뀌었으면 deploy_needed=true와 배포할 커밋을 넘긴다', () => {
    expect(run({ NOW: B, TIP: B, LIVE_HOSTING: L, LIVE_FUNCTIONS: L, CHANGED: 'src/App.tsx\nREADME.md' }).output).toBe(`deploy_needed=true\nsha=${B}\n`);
  });
  test('드라이런은 "배포했을 것"만 남기고 deploy_needed=false', () => {
    const r = run({ NOW: B, TIP: B, LIVE_HOSTING: A, LIVE_FUNCTIONS: A, CHANGED: 'src/App.tsx', DRY_RUN: 'true' });
    expect(r.code).toBe(0);
    expect(r.output).toBe(`deploy_needed=false\nsha=${B}\n`);
    expect(r.stdout).toContain('드라이런');
  });
});
