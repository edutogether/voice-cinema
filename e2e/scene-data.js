// 장르마다 원판 길이 · 멈춤 시각이 다르다(11/14 완성본 — 편마다 21~30초, 멈춤 12.0 · 15.0초). 시험은 숫자를 박지 않고 파일에서 읽는다 —
// 앱도 길이를 원판 파일에서 읽는다(tools/clip-versions.js → src/genres.ts). 멈춤 시각은 미리보기 길이에서 읽는다:
// 미리보기(previews/<장르>.mp4)는 0초부터 멈춤 시각까지다(tools/build-scene.mjs, test/scene-clips.test.js가 둘을 맞대 본다).
import { readFileSync } from 'node:fs';

function mp4Seconds(buffer) {
  const at = buffer.indexOf('mvhd');
  if (at < 0) throw new Error('mvhd 없음');
  if (buffer[at + 4] === 1) return Number(buffer.readBigUInt64BE(at + 28)) / buffer.readUInt32BE(at + 24);
  return buffer.readUInt32BE(at + 20) / buffer.readUInt32BE(at + 16);
}

const seconds = (rel) => mp4Seconds(readFileSync(`public/clips/${rel}`));

/** 원판 길이(초) — 녹음실 진행 막대의 끝, 합성본 길이와 같다. */
export const clipLength = (id) => seconds(`${id}.mp4`);

/** 녹음실이 멈추는 시각(초, 0.1초 단위) — 목소리 칸은 여기서부터 3.5초다. */
export const scenePause = (id) => Math.round(seconds(`previews/${id}.mp4`) * 10) / 10;

/** 녹음실 시간 글 — 앱(ClipTimeline의 formatTime)과 같은 «초:100분의 1초» 모양. */
export function clockText(time, length = time) {
  const hundredths = Math.floor(Math.max(0, Math.min(length, time)) * 100);
  return `${String(Math.floor(hundredths / 100)).padStart(2, '0')}:${String(hundredths % 100).padStart(2, '0')}`;
}

/**
 * 녹음 · 합성을 도는 시험이 쓰는 장면 — 처음 가운데에 있는 SF(통과본 «퍼스트 헬로»)다. 첫 카드라 «SF 더빙 시작»을 누르면 곧바로 들어간다
 * (가운데가 아닌 카드는 자동 넘김이 그 카드를 데려올 때까지 기다린다). 판타지 · 스포츠 · 뮤지컬은 새 판(28~30초)이 들어오는 자리라
 * 그 소리 · 길이에 기대지 않는다(11/14 — 전에는 10초 장면이던 판타지를 썼다).
 */
export const TEST_SCENE = { id: 'sf', name: 'SF' };
