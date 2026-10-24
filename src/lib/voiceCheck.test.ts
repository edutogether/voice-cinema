// 녹음 판단 유닛테스트 — 아이 목소리를 흉내 낸 소리(280Hz 배음 + 음절 떨림)로 말끝 감지·발화 상한·무음·잘림·넣을 구간·보정 음량을 본다.
import { describe, expect, test } from 'vitest';
import { checkTake, createVoiceTracker, frameLevels, maxSpeechFor } from './voiceCheck';

const RATE = 48000;
const LIVE = 3.5; // 지금 장면(5.0초 정지)의 목소리 칸
const NEXT = 3.0; // 새 장면(7.0초 정지)의 목소리 칸

type Part = { at: number; dur: number; amp?: number; fadeIn?: number };

/**
 * 아이 목소리 흉내: 280Hz와 배음, 1초에 4번 음절처럼 커졌다 작아진다.
 * parts로 말하는 구간을 여럿 줄 수 있다(«셋 ! … 날아라, 미르 !»). gaps면 단어 사이에 0.12초씩 쉰다. fadeIn이면 첫소리가 그만큼 서서히 커진다.
 */
function voice(seconds: number, { delay = 0.3, dur = 1.5, amp = 0.3, noise = 0, gaps = false, fadeIn = 0, parts }: {
  delay?: number; dur?: number; amp?: number; noise?: number; gaps?: boolean; fadeIn?: number; parts?: Part[];
} = {}) {
  const segments = parts ?? [{ at: delay, dur, amp, fadeIn }];
  const out = new Float32Array(Math.round(seconds * RATE));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    let s = noise * rand();
    for (const p of segments) {
      if (t < p.at || t >= p.at + p.dur) continue;
      const u = t - p.at;
      const syllable = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * u);
      const pause = gaps && u % 0.6 > 0.48 ? 0 : 1;
      const fade = p.fadeIn ? Math.min(1, u / p.fadeIn) : 1;
      s += (p.amp ?? amp) * fade * pause * syllable * (Math.sin(2 * Math.PI * 280 * t) + 0.5 * Math.sin(2 * Math.PI * 560 * t) + 0.25 * Math.sin(2 * Math.PI * 840 * t)) / 1.75;
    }
    out[i] = Math.max(-1, Math.min(1, s));
  }
  return out;
}

/**
 * 녹음 중 판단을 20ms마다 흉내 내 언제 멈추는지 본다(녹음기를 켠 때부터 잰 초).
 * 녹음기를 켜기 전 3·2·1 동안(3초) 들어온 소리로 소음 바닥을 먼저 잰다 — 앱과 같다. noise는 그 동안의 배경 소음 크기다.
 */
function liveStop(samples: Float32Array, window = LIVE, noise = 0) {
  const levels = frameLevels(samples, RATE);
  const tracker = createVoiceTracker(maxSpeechFor(window));
  for (const level of frameLevels(voice(3, { amp: 0, noise }), RATE)) tracker.prime(level);
  for (let n = 1; n <= levels.length; n++) {
    const step = tracker.push(levels[n - 1], n * 0.02);
    if (step !== 'continue') return { at: n * 0.02, step };
  }
  return { at: levels.length * 0.02, step: 'continue' as const };
}

describe('발화 상한 — 3초, 목소리 칸이 짧으면 앞뒤 여백(0.12 + 0.15초)을 뺀 만큼', () => {
  test('지금 장면(칸 3.5초)은 3초, 새 장면(칸 3.0초)은 2.73초', () => {
    expect(maxSpeechFor(LIVE)).toBe(3);
    expect(maxSpeechFor(NEXT)).toBe(2.73);
  });
});

