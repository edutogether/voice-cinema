declare module 'virtual:clip-versions' {
  /** public/clips 아래 파일(예: 'previews/sf.mp4') → 내용 해시 8자리. `tools/clip-versions.js`가 만든다. */
  const versions: Record<string, string>;
  export default versions;
  /** public/clips 아래 mp4(예: 'hero.mp4') → 길이(초, 소수 셋째 자리). 원판 mvhd에서 읽는다. */
  export const lengths: Record<string, number>;
}
