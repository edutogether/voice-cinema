'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { uniqueSavePath } = require('../save-path');

test('같은 이름이 있으면 « (1)»부터 붙여 앞 학생의 영화를 덮어쓰지 않는다', () => {
  const dir = path.join('C:', 'Users', 'booth', 'Downloads');
  const taken = new Set([path.join(dir, 'Voice Cinema_SF.mp4'), path.join(dir, 'Voice Cinema_SF (1).mp4')]);
  const exists = (p) => taken.has(p);
  assert.equal(uniqueSavePath(dir, 'Voice Cinema_SF.mp4', exists), path.join(dir, 'Voice Cinema_SF (2).mp4'));
  assert.equal(uniqueSavePath(dir, 'Voice Cinema_판타지.mp4', exists), path.join(dir, 'Voice Cinema_판타지.mp4'));
});

test('이름에 경로가 섞여 와도 다운로드 폴더 밖으로 나가지 않는다', () => {
  const dir = path.join('C:', 'Users', 'booth', 'Downloads');
  assert.equal(uniqueSavePath(dir, '..\\..\\evil.mp4', () => false), path.join(dir, 'evil.mp4'));
});