describe('말끝 감지 — 말을 마치면 바로 끝난다', () => {
  for (const dur of [1, 1.5, 2]) {
    test(`${dur}초 발화(0.3초에 시작)는 말이 끝나고 0.6초 조용하면 멈춘다`, () => {
      const r = liveStop(voice(6, { dur }));
      expect(r.step).toBe('stop');
      expect(r.at).toBeGreaterThanOrEqual(0.3 + dur + 0.6 - 1e-9);
      expect(r.at).toBeLessThan(0.3 + dur + 0.66);
    });
  }
  test('첫 말이 짧으면(0.5초) 이어 말할 틈을 더 준다 — 0.9초 조용해야 멈춘다', () => {
    const r = liveStop(voice(6, { dur: 0.5 }));
    expect(r.step).toBe('stop');
    expect(r.at).toBeGreaterThanOrEqual(0.3 + 0.5 + 0.9 - 1e-9);
    expect(r.at).toBeLessThan(0.3 + 0.5 + 0.96);
  });
  test('«셋 !» 뒤 0.7초 쉬고 «날아라, 미르 !»를 이어 말해도 쉬는 동안 끝나지 않는다', () => {
    const samples = voice(6, { parts: [{ at: 0.3, dur: 0.35 }, { at: 1.35, dur: 1.4 }] });
    const r = liveStop(samples, NEXT);
    expect(r.at).toBeGreaterThan(2.75);
    const c = checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, NEXT);
    expect(c.verdict).toBe('ok');
    expect(c.start).toBeLessThan(0.3);
    expect(c.end).toBeGreaterThanOrEqual(2.75);
  });
  test('짧은 말 뒤 1초 넘게 쉬면 거기서 끝난다(기다림에도 끝이 있다)', () => {
    const r = liveStop(voice(6, { parts: [{ at: 0.3, dur: 0.35 }, { at: 1.75, dur: 1.4 }] }), NEXT);
    expect(r.step).toBe('stop');
    expect(r.at).toBeLessThan(1.75);
  });
  test('단어 사이에 0.12초씩 쉬어도 말 중간에 끝나지 않는다', () => {
    // 0.2초에 시작해 0.48초 말하고 0.12초 쉬기를 되풀이 — 마지막 소리는 2.48초에 끝난다
    const r = liveStop(voice(6, { delay: 0.2, dur: 2.28, gaps: true }));
    expect(r.step).toBe('stop');
    expect(r.at).toBeGreaterThanOrEqual(2.48 + 0.6 - 1e-9);
  });
  test('주변 소음(−45dBFS)이 녹음 첫 칸부터 이어져도 말 시작으로 보지 않고, 말이 끝나면 멈춘다', () => {
    const samples = voice(6, { dur: 1.5, noise: 0.0056 });
    const r = liveStop(samples, LIVE, 0.0056);
    expect(r.step).toBe('stop');
    expect(r.at).toBeGreaterThanOrEqual(0.3 + 1.5 + 0.6 - 1e-9);
    expect(r.at).toBeLessThan(0.3 + 1.5 + 0.7);
    const c = checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, LIVE);
    expect(c.verdict).toBe('ok');
    expect(c.firstSpeech).toBeCloseTo(0.3, 1);
  });
  test('시끄러운 곳(−36dBFS)에서도 외친 목소리는 찾는다(문턱이 −34dBFS를 넘지 않는다)', () => {
    const samples = voice(6, { dur: 1.5, amp: 0.3, noise: 0.016 });
    const r = liveStop(samples, LIVE, 0.016);
    expect(r.at).toBeGreaterThan(0.3 + 1.5);
    expect(checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, LIVE).firstSpeech).toBeCloseTo(0.3, 1);
  });
});

