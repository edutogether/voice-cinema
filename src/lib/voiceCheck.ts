// 녹음의 말소리 판단 — DOM·오디오 API 없이 숫자만 보는 순수 함수다(src/lib/voiceCheck.test.ts).
// 녹음 중에는 20ms마다 잰 음량을 말소리 추적기(createVoiceTracker)에 넣어 «말이 시작됐나 · 끝났나 · 너무 기나»를 정하고,
// 녹음이 끝나면 디코딩한 실제 소리를 같은 추적기에 넣어 무음·잘림·작은 목소리를 가리고 영화에 넣을 구간과 보정 음량을 정한다(checkTake).
//
// 문턱은 «말 시작 전 소음 바닥 × 2.5»와 절대 하한(−56dBFS) 중 큰 쪽(−34dBFS를 넘지 않게)이고, 말이 시작되면 고정한다 — 큰 소리가
// 이어지는 동안 바닥을 다시 재면 말소리가 바닥이 되어 말 중간에 끝난 것으로 보인다. 소음 바닥은 녹음을 켜기 전에 미리 잰다(prime —
// 녹음 중에는 3·2·1 동안, 녹음 뒤에는 녹음 전체) — 첫 칸부터 이어지는 부스 소음을 말 시작으로 보지 않게(10/25 유닛 시험에서 발견).
// 아이의 속삭임·높은 목소리를 무음으로 보지 않게 문턱을 낮게 두고, 판단이 틀릴 때는 더 녹음하는 쪽으로 틀리게 한다 — 말을 자르는 것보다 낫다.
import {
  END_SILENCE_AFTER_SHORT_SECONDS, END_SILENCE_SECONDS, MAX_SPEECH_SECONDS, PREROLL_SECONDS, SHORT_FIRST_SPEECH_SECONDS,
  TAIL_SECONDS, VOICE_WAIT_SECONDS,
} from '../config';

export const FRAME_SECONDS = 0.02;
const ABS_SPEECH = 0.0015; // −56.5dBFS
const SNR = 2.5; // 소음 바닥보다 +8dB
const MAX_THRESHOLD = 0.02; // −34dBFS — 시끄러운 곳(또는 3·2·1 내내 떠든 경우)에서도 외친 목소리는 문턱을 넘게
/** 말 시작으로 보려면 이만큼 이어져야 한다(딸깍 소리 하나로 시작하지 않게) */
const ONSET_FRAMES = 2;
/** 소음 바닥을 재려면 말 시작 전 칸이 이만큼은 있어야 한다 — 없으면(신호보다 먼저 말함) 절대 하한만 쓴다 */
const MIN_FLOOR_FRAMES = 5;
/** 발화 상한에 닿았을 때 이 안에 말소리가 있으면 끝이 잘렸을 수 있다 */
const CUT_SECONDS = 0.15;
const EPS = 1e-9;
const SILENT_PEAK = 0.001; // −60dBFS — 마이크에서 아무것도 안 들어왔다
const MIN_SPEECH_SECONDS = 0.1;
const QUIET_SPEECH = 0.0056; // −45dBFS
const MIN_TAKE_SECONDS = 0.8;
const EARLY_SECONDS = 0.1;
const TARGET_SPEECH = 0.1; // −20dBFS — 목소리 칸의 원판 소리(평균 −29~−41dBFS)보다 9dB 이상 크게
const MAX_GAIN_DB = 12;
const NOISE_CEILING = 0.00316; // −50dBFS — 보정하더라도 주변 소음이 이보다 커지지 않게

export type LiveStep = 'continue' | 'stop' | 'stop-cut' | 'stop-silent';
/** ok 그대로 · quiet·cut·early 들어 보고 판단(저장 가능) · silent·short 다시 녹음(저장 못 함) */
export type Verdict = 'ok' | 'quiet' | 'cut' | 'early' | 'silent' | 'short';

/** 발화 상한 — 3초, 목소리 칸이 짧으면 앞뒤 여백을 뺀 만큼(새 장면 202번째 프레임 정지 · 칸 3.2667초면 2.997초) */
export const maxSpeechFor = (voiceWindow: number) =>
  Math.min(MAX_SPEECH_SECONDS, Math.round((voiceWindow - PREROLL_SECONDS - TAIL_SECONDS) * 1000) / 1000);

