// DOM·fetch·ffmpeg에 의존하지 않는 순수 로직만 모아둔다 — 브라우저 없이 유닛테스트로 검증한다.

// mergeClip()에서 녹음 오디오를 ffmpeg에 넘길 때 쓰는 파일 확장자를 고른다.
// 확장자가 실제 컨테이너 포맷과 다르면 ffmpeg 디먹서가 잘못된 포맷으로
// 추측해 합성이 실패할 수 있어 이 매핑이 맞아야 한다.
export function pickAudioExtension(mime: string): string {
  return /mp4/.test(mime) ? 'm4a' : 'webm';
}

// Storage에 올릴 파일명을 만든다. makePublic()으로 공개되는 파일이라,
// genreId+timestamp만으로는 좁은 시간대를 순차 대입해 다른 학생의 영상을
// 추측당할 수 있어(2026-08-26 정밀감사 발견) token이 반드시 붙어야 한다.
export function buildUploadFilename(genreId: string, timestamp: number, token: string): string {
  if (!token) throw new Error('token 없이 업로드 파일명을 만들 수 없습니다 — 추측 가능한 파일명이 됩니다.');
  return `dub_${genreId}_${timestamp}_${token}.mp4`;
}

// MediaRecorder에 넘길 mimeType을 고른다.
// isTypeSupported를 주입받아 실제 MediaRecorder API 없이도 선택 로직을 검증할 수 있다.
export function pickSupportedMime(
  candidates: string[],
  isTypeSupported: (mime: string) => boolean
): string {
  for (const m of candidates) {
    if (isTypeSupported(m)) return m;
  }
  return '';
}

// 업로드 실패 후 재시도할지 판단한다.
// AbortError(이미 UPLOAD_TIMEOUT_MS만큼 기다린 자체 타임아웃)는 재시도해도 소용없어 제외한다.
export function shouldRetryUpload(error: unknown): boolean {
  return !(error instanceof Error && error.name === 'AbortError');
}

// 받은 바이트를 실제 파일 크기(total)로 나눈 진행률. 100%에서 멈춘다.
export function progressPercent(received: number, total: number): number {
  return Math.min(100, Math.round((received / total) * 100));
}

// 카카오톡 안 브라우저인가 — 카카오톡은 UA 끝에 «KAKAOTALK 버전»을 붙인다(안드로이드·아이폰 공통).
// 카카오스토리 등 다른 인앱은 이번 대상이 아니다(10/20 대표님).
/**
 * Firebase Hosting 미리보기 채널(`<사이트>--<채널>-<해시>.web.app`)인지. 미리보기 주소는 서버 허용 출처 밖이라 업로드가 늘 막힌다
 * (functions/index.js의 ALLOWED_ORIGINS) — 실패 화면이 «인터넷 문제»로 보이지 않게 그 사실을 알린다(10/20 대표님 아이폰 시험에서 오진).
 */
export function isPreviewChannel(hostname: string): boolean {
  return /--[a-z0-9-]+\.web\.app$/.test(hostname);
}

export function isKakaoInApp(ua: string): boolean {
  return /\bKAKAOTALK\b/i.test(ua);
}

// 카카오톡의 «바깥 브라우저로 열기» 주소. 카카오가 문서로 낸 주소는 아니다 — 카카오 데브톡의 카카오 쪽 답은
// «인앱 브라우저는 개발자 문서 범위가 아니다»였고, 이 형식은 개발자들이 널리 쓰는 것이다. 실제 동작은 실기기로 확인한다.
export function kakaoExternalUrl(href: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
}

// 자동 이동이 안 될 때 손으로 여는 길 — 카카오 데브톡에서 카카오 쪽이 안내한 메뉴 위치 그대로(2023-12-04):
// 안드로이드는 아래 오른쪽 메뉴, 아이폰은 위 가운데 주소를 누르면 «다른 브라우저로 열기»가 있다.
export function kakaoMenuHint(ua: string): string {
  return /iPhone|iPad|iPod/.test(ua)
    ? '화면 위 가운데 주소를 누른 뒤 «다른 브라우저로 열기»를 눌러 주세요.'
    : '화면 아래 오른쪽 메뉴에서 «다른 브라우저로 열기»를 눌러 주세요.';
}