describe('발화 상한과 잘림', () => {
  test('2.7초 발화는 상한(3초) 전에 끝나 잘림이 아니다', () => {
    const samples = voice(6, { dur: 2.7 });
    const r = liveStop(samples);
    expect(r.step).toBe('stop');
    expect(r.at).toBeLessThanOrEqual(0.3 + 3 + 0.02);
    expect(checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, LIVE).verdict).toBe('ok');
  });
  test('상한 0.2초 전(2.8초 발화)에 끝나도 잘림이 아니다', () => {
    const samples = voice(6, { dur: 2.8 });
    const r = liveStop(samples);
    expect(r.step).toBe('stop');
    expect(checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, LIVE).verdict).toBe('ok');
  });
  test('3.0초 발화(상한을 꽉 채움)는 끝이 이어졌는지 알 수 없어 잘림으로 알린다', () => {
    expect(liveStop(voice(6, { dur: 3 })).step).toBe('stop-cut');
  });
  test('말 시작 뒤 3초에도 말하고 있으면 그때 멈추고 잘림으로 알린다', () => {
    const samples = voice(6, { delay: 0.2, dur: 4 });
    const r = liveStop(samples);
    expect(r).toEqual({ at: expect.closeTo(0.2 + 3, 1), step: 'stop-cut' });
    const c = checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, LIVE, true);
    expect(c.verdict).toBe('cut');
  });
  test('새 장면(칸 3.0초)은 2.73초에 멈추고, 넣을 구간은 칸을 넘지 않는다', () => {
    const samples = voice(6, { delay: 0.2, dur: 4 });
    const r = liveStop(samples, NEXT);
    expect(r).toEqual({ at: expect.closeTo(0.2 + 2.73, 1), step: 'stop-cut' });
    const c = checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, NEXT, true);
    expect(c.verdict).toBe('cut');
    expect(c.end - c.start).toBeLessThanOrEqual(NEXT);
  });
  test('녹음 뒤 판정만으로도(녹음 중 표시가 없어도) 상한까지 이어진 말은 잘림이다', () => {
    expect(checkTake(voice(4, { delay: 0.2, dur: 4 }), RATE, LIVE).verdict).toBe('cut');
  });
});

describe('늦게 말하는 아이·말하지 않는 아이', () => {
  test('신호 뒤 2초에 말해도 기다렸다가 다 담는다', () => {
    const samples = voice(6, { delay: 2, dur: 1.5 });
    const r = liveStop(samples);
    expect(r.step).toBe('stop');
    expect(r.at).toBeGreaterThanOrEqual(2 + 1.5 + 0.6);
    const c = checkTake(samples.subarray(0, Math.round(r.at * RATE)), RATE, LIVE);
    expect(c.verdict).toBe('ok');
    expect(c.firstSpeech).toBeCloseTo(2, 1);
  });
  test('기다림 끝(2.5초) 바로 그 칸에 말을 시작해도 놓치지 않는다', () => {
    const r = liveStop(voice(6, { delay: 2.48, dur: 1.5, noise: 0.0002 }));
    expect(r.step).toBe('stop');
    expect(r.at).toBeGreaterThan(2.48 + 1.5);
  });
  test('2.5초 안에 말이 시작되지 않으면 무음으로 멈춘다', () => {
    expect(liveStop(voice(6, { delay: 2.7, dur: 1.5, noise: 0.0002 }))).toEqual({ at: expect.closeTo(2.5, 2), step: 'stop-silent' });
  });
  test('음량을 하나도 읽지 못하면(오디오가 멈춘 기기) 판단하지 않고 기다림 + 상한까지 다 녹음한다', () => {
    expect(liveStop(new Float32Array(RATE * 7))).toEqual({ at: expect.closeTo(2.5 + 3, 1), step: 'stop' });
  });
});

