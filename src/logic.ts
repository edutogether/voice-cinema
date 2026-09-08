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
