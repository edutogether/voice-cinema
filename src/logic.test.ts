// 순수 로직 유닛테스트. UI는 DOM/브라우저 API에 묶여 통째로 테스트하기 어려우므로,
// 판단이 들어가는 로직만 logic.ts로 뽑아 여기서 검증한다.
import { test, expect } from 'vitest';
import { pickAudioExtension, buildUploadFilename, pickSupportedMime, shouldRetryUpload } from './logic';

test('pickAudioExtension: mp4 계열은 m4a, 그 외(webm/opus)는 webm', () => {
  expect(pickAudioExtension('audio/mp4')).toBe('m4a');
  expect(pickAudioExtension('audio/webm;codecs=opus')).toBe('webm');
  expect(pickAudioExtension('audio/webm')).toBe('webm');
  expect(pickAudioExtension('')).toBe('webm');
});

test('buildUploadFilename: genreId+timestamp+token으로 파일명을 만든다', () => {
  expect(
    buildUploadFilename('fantasy', 1735689600000, 'a1b2c3')
  ).toBe('dub_fantasy_1735689600000_a1b2c3.mp4');
});

test('buildUploadFilename: token 없이는 예외를 던진다 (추측 가능한 파일명 방지)', () => {
  expect(() => buildUploadFilename('fantasy', 1735689600000, '')).toThrow();
  expect(() => buildUploadFilename('fantasy', 1735689600000, undefined as unknown as string)).toThrow();
});

test('pickSupportedMime: 지원하는 첫 번째 후보를 고른다', () => {
  const isTypeSupported = (m: string) => m === 'audio/webm';
  expect(
    pickSupportedMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'], isTypeSupported)
  ).toBe('audio/webm');
});

test('pickSupportedMime: 아무것도 지원 안 하면 빈 문자열(MediaRecorder 기본값에 위임)', () => {
  expect(pickSupportedMime(['audio/webm', 'audio/mp4'], () => false)).toBe('');
});

test('shouldRetryUpload: AbortError는 재시도하지 않는다 (이미 타임아웃만큼 기다림)', () => {
  const abortErr = new Error('aborted');
  abortErr.name = 'AbortError';
  expect(shouldRetryUpload(abortErr)).toBe(false);
});

test('shouldRetryUpload: 그 외 에러(네트워크 순간 끊김 등)는 재시도한다', () => {
  expect(shouldRetryUpload(new Error('network blip'))).toBe(true);
  expect(shouldRetryUpload(new TypeError('failed to fetch'))).toBe(true);
});