export function rms(samples: ArrayLike<number>, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

/** 20ms마다 끊은 음량(RMS) */
export function frameLevels(samples: ArrayLike<number>, sampleRate: number): number[] {
  const size = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const levels: number[] = [];
  for (let at = 0; at + size <= samples.length; at += size) levels.push(rms(samples, at, at + size));
  return levels;
}

/** 소음 바닥 — 가장 조용한 10% 음량 */
export function noiseFloor(levels: readonly number[]): number {
  if (!levels.length) return 0;
  const sorted = [...levels].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.1)];
}

export interface VoiceTracker {
  /** 녹음 전 음량 한 칸 — 소음 바닥만 잰다(시간은 세지 않는다) */
  prime(level: number): void;
  /** 음량 한 칸을 넣고, 지금까지 녹음한 시간(초)에서 녹음을 이어 갈지 정한다 */
  push(level: number, elapsed: number): LiveStep;
  /** 말 시작 칸(-1이면 아직), 마지막 말소리 칸, 그때 쓴 문턱 */
  readonly onset: number;
  readonly lastActive: number;
  readonly threshold: number;
}

/**
 * 말소리 추적기 — 녹음 중(20ms마다 음량)과 녹음 뒤(디코딩한 소리)가 같은 규칙을 쓴다.
 *   말 시작 전: VOICE_WAIT_SECONDS 안에 말이 시작되지 않으면 stop-silent
 *   말 시작 뒤: 마지막 말소리 뒤 말끝 시간(첫 말이 짧으면 더 길게)만큼 조용하면 stop, 발화 상한에 닿으면 stop(그때 말하고 있으면 stop-cut)
 *   음량을 하나도 못 읽으면(오디오가 멈춘 기기) 판단하지 않고 기다림 + 발화 상한까지 다 녹음한다
 */
export function createVoiceTracker(maxSpeech: number): VoiceTracker {
  const pre: number[] = []; // 말 시작 전 음량(정렬해 둔다)
  let frames = 0;
  let onset = -1;
  let onsetElapsed = 0;
  let aboveElapsed = 0; // 문턱을 넘은 칸이 이어지기 시작한 칸의 뒤 끝
  let lastActive = -1;
  let lastActiveElapsed = 0;
  let threshold = ABS_SPEECH;
  let pending = 0; // 문턱을 넘은 칸이 이어진 수(말 시작 전)
  let heard = false;
  const insert = (level: number) => {
    let at = pre.length;
    while (at > 0 && pre[at - 1] > level) at--;
    pre.splice(at, 0, level);
  };
  return {
    get onset() { return onset; },
    get lastActive() { return lastActive; },
    get threshold() { return threshold; },
    prime(level) {
      if (onset < 0) insert(level);
    },
    push(level, elapsed) {
      const i = frames++;
      if (level > 0) heard = true;
      if (onset < 0) {
        const floor = pre.length >= MIN_FLOOR_FRAMES ? pre[Math.floor((pre.length - 1) * 0.1)] : 0;
        const thr = Math.max(ABS_SPEECH, Math.min(MAX_THRESHOLD, floor * SNR));
        if (level < thr) pending = 0;
        else if (pending++ === 0) aboveElapsed = elapsed;
        if (pending >= ONSET_FRAMES) {
          onset = i - ONSET_FRAMES + 1;
          onsetElapsed = aboveElapsed - FRAME_SECONDS; // 말 시작 칸의 앞 끝(elapsed는 칸의 뒤 끝)
          threshold = thr;
          lastActive = i;
          lastActiveElapsed = elapsed;
        } else {
          if (pending === 0) insert(level);
          if (!heard) return elapsed >= VOICE_WAIT_SECONDS + maxSpeech ? 'stop' : 'continue';
          // 기다림이 끝나는 바로 그 칸에 말이 막 시작됐으면 한 칸 더 본다
          return elapsed >= VOICE_WAIT_SECONDS && pending === 0 ? 'stop-silent' : 'continue';
        }
      } else if (level >= threshold) {
        lastActive = i;
        lastActiveElapsed = elapsed;
      }
      // 조용한 시간 · 첫 말 길이는 칸 수가 아니라 실제 시간으로 잰다 — 화면이 바빠 20ms 측정이 늦게 돌면 칸 수로 센 0.6초가
      // 그만큼 길어진다(10/25 전체 E2E에서 0.47 · 0.55초 늦게 멈춤). EPS는 칸 경계(0.6 · 0.8 · 0.9초)에서 소수 오차로 한 칸 늦지 않게
      const quiet = elapsed - lastActiveElapsed;
      const speaking = quiet < CUT_SECONDS;
      if (elapsed - onsetElapsed >= maxSpeech - EPS) return speaking ? 'stop-cut' : 'stop';
      const spoken = lastActiveElapsed - onsetElapsed;
      const hang = spoken < SHORT_FIRST_SPEECH_SECONDS - EPS ? END_SILENCE_AFTER_SHORT_SECONDS : END_SILENCE_SECONDS;
      return quiet >= hang - EPS ? 'stop' : 'continue';
    },
  };
}

