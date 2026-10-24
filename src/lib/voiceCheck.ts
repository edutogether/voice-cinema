// 녹음의 말소리 판단 — DOM·오디오 API 없이 숫자만 보는 순수 함수다(src/lib/voiceCheck.test.ts).
// 녹음 중에는 20ms마다 잰 음량으로 «3.0초에 말이 이어지는가»를 정하고(liveDecision), 녹음이 끝나면 디코딩한
// 실제 소리로 무음·잘림·작은 목소리를 가리고 보정 음량을 정한다(checkTake).
//
// 문턱은 «소음 바닥 × 2.5»와 절대 하한(−56dBFS) 중 큰 쪽이다. 아이의 속삭임·높은 목소리를 무음으로 잘못 보지 않게
// 문턱을 낮게 두고, 판단이 틀릴 때는 더 녹음하는 쪽(0.5초 더 기다림)으로 틀리게 한다 — 말을 자르는 것보다 낫다.
import { RECORD_BASE_SECONDS, RECORD_MAX_SECONDS } from '../config';

export const FRAME_SECONDS = 0.02;
const ABS_SPEECH = 0.0015; // −56.5dBFS
const SNR = 2.5; // 소음 바닥보다 +8dB
/** 3.0초부터는 이만큼 조용해야 말이 끝난 것으로 본다(끝소리가 사그라드는 몫까지 담긴다). */
const TAIL_QUIET_SECONDS = 0.25;
/** 3.5초에 이 안에 말소리가 있으면 끝이 잘렸을 수 있다. */
const CUT_SECONDS = 0.15;
const SILENT_PEAK = 0.001; // −60dBFS — 마이크에서 아무것도 안 들어왔다
const NO_VOICE_PEAK = 0.0056; // −45dBFS
const MIN_SPEECH_SECONDS = 0.1;
const QUIET_SPEECH = 0.0056; // −45dBFS
const MIN_TAKE_SECONDS = 1;
const EARLY_SECONDS = 0.1;
const TARGET_SPEECH = 0.1; // −20dBFS — 목소리 칸의 원판 소리(평균 −29~−41dBFS)보다 9dB 이상 크게
const MAX_GAIN_DB = 12;
const NOISE_CEILING = 0.00316; // −50dBFS — 보정하더라도 주변 소음이 이보다 커지지 않게

export type LiveStep = 'continue' | 'stop' | 'stop-cut';
/** ok 그대로 · quiet·cut·early 들어 보고 판단(저장 가능) · silent·short 다시 녹음(저장 못 함) */
export type Verdict = 'ok' | 'quiet' | 'cut' | 'early' | 'silent' | 'short';

export interface TakeCheck {
  verdict: Verdict;
  /** 작은 목소리 보정(0~+12dB). 큰 목소리는 줄이지 않고 합성의 압축·리미터가 맡는다. */
  gainDb: number;
  peak: number;
  speechSeconds: number;
  /** 첫·끝 말소리 시각(초, 녹음 시작 기준). 말소리가 없으면 -1 */
  firstSpeech: number;
  lastSpeech: number;
}

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

/** 소음 바닥 — 가장 조용한 10% 음량. 말 사이 숨 고르는 틈이 여기에 든다. */
export function noiseFloor(levels: readonly number[]): number {
  if (!levels.length) return 0;
  const sorted = [...levels].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.1)];
}

export const speechThreshold = (floor: number) => Math.max(ABS_SPEECH, floor * SNR);

const spoke = (levels: readonly number[], thr: number, seconds: number) =>
  levels.slice(-Math.max(1, Math.round(seconds / FRAME_SECONDS))).some((l) => l >= thr);

/**
 * 녹음 중 판단. 3.0초 전에는 계속, 3.0초부터는 0.25초 조용하면 멈추고, 3.5초에서는 무조건 멈춘다(그때 말소리가 있으면 잘림).
 * 음량을 하나도 못 읽으면(오디오가 멈춘 기기 등) 판단할 수 없으므로 3.5초를 다 녹음한다.
 */
export function liveDecision(levels: readonly number[], elapsed: number): LiveStep {
  if (!levels.some((l) => l > 0)) return elapsed >= RECORD_MAX_SECONDS ? 'stop' : 'continue';
  const thr = speechThreshold(noiseFloor(levels));
  if (elapsed >= RECORD_MAX_SECONDS) return spoke(levels, thr, CUT_SECONDS) ? 'stop-cut' : 'stop';
  if (elapsed < RECORD_BASE_SECONDS) return 'continue';
  return spoke(levels, thr, TAIL_QUIET_SECONDS) ? 'continue' : 'stop';
}

const toDb = (x: number) => 20 * Math.log10(x);

/**
 * 신호보다 먼저 말했는가 — 녹음 첫 0.1초 내내 말소리가 이어지고 그 크기가 이 녹음 목소리의 절반 이상이면, 녹음이 켜지기 전부터 말하던 것이다.
 * 첫 순간의 딸깍 소리나 짧은 «삐», 작은 주변 소리는 여기에 들지 않는다(아이 반응은 신호 뒤 0.2초보다 늦다).
 */
function spokeFromStart(levels: readonly number[], thr: number, speechLevel: number): boolean {
  const head = levels.slice(0, Math.round(EARLY_SECONDS / FRAME_SECONDS));
  return head.length > 0 && head.every((l) => l >= thr) && rms(head) >= speechLevel * 0.5;
}

/** 녹음이 끝난 뒤 실제 소리로 판정한다. reachedMax: 3.5초까지 녹음했는가 */
export function checkTake(samples: ArrayLike<number>, sampleRate: number, reachedMax: boolean): TakeCheck {
  const levels = frameLevels(samples, sampleRate);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const floor = noiseFloor(levels);
  const thr = speechThreshold(floor);
  const speech = levels.map((l, i) => [l, i] as const).filter(([l]) => l >= thr);
  const speechSeconds = speech.length * FRAME_SECONDS;
  const firstSpeech = speech.length ? speech[0][1] * FRAME_SECONDS : -1;
  const lastSpeech = speech.length ? (speech[speech.length - 1][1] + 1) * FRAME_SECONDS : -1;
  const speechLevel = rms(speech.map(([l]) => l));
  const noiseRoom = floor > 0 ? Math.max(0, toDb(NOISE_CEILING / floor)) : MAX_GAIN_DB;
  const gainDb = speech.length ? Math.round(Math.min(Math.max(0, toDb(TARGET_SPEECH / speechLevel)), MAX_GAIN_DB, noiseRoom) * 10) / 10 : 0;
  const result = { gainDb, peak, speechSeconds, firstSpeech, lastSpeech };
  const duration = samples.length / sampleRate;
  const verdict: Verdict =
    duration < MIN_TAKE_SECONDS ? 'short'
      : peak < SILENT_PEAK ? 'silent'
        : speechSeconds < MIN_SPEECH_SECONDS ? (peak < NO_VOICE_PEAK ? 'silent' : 'quiet')
          : reachedMax && lastSpeech > duration - CUT_SECONDS ? 'cut'
            : spokeFromStart(levels, thr, speechLevel) ? 'early'
              : speechLevel < QUIET_SPEECH ? 'quiet'
                : 'ok';
  return { verdict, ...result };
}
