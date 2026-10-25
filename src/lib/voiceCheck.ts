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
/**
 * 녹음 중: 말이 발화 상한을 넘어 이만큼 지나서도 말소리면 잘림으로 보고 멈춘다 — 측정 창(분석기 약 43ms + 칸 20ms)에는 지난 소리가 남아,
 * 상한 직전에 끝난 말의 끝소리가 상한 뒤 한두 칸에 잡힐 수 있어서다.
 */
const OVER_SECONDS = 0.08;
/**
 * 녹음 뒤 판정: 잰 말 길이가 상한보다 이만큼 넘게 길면 잘림(저장 못 함 → 다시 녹음). 잰 길이는 말 시작·끝 칸 경계 때문에 실제보다
 * 최대 두 칸(40ms) 길다 — 정확히 3.000초 말한 녹음을 잘림으로 보지 않게 그만큼 둔다.
 */
const CUT_OVER_SECONDS = 0.04;
/** 마지막 말소리 뒤 끝 페이드(딸깍 소리 막기) — 끝 여백이 이보다 짧으면 여백만큼만, 그래도 5ms는 둔다 */
const FADE_OUT_SECONDS = 0.03;
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
/**
 * ok 그대로 · quiet·edge·early 들어 보고 판단(저장 가능) · cut·silent·short 다시 녹음(저장 못 함).
 * cut은 3초 상한을 넘어 말이 이어진 것(마지막 음절이 잘린다 — 10/26 대표님 «정상 완성으로 치지 않고 재녹음»). edge는 잘리지 않았지만
 * 상한에 닿게 말해 말끝이 영화 끝에 붙었거나 말 시작이 정지 시각 앞으로 조금 당겨진 것 — 판단이 애매해 아이가 들어 보고 정한다.
 */
export type Verdict = 'ok' | 'quiet' | 'edge' | 'cut' | 'early' | 'silent' | 'short';

/**
 * 발화 상한 — 실제로 말할 수 있는 시간 3.000초(목소리 칸이 그보다 짧으면 칸 길이). 앞뒤 여백을 빼지 않는다(10/26 대표님 FINAL 7.0S —
 * 전에는 칸 3.0초에서 2.73초였다). 말이 길면 앞 여백은 정지 시각 앞(영화가 움직이던 마지막 0.12초)에 놓고 끝 여백은 칸 끝에서 줄인다(checkTake의 at).
 */
export const maxSpeechFor = (voiceWindow: number) => Math.min(MAX_SPEECH_SECONDS, voiceWindow);

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
 *   말 시작 뒤: 마지막 말소리 뒤 말끝 시간(첫 말이 짧으면 더 길게)만큼 조용하면 stop, 말이 발화 상한을 넘어 이어지면 stop-cut
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
      const spoken = lastActiveElapsed - onsetElapsed;
      // 상한을 넘어서도 말소리가 이어지면 잘림 — 바로 멈춘다. 상한 전에 끝난 말은 아래 말끝 시간만큼만 더 듣는다(무한정 기다리지 않는다)
      if (spoken > maxSpeech + OVER_SECONDS + EPS) return 'stop-cut';
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
  /** 영화에 넣을 구간(초, 녹음 시작 기준) — 말 시작 PREROLL 앞부터 마지막 말소리 뒤 끝 여백까지 */
  start: number;
  end: number;
  /**
   * 그 구간을 영화의 어디에 놓나 — 정지 시각에서 구간 시작까지(초, 0 이하). 0이면 지금처럼 정지 시각에 놓여 말소리가 정지 + 0.12초에 들리고,
   * 말이 길어 칸이 모자라면 앞 여백을 정지 시각 앞으로 당겨(최대 −0.12초) 말 시작이 정지 시각에 닿는다. 구간 끝은 언제나 칸 끝(10.0초) 안이다.
   */
  at: number;
  /** 구간 끝 페이드 길이(초) — 마지막 말소리 뒤 여백 안 */
  fadeOut: number;
}

const toDb = (x: number) => 20 * Math.log10(x);

/**
 * 녹음이 끝난 뒤 실제 소리로 판정하고 영화에 넣을 구간을 정한다.
 * voiceWindow: 장면의 목소리 칸(초) · liveCut: 녹음 중에 말이 발화 상한을 넘어 이어져 녹음을 멈췄는가(stop-cut)
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
  for (const [i, level] of levels.entries()) {
    if (tracker.push(level, (i + 1) * FRAME_SECONDS) !== 'continue') break;
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
  // 배치 — 구간은 정지 시각 + at에 놓이고 칸 끝(정지 + voiceWindow)을 넘지 않는다. 마지막 말소리는 자르지 않는다:
  // 칸이 모자라면 ① 앞 여백을 정지 시각 앞(영화가 움직이던 끝)으로 당기고 ② 끝 여백을 줄이고 ③ 그래도 넘치면(상한 경계 — 잰 말 길이는
  // 앞뒤 칸 경계 때문에 실제보다 최대 두 칸 길다) 말 시작을 정지 시각 앞으로 조금(최대 CUT_OVER) 당긴다. 그보다 긴 말은 잘림 판정이라 저장되지 않는다.
  const span = onset < 0 ? 0 : lastSpeech - firstSpeech;
  const start = onset < 0 ? 0 : Math.max(0, firstSpeech - PREROLL_SECONDS);
  const pre = firstSpeech - start;
  const full = onset < 0 ? 0 : Math.min(duration, lastSpeech + TAIL_SECONDS);
  let end = full;
  let at = Math.min(0, voiceWindow - (full - start));
  if (at < -pre) {
    end = Math.max(lastSpeech, Math.min(full, start + pre + voiceWindow));
    at = Math.max(-pre - CUT_OVER_SECONDS, Math.min(-pre, voiceWindow - (end - start)));
    end = Math.min(end, start + voiceWindow - at);
  }
  const fadeOut = Math.min(FADE_OUT_SECONDS, Math.max(0.005, end - lastSpeech));
  const verdict: Verdict =
    duration < MIN_TAKE_SECONDS ? 'short'
      : peak < SILENT_PEAK || onset < 0 || speechSeconds < MIN_SPEECH_SECONDS ? 'silent'
        : liveCut || span > maxSpeech + CUT_OVER_SECONDS ? 'cut'
          : end - lastSpeech < FADE_OUT_SECONDS - EPS || at + pre < -EPS ? 'edge'
          : spokeFromStart(levels, threshold, speechLevel) ? 'early'
            : speechLevel < QUIET_SPEECH ? 'quiet'
              : 'ok';
  return { verdict, gainDb, peak, speechSeconds, firstSpeech, lastSpeech, start: round(start), end: round(end), at: round(at), fadeOut: round(fadeOut) };
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
