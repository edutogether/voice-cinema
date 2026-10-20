// 순수 로직 유닛테스트. UI는 DOM/브라우저 API에 묶여 통째로 테스트하기 어려우므로,
// 판단이 들어가는 로직만 logic.ts로 뽑아 여기서 검증한다.
import { test, expect } from 'vitest';
import {
  pickAudioExtension, buildUploadFilename, pickSupportedMime, shouldRetryUpload,
  progressPercent, isKakaoInApp, kakaoExternalUrl, kakaoMenuHint,
} from './logic';

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

test('progressPercent: 받은 바이트를 실제 파일 크기로 나누고 100%에서 멈춘다', () => {
  expect(progressPercent(0, 32_232_419)).toBe(0);
  expect(progressPercent(16_116_210, 32_232_419)).toBe(50);
  expect(progressPercent(32_232_419, 32_232_419)).toBe(100);
  // 10/20 라이브: Hosting이 brotli로 보내 Content-Length(7,280,522)를 분모로 쓰면 다 받았을 때 443%였다
  expect(progressPercent(32_232_419, 7_280_522)).toBe(100);
});

// 실제 기기에서 쓰는 모양의 UA(카카오톡은 끝에 «KAKAOTALK 버전»을 붙인다 — 안드로이드는 앞에 띄어쓰기 없이 «;»)
const UA = {
  kakaoAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410960',
  kakaoIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  naverIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.0; 15PRO)',
  kakaoStory: 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 KAKAOSTORY/5.0',
};

test('isKakaoInApp: 카카오톡 안 브라우저만 잡고, 다른 브라우저·다른 인앱은 건드리지 않는다', () => {
  expect(isKakaoInApp(UA.kakaoAndroid)).toBe(true);
  expect(isKakaoInApp(UA.kakaoIphone)).toBe(true);
  expect(isKakaoInApp(UA.chromeAndroid)).toBe(false);
  expect(isKakaoInApp(UA.safariIphone)).toBe(false);
  expect(isKakaoInApp(UA.naverIphone)).toBe(false);
  expect(isKakaoInApp(UA.kakaoStory)).toBe(false);
});

test('kakaoExternalUrl: 지금 주소를 통째로 인코딩해 카카오톡의 바깥 브라우저 열기 주소에 싣는다', () => {
  expect(kakaoExternalUrl('https://voice.edutogether.kr/')).toBe('kakaotalk://web/openExternal?url=https%3A%2F%2Fvoice.edutogether.kr%2F');
  // 쿼리·해시가 바깥 주소의 쿼리로 새지 않게 &·#·=까지 인코딩한다
  expect(kakaoExternalUrl('https://voice.edutogether.kr/?a=1&b=2#x')).toBe('kakaotalk://web/openExternal?url=https%3A%2F%2Fvoice.edutogether.kr%2F%3Fa%3D1%26b%3D2%23x');
});

test('kakaoMenuHint: 카카오가 안내한 메뉴 위치대로 — 아이폰은 위 가운데 주소, 안드로이드는 아래 오른쪽 메뉴', () => {
  expect(kakaoMenuHint(UA.kakaoIphone)).toContain('위 가운데 주소');
  expect(kakaoMenuHint(UA.kakaoAndroid)).toContain('아래 오른쪽 메뉴');
});
