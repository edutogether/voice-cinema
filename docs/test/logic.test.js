// 테스트 커버리지 프론트엔드 확장(2026-08-27). docs/app.js 자체는 DOM/브라우저 API에
// 강하게 결합돼 있어 통째로 테스트하기 어렵다 — 대신 순수 로직을 docs/logic.mjs로
// 뽑아 app.js가 그대로 가져다 쓰게 했고, 그 로직을 여기서 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAudioExtension, buildUploadFilename, pickSupportedMime, shouldRetryUpload } from '../logic.js';

test('pickAudioExtension: mp4 계열은 m4a, 그 외(webm/opus)는 webm', () => {
  assert.equal(pickAudioExtension('audio/mp4'), 'm4a');
  assert.equal(pickAudioExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(pickAudioExtension('audio/webm'), 'webm');
  assert.equal(pickAudioExtension(''), 'webm');
});

test('buildUploadFilename: genreId+timestamp+token으로 파일명을 만든다', () => {
  assert.equal(
    buildUploadFilename('fantasy', 1735689600000, 'a1b2c3'),
    'dub_fantasy_1735689600000_a1b2c3.mp4'
  );
});

test('buildUploadFilename: token 없이는 예외를 던진다 (추측 가능한 파일명 방지)', () => {
  assert.throws(() => buildUploadFilename('fantasy', 1735689600000, ''));
  assert.throws(() => buildUploadFilename('fantasy', 1735689600000, undefined));
});

test('pickSupportedMime: 지원하는 첫 번째 후보를 고른다', () => {
  const isTypeSupported = (m) => m === 'audio/webm';
  assert.equal(
    pickSupportedMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'], isTypeSupported),
    'audio/webm'
  );
});

test('pickSupportedMime: 아무것도 지원 안 하면 빈 문자열(MediaRecorder 기본값에 위임)', () => {
  assert.equal(pickSupportedMime(['audio/webm', 'audio/mp4'], () => false), '');
});

test('shouldRetryUpload: AbortError는 재시도하지 않는다 (이미 60초 기다림)', () => {
  const abortErr = new Error('aborted');
  abortErr.name = 'AbortError';
  assert.equal(shouldRetryUpload(abortErr), false);
});

test('shouldRetryUpload: 그 외 에러(네트워크 순간 끊김 등)는 재시도한다', () => {
  assert.equal(shouldRetryUpload(new Error('network blip')), true);
  assert.equal(shouldRetryUpload(new TypeError('failed to fetch')), true);
});
