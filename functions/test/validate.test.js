// 테스트 인프라 투자 승인(2026-08-27) 첫 번째 커버리지 — 보안에 직결되는
// 검증 로직부터 시작한다. 실제로 이 저장소는 이미 한 번 "파일명이 추측
// 가능했던" 결함이 배포까지 간 전례가 있어(2026-08-26), 회귀를 잡아줄
// 테스트가 필요하다는 판단이었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFilename, validateUploadRequest, createRateLimiter, chunk, hasMp4Signature, MAX_DECODED_BYTES, MAX_FILENAME_LEN } from '../validate.js';

// 진짜 mp4 파일 시작부(박스 크기 4바이트 + 'ftyp')를 흉내낸 최소 픽스처.
const FAKE_MP4_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypisom')]);

test('sanitizeFilename: 경로 조작 문자를 제거한다', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), '.._.._etc_passwd');
  assert.equal(sanitizeFilename('dub_fantasy_123_a1b2c3.mp4'), 'dub_fantasy_123_a1b2c3.mp4');
  assert.equal(sanitizeFilename('한글파일명.mp4'), '한글파일명.mp4');
});

test('validateUploadRequest: 정상 요청은 통과한다', () => {
  const body = { filename: 'dub_fantasy_1_abcdef.mp4', mimeType: 'video/mp4', dataBase64: FAKE_MP4_BYTES.toString('base64') };
  const result = validateUploadRequest(body);
  assert.equal(result.ok, true);
  assert.equal(result.safeName, 'dub_fantasy_1_abcdef.mp4');
  assert.ok(result.buffer.equals(FAKE_MP4_BYTES));
});

// 2026-09-01 종합감사 발견: mimeType을 "video/mp4"라고 우겨도 실제 콘텐츠가
// mp4가 아니면(ftyp 시그니처 없음) 거부해야 한다 — 이전엔 여기서 통과했다.
test('validateUploadRequest: mimeType은 video/mp4지만 실제 내용은 mp4가 아니면 거부한다', () => {
  const body = { filename: 'fake.mp4', mimeType: 'video/mp4', dataBase64: Buffer.from('<script>alert(1)</script>').toString('base64') };
  const result = validateUploadRequest(body);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('hasMp4Signature: ftyp 박스가 있으면 true, 없으면 false', () => {
  assert.equal(hasMp4Signature(FAKE_MP4_BYTES), true);
  assert.equal(hasMp4Signature(Buffer.from('not an mp4 at all')), false);
  assert.equal(hasMp4Signature(Buffer.alloc(3)), false);
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

// 2026-08-28: 2000개 실측 스트레스테스트 중 대량 삭제가 메모리 초과로 실패하는 걸
// 발견해 chunk()로 배치 처리하게 고쳤다 — 그 분할 로직 자체를 검증한다.
test('chunk: 지정한 크기로 배열을 나눈다', () => {
  assert.deepEqual(chunk([1,2,3,4,5], 2), [[1,2],[3,4],[5]]);
  assert.deepEqual(chunk([1,2,3], 3), [[1,2,3]]);
  assert.deepEqual(chunk([], 2), []);
});

test('chunk: 배치 크기보다 큰 배열도 원소를 하나도 안 빠뜨린다', () => {
  const arr = Array.from({ length: 1989 }, (_, i) => i);
  const batches = chunk(arr, 100);
  assert.equal(batches.length, 20); // 19*100 + 89
  assert.equal(batches.flat().length, 1989);
  assert.deepEqual(batches.flat(), arr);
});
