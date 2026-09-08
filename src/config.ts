// 앱 전역 상수. 값이 여러 곳에 흩어지지 않도록 여기 한 곳에만 둔다.

export const CLIP_SECONDS = 10;

export const API_BASE =
  'https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema';

// functions/index.js의 BOOTH_TOKEN과 반드시 같은 값이어야 한다. 진짜 비밀이 아니라
// (이 파일은 공개된다) URL만 아는 자동화 스크립트의 무차별 업로드를 막는 1차
// 방어선일 뿐이다. 두 값이 어긋나면 부스 업로드 전체가 403으로 죽는데,
// test/contract.test.js가 두 소스를 읽어 비교하므로 어긋난 채로는 CI를 통과할 수 없다.
export const BOOTH_TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';

// apiKey는 Firebase 웹앱 식별용일 뿐 진짜 비밀이 아니다 — 실제 보호는 App Check 토큰 검증이 한다.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC9q2j284NR82lYfO9hwFwdMdwtj2LeFGE',
  authDomain: 'inky-voice-cinema.firebaseapp.com',
  projectId: 'inky-voice-cinema',
  storageBucket: 'inky-voice-cinema.firebasestorage.app',
  messagingSenderId: '710797378638',
  appId: '1:710797378638:web:5d8b0fe73666bb84026f1f',
};

export const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LdZY6QtAAAAAAqN9jOJRravmX7C7FuwvJpQ6Gm9';

// 크롬 DevTools 표준 프리셋(Fast 3G: 업로드 0.75Mbps·지연 560ms / Slow 3G:
// 0.4Mbps·지연 2000ms)으로 실측해 정한 값. 설계 목표는 "Fast 3G에서는 성공,
// Slow 3G는 억지로 성공시키지 말고 적당한 시간 안에 실패를 감지해 로컬 폴백"이다 —
// 완성본 평균 5.9MB, base64 포함 전송량 약 7.9MB 기준으로 Fast 3G 93.9초,
// Slow 3G 171.0초를 실측했다. 110초면 Fast 3G는 약 16초 여유로 성공하고,
// Slow 3G는 171초까지 기다리지 않고 끊겨 폴백으로 넘어간다.
//
// 이 값은 functions/index.js의 onRequest timeoutSeconds와 반드시 같아야 한다 —
// Cloud Run이 그 시간에 도달하면 클라이언트 설정과 무관하게 먼저 연결을 끊으므로
// 클라이언트만 늘리면 아무 효과가 없다. 한쪽만 고치는 실수를 막기 위해
// test/contract.test.js가 두 파일을 읽어 일치를 강제한다.
export const UPLOAD_TIMEOUT_MS = 110000;

// 최초 시도 + 재시도 2회. 부스 와이파이의 순간적 끊김을 흡수하기 위한 값이고,
// 타임아웃(AbortError)은 shouldRetryUpload()가 재시도 대상에서 빼므로
// 느린 회선에서 대기 시간이 배로 늘어나지는 않는다.
export const MAX_UPLOAD_ATTEMPTS = 3;
