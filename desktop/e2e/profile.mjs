// 설치판 시험의 앱 프로필(--user-data-dir) 자리 — 늘 짧은 경로(%TEMP%\vc-e2e\<12자>)에 둔다(11/14 팀장 지시).
// 전에는 test.info().outputPath('profile')이라 «출력 폴더(--output) + 시험 이름 폴더(한글 제목 그대로)» 밑이어서, 출력 폴더를 길게 주면
// 프로필 안 Chromium 파일 경로가 Windows 260자(MAX_PATH)에 가까워졌다. 출력 폴더와 상관없이 프로필 경로를 짧게 묶어 둔다.
// 🟡 11/14 2.0.3 시험의 1번 «The Service Worker system has shutdown»은 이 길이 때문이 아니었다 — 같은 긴 경로의 다음 반복과
// 더 긴 경로에서 옛 코드로도 통과했다(원인 확인 못 함, app.md «설치판 2.0.3 공개 — 일요일»).
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from '@playwright/test';

const ROOT = path.join(os.tmpdir(), 'vc-e2e');
/** 프로필 경로가 이보다 길면 시작하지 않는다 — 프로필 안 Chromium 경로(약 150자)를 더해도 260자 아래로 남기려는 값 */
const MAX_PROFILE_PATH = 100;
const made = new Map();

/** 이 시험의 프로필 폴더. 시험(반복 · 재시도 포함)마다 하나이고, 한 시험 안에서는 몇 번 불러도 같은 폴더다(껐다 켜는 시험). */
export function profileDir() {
  const info = test.info();
  const key = `${info.testId}|${info.repeatEachIndex}|${info.retry}`;
  if (made.has(key)) return made.get(key);
  const dir = path.join(ROOT, createHash('sha1').update(key).digest('hex').slice(0, 12));
  if (dir.length > MAX_PROFILE_PATH) throw new Error(`시험 프로필 경로가 ${dir.length}자 — ${MAX_PROFILE_PATH}자 아래인 임시 폴더(TEMP)에서 돌려 주세요: ${dir}`);
  // 지난 실행에서 같은 시험이 쓴 프로필 — outputPath처럼 늘 빈 프로필로 시작한다(«다음 사람의 칸은 비어 있다» 등이 기댄다)
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  made.set(key, dir);
  return dir;
}