export interface TakeCheck {
  verdict: Verdict;
  /** 작은 목소리 보정(0~+12dB). 큰 목소리는 줄이지 않고 합성의 압축·리미터가 맡는다. */
  gainDb: number;
  peak: number;
  speechSeconds: number;
  /** 말 시작·마지막 말소리 끝(초, 녹음 시작 기준). 말소리가 없으면 -1 */
  firstSpeech: number;
  lastSpeech: number;
  /** 영화에 넣을 구간(초, 녹음 시작 기준) — 말 시작 PREROLL 앞부터 끝 TAIL 뒤까지, 목소리 칸 길이 안 */
  start: number;
  end: number;
}

const toDb = (x: number) => 20 * Math.log10(x);

/**
 * 녹음이 끝난 뒤 실제 소리로 판정하고 영화에 넣을 구간을 정한다.
 * voiceWindow: 장면의 목소리 칸(초) · liveCut: 녹음 중에 발화 상한에 닿았는데 말하고 있었는가
 */
export function checkTake(samples: ArrayLike<number>, sampleRate: number, voiceWindow: number, liveCut = false): TakeCheck {
  const levels = frameLevels(samples, sampleRate);
  const duration = samples.length / sampleRate;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const maxSpeech = maxSpeechFor(voiceWindow);
  const tracker = createVoiceTracker(maxSpeech);
  // 소음 바닥은 녹음 전체로 잰다 — 말끝마다 0.6초 넘게 조용한 칸이 남으므로, 첫 칸부터 소음이 있어도 바닥을 안다
  for (const level of levels) tracker.prime(level);
  let cut = false;
  for (const [i, level] of levels.entries()) {
    const step = tracker.push(level, (i + 1) * FRAME_SECONDS);
    if (step === 'stop-cut') cut = true;
    if (step !== 'continue') break;
  }
  const { onset, lastActive, threshold } = tracker;
  const speech = onset < 0 ? [] : levels.slice(onset, lastActive + 1).filter((l) => l >= threshold);
  const speechSeconds = speech.length * FRAME_SECONDS;
  const firstSpeech = onset < 0 ? -1 : onset * FRAME_SECONDS;
  const lastSpeech = onset < 0 ? -1 : (lastActive + 1) * FRAME_SECONDS;
  const speechLevel = rms(speech);
  const floor = noiseFloor(levels);
  const noiseRoom = floor > 0 ? Math.max(0, toDb(NOISE_CEILING / floor)) : MAX_GAIN_DB;
  const gainDb = speech.length ? Math.round(Math.min(Math.max(0, toDb(TARGET_SPEECH / speechLevel)), MAX_GAIN_DB, noiseRoom) * 10) / 10 : 0;
  const start = onset < 0 ? 0 : Math.max(0, firstSpeech - PREROLL_SECONDS);
  const end = onset < 0 ? 0 : Math.min(duration, lastSpeech + TAIL_SECONDS, start + voiceWindow);
  const verdict: Verdict =
    duration < MIN_TAKE_SECONDS ? 'short'
      : peak < SILENT_PEAK || onset < 0 || speechSeconds < MIN_SPEECH_SECONDS ? 'silent'
        : liveCut || cut || lastSpeech > end ? 'cut'
          : spokeFromStart(levels, threshold, speechLevel) ? 'early'
            : speechLevel < QUIET_SPEECH ? 'quiet'
              : 'ok';
  return { verdict, gainDb, peak, speechSeconds, firstSpeech, lastSpeech, start: round(start), end: round(end) };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/**
 * 신호보다 먼저 말했는가 — 녹음 첫 0.1초 내내 말소리가 이어지고 그 크기가 이 녹음 목소리의 절반 이상이면, 녹음이 켜지기 전부터 말하던 것이다.
 * 첫 순간의 딸깍 소리나 짧은 «삐», 작은 주변 소리는 여기에 들지 않는다(아이 반응은 신호 뒤 0.2초보다 늦다).
 */
function spokeFromStart(levels: readonly number[], thr: number, speechLevel: number): boolean {
  const head = levels.slice(0, Math.round(EARLY_SECONDS / FRAME_SECONDS));
  return head.length > 0 && head.every((l) => l >= thr) && rms(head) >= speechLevel * 0.5;
}
