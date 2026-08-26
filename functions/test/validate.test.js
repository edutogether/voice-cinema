// 테스트 인프라 투자 승인(2026-08-27) 첫 번째 커버리지 — 보안에 직결되는
// 검증 로직부터 시작한다. 실제로 이 저장소는 이미 한 번 "파일명이 추측
// 가능했던" 결함이 배포까지 간 전례가 있어(2026-08-26), 회귀를 잡아줄
// 테스트가 필요하다는 판단이었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFilename, validateUploadRequest, createRateLimiter, MAX_DECODED_BYTES, MAX_FILENAME_LEN } from '../validate.js';

test('sanitizeFilename: 경로 조작 문자를 제거한다', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), '.._.._etc_passwd');
  assert.equal(sanitizeFilename('dub_fantasy_123_a1b2c3.mp4'), 'dub_fantasy_123_a1b2c3.mp4');
  assert.equal(sanitizeFilename('한글파일명.mp4'), '한글파일명.mp4');
});

test('validateUploadRequest: 정상 요청은 통과한다', () => {
  const body = { filename: 'dub_fantasy_1_abcdef.mp4', mimeType: 'video/mp4', dataBase64: Buffer.from('hello').toString('base64') };
  const result = validateUploadRequest(body);
  assert.equal(result.ok, true);
  assert.equal(result.safeName, 'dub_fantasy_1_abcdef.mp4');
  assert.equal(result.buffer.toString(), 'hello');
});

test('validateUploadRequest: filename/dataBase64 누락은 400', () => {
  assert.equal(validateUploadRequest({}).ok, false);
  assert.equal(validateUploadRequest({ filename: 'x.mp4' }).ok, false);
  assert.equal(validateUploadRequest({ dataBase64: 'aGVsbG8=' }).ok, false);
});

test('validateUploadRequest: 허용 안 된 mimeType은 거부한다 (임의 콘텐츠타입 공개호스팅 방지)', () => {
  const body = { filename: 'x.html', mimeType: 'text/html', dataBase64: Buffer.from('<html>').toString('base64') };
  const result = validateUploadRequest(body);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('validateUploadRequest: 파일명이 MAX_FILENAME_LEN을 넘으면 거부한다', () => {
  const body = { filename: 'a'.repeat(MAX_FILENAME_LEN + 1) + '.mp4', mimeType: 'video/mp4', dataBase64: 'aGVsbG8=' };
  assert.equal(validateUploadRequest(body).ok, false);
});

test('validateUploadRequest: 디코딩 후 크기가 MAX_DECODED_BYTES를 넘으면 거부한다', () => {
  const big = Buffer.alloc(MAX_DECODED_BYTES + 1, 1).toString('base64');
  const body = { filename: 'big.mp4', mimeType: 'video/mp4', dataBase64: big };
  const result = validateUploadRequest(body);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('validateUploadRequest: 빈 파일은 거부한다', () => {
  const body = { filename: 'empty.mp4', mimeType: 'video/mp4', dataBase64: '' };
  assert.equal(validateUploadRequest(body).ok, false);
});

test('createRateLimiter: 창 안에서 한도를 넘으면 true를 반환한다', () => {
  const isRateLimited = createRateLimiter({ windowMs: 60000, max: 3 });
  assert.equal(isRateLimited('1.2.3.4'), false); // 1
  assert.equal(isRateLimited('1.2.3.4'), false); // 2
  assert.equal(isRateLimited('1.2.3.4'), false); // 3
  assert.equal(isRateLimited('1.2.3.4'), true);  // 4 - 한도 초과
});

test('createRateLimiter: IP가 다르면 서로 영향을 주지 않는다', () => {
  const isRateLimited = createRateLimiter({ windowMs: 60000, max: 1 });
  assert.equal(isRateLimited('1.1.1.1'), false);
  assert.equal(isRateLimited('2.2.2.2'), false);
});