describe('넣을 구간 — 첫소리를 지키고 앞의 기다림은 버린다', () => {
  for (const dur of [1, 1.5, 2, 2.7]) {
    test(`${dur}초 발화는 말 시작 0.12초 앞부터 끝 0.15초 뒤까지만 넣는다`, () => {
      const c = checkTake(voice(4, { delay: 0.6, dur }), RATE, LIVE);
      expect(c.verdict).toBe('ok');
      expect(c.firstSpeech).toBeCloseTo(0.6, 1);
      expect(c.start).toBeGreaterThanOrEqual(0.6 - 0.12 - 0.001);
      expect(c.start).toBeLessThanOrEqual(0.6 - 0.1);
      expect(Math.abs(c.end - c.start - (dur + 0.27))).toBeLessThan(0.05);
    });
  }
  test('서서히 커지는 첫소리(80ms)도 넣을 구간 안에서 시작한다', () => {
    const c = checkTake(voice(4, { delay: 1, dur: 1.5, amp: 0.05, fadeIn: 0.08 }), RATE, LIVE);
    expect(c.start).toBeLessThanOrEqual(1);
  });
  test('신호보다 늦게(1.2초) 말하면 앞의 빈 소리 1초 남짓을 버린다', () => {
    const c = checkTake(voice(3, { delay: 1.2, dur: 1.5 }), RATE, LIVE);
    expect(c.verdict).toBe('ok');
    expect(c.start).toBeGreaterThan(1.05);
  });
});

describe('녹음 판정', () => {
  test('완전 무음은 다시 녹음(저장 못 함)', () => {
    expect(checkTake(new Float32Array(RATE * 3), RATE, LIVE).verdict).toBe('silent');
  });
  test('말소리 없이 아주 작은 주변 소리(−55dBFS)만 있으면 다시 녹음', () => {
    expect(checkTake(voice(3, { amp: 0, noise: 0.0018 }), RATE, LIVE).verdict).toBe('silent');
  });
  test('속삭임처럼 작은 목소리(−38dBFS)는 무음으로 보지 않고, 정해진 만큼(+12dB 이하) 키운다', () => {
    const c = checkTake(voice(3, { dur: 1.5, amp: 0.02 }), RATE, LIVE);
    expect(['ok', 'quiet']).toContain(c.verdict);
    expect(c.gainDb).toBeGreaterThan(6);
    expect(c.gainDb).toBeLessThanOrEqual(12);
  });
  test('아주 작은 목소리(−52dBFS)도 무음으로 버리지 않고 «작게 담겼어요»로 들어 보게 한다', () => {
    const c = checkTake(voice(3, { dur: 1.5, amp: 0.004 }), RATE, LIVE);
    expect(c.verdict).toBe('quiet');
    expect(c.gainDb).toBe(12);
  });
  test('크게 외친 목소리(찢어진 소리)는 정상이고 키우지 않는다', () => {
    const c = checkTake(voice(3, { dur: 2, amp: 1.6 }), RATE, LIVE);
    expect(c.verdict).toBe('ok');
    expect(c.gainDb).toBe(0);
    expect(c.peak).toBe(1);
  });
  test('주변 소음이 큰 곳(−40dBFS)에서도 말소리를 찾고, 소음을 키우지 않게 보정을 줄인다', () => {
    const quietRoom = checkTake(voice(3, { dur: 1.5, amp: 0.06 }), RATE, LIVE);
    const noisyRoom = checkTake(voice(3, { dur: 1.5, amp: 0.06, noise: 0.01 }), RATE, LIVE);
    expect(noisyRoom.verdict).not.toBe('silent');
    expect(noisyRoom.firstSpeech).toBeCloseTo(0.3, 1);
    expect(noisyRoom.gainDb).toBeLessThan(quietRoom.gainDb);
  });
  test('녹음 첫 순간부터 말소리가 크면 «신호보다 먼저 말함»', () => {
    expect(checkTake(voice(3, { delay: 0, dur: 2 }), RATE, LIVE).verdict).toBe('early');
  });
  test('녹음 첫 순간의 짧은 딸깍·«삐»(40ms)는 «먼저 말함»으로 보지 않는다', () => {
    const samples = voice(3, { delay: 0.5, dur: 1.5 });
    for (let i = 0; i < 0.04 * RATE; i++) samples[i] = 0.3 * Math.sin(2 * Math.PI * 1000 * i / RATE);
    expect(checkTake(samples, RATE, LIVE).verdict).toBe('ok');
  });
  test('1초도 안 되는 녹음은 다시 녹음', () => {
    expect(checkTake(voice(0.5, { delay: 0.1, dur: 0.3 }), RATE, LIVE).verdict).toBe('short');
  });
});
