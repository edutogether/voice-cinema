// 녹음 판단 유닛테스트 — 아이 목소리를 흉내 낸 소리(280Hz 배음 + 음절 떨림)로 녹음 길이·무음·잘림·보정 음량을 본다.
import { describe, expect, test } from 'vitest';
import { checkTake, frameLevels, liveDecision } from './voiceCheck';

const RATE = 48000;

/** 아이 목소리 흉내: 280Hz와 배음, 1초에 4번 음절처럼 커졌다 작아진다. gaps를 주면 단어 사이에 0.12초씩 쉰다. */
function voice(seconds: number, { delay = 0.3, dur = 1.5, amp = 0.3, noise = 0, gaps = false } = {}) {
  const out = new Float32Array(Math.round(seconds * RATE));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    let s = noise * rand();
    if (t >= delay && t < delay + dur) {
      const u = t - delay;
      const syllable = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * u);
      const pause = gaps && u % 0.6 > 0.48 ? 0 : 1;
      s += amp * pause * syllable * (Math.sin(2 * Math.PI * 280 * t) + 0.5 * Math.sin(2 * Math.PI * 560 * t) + 0.25 * Math.sin(2 * Math.PI * 840 * t)) / 1.75;
    }
    out[i] = Math.max(-1, Math.min(1, s));
  }
  return out;
}

/** 녹음 중 판단을 20ms마다 흉내 내 언제 멈추는지 본다 */
function liveStop(samples: Float32Array) {
  const levels = frameLevels(samples, RATE);
  for (let n = 1; n <= levels.length; n++) {
    const step = liveDecision(levels.slice(0, n), n * 0.02);
    if (step !== 'continue') return { at: n * 0.02, step };
  }
  return { at: levels.length * 0.02, step: 'continue' as const };
}

describe('녹음 길이: 기본 3.0초, 말이 이어지면 3.5초까지', () => {
  for (const dur of [1, 1.5, 2]) {
    test(`${dur}초 발화(0.3초에 시작)는 3.0초에 멈춘다`, () => {
      const r = liveStop(voice(4, { dur }));
      expect(r.step).toBe('stop');
      expect(r.at).toBeCloseTo(3, 1);
    });
  }
  test('2.7초 발화(0.3~3.0초)는 3.0초에 말이 이어지는 것으로 보고 늘린 뒤, 끝나고 0.25초 조용하면 멈춘다', () => {
    const r = liveStop(voice(4, { dur: 2.7 }));
    expect(r.step).toBe('stop');
    expect(r.at).toBeGreaterThan(3.2);
    expect(r.at).toBeLessThan(3.32);
  });
  test('3초 앞뒤로 끝나는 발화(2.9초·3.1초에 끝)는 끝을 담고 멈춘다', () => {
    for (const end of [2.9, 3.1]) {
      const r = liveStop(voice(4, { delay: 0.1, dur: end - 0.1 }));
      expect(r.step).toBe('stop');
      expect(r.at).toBeGreaterThanOrEqual(end + 0.2);
      expect(r.at).toBeLessThan(Math.min(3.5, end + 0.32) + 0.001);
    }
  });
  test('3.0초 넘어 3.3초에 끝나는 발화는 3.5초까지 담고 잘림으로 보지 않는다', () => {
    const r = liveStop(voice(4, { delay: 0.2, dur: 3.1 }));
    expect(r.at).toBeCloseTo(3.5, 1);
    expect(r.step).toBe('stop');
  });
  test('3.5초에도 말이 이어지면 잘림으로 알린다', () => {
    expect(liveStop(voice(4.5, { delay: 0.2, dur: 4 }))).toEqual({ at: expect.closeTo(3.5, 1), step: 'stop-cut' });
  });
  test('단어 사이에 0.12초 쉬어도 3.0초에 말 중간이면 멈추지 않는다', () => {
    const r = liveStop(voice(4.5, { delay: 0.2, dur: 3.2, gaps: true }));
    expect(r.at).toBeGreaterThan(3.3);
  });
  test('음량을 하나도 읽지 못하면(오디오가 멈춘 기기) 판단하지 않고 3.5초를 다 녹음한다', () => {
    expect(liveStop(new Float32Array(RATE * 4))).toEqual({ at: expect.closeTo(3.5, 1), step: 'stop' });
  });
  test('주변 소음(−45dBFS)이 계속돼도 말이 끝나면 3.0초에 멈춘다', () => {
    const r = liveStop(voice(4, { dur: 1.5, noise: 0.0056 }));
    expect(r).toEqual({ at: expect.closeTo(3, 1), step: 'stop' });
  });
});

describe('녹음 판정', () => {
  for (const dur of [1, 1.5, 2, 2.7]) {
    test(`${dur}초 발화는 정상이고 시작·끝 시각을 안다`, () => {
      const c = checkTake(voice(3, { dur: Math.min(dur, 2.7) }), RATE, false);
      expect(c.verdict).toBe('ok');
      expect(c.firstSpeech).toBeCloseTo(0.3, 1);
      expect(Math.abs(c.lastSpeech - (0.3 + dur))).toBeLessThan(0.06);
    });
  }
  test('완전 무음은 다시 녹음(저장 못 함)', () => {
    expect(checkTake(new Float32Array(RATE * 3), RATE, false).verdict).toBe('silent');
  });
  test('말소리 없이 아주 작은 주변 소리(−55dBFS)만 있으면 다시 녹음', () => {
    expect(checkTake(voice(3, { amp: 0, noise: 0.0018 }), RATE, false).verdict).toBe('silent');
  });
  test('속삭임처럼 작은 목소리(−38dBFS)는 무음으로 보지 않고, 정해진 만큼(+12dB 이하) 키운다', () => {
    const c = checkTake(voice(3, { dur: 1.5, amp: 0.02 }), RATE, false);
    expect(['ok', 'quiet']).toContain(c.verdict);
    expect(c.gainDb).toBeGreaterThan(6);
    expect(c.gainDb).toBeLessThanOrEqual(12);
  });
  test('아주 작은 목소리(−52dBFS)도 무음으로 버리지 않고 «작게 담겼어요»로 들어 보게 한다', () => {
    const c = checkTake(voice(3, { dur: 1.5, amp: 0.004 }), RATE, false);
    expect(c.verdict).toBe('quiet');
    expect(c.gainDb).toBe(12);
  });
  test('크게 외친 목소리(찢어진 소리)는 정상이고 키우지 않는다', () => {
    const c = checkTake(voice(3, { dur: 2, amp: 1.6 }), RATE, false);
    expect(c.verdict).toBe('ok');
    expect(c.gainDb).toBe(0);
    expect(c.peak).toBe(1);
  });
  test('주변 소음이 큰 곳(−40dBFS)에서는 작은 목소리라도 소음을 키우지 않게 보정을 줄인다', () => {
    const quietRoom = checkTake(voice(3, { dur: 1.5, amp: 0.03 }), RATE, false);
    const noisyRoom = checkTake(voice(3, { dur: 1.5, amp: 0.03, noise: 0.01 }), RATE, false);
    expect(noisyRoom.gainDb).toBeLessThan(quietRoom.gainDb);
  });
  test('3.5초까지 말이 이어진 녹음은 «잘렸을 수 있음»', () => {
    expect(checkTake(voice(3.5, { delay: 0.2, dur: 4 }), RATE, true).verdict).toBe('cut');
  });
  test('3.5초까지 녹음했어도 끝에서 말이 끝났으면 정상', () => {
    expect(checkTake(voice(3.5, { delay: 0.2, dur: 3.05 }), RATE, true).verdict).toBe('ok');
  });
  test('녹음 첫 순간부터 말소리가 크면 «신호보다 먼저 말함»', () => {
    expect(checkTake(voice(3, { delay: 0, dur: 2 }), RATE, false).verdict).toBe('early');
  });
  test('녹음 첫 순간의 짧은 딸깍·«삐»(40ms)는 «먼저 말함»으로 보지 않는다', () => {
    const samples = voice(3, { delay: 0.5, dur: 1.5 });
    for (let i = 0; i < 0.04 * RATE; i++) samples[i] = 0.3 * Math.sin(2 * Math.PI * 1000 * i / RATE);
    expect(checkTake(samples, RATE, false).verdict).toBe('ok');
  });
  test('신호보다 늦게(1.2초) 말해도 정상이고 앞의 빈 소리는 그대로 둔다', () => {
    const c = checkTake(voice(3, { delay: 1.2, dur: 1.5 }), RATE, false);
    expect(c.verdict).toBe('ok');
    expect(c.firstSpeech).toBeCloseTo(1.2, 1);
  });
  test('1초도 안 되는 녹음은 다시 녹음', () => {
    expect(checkTake(voice(0.5, { delay: 0.1, dur: 0.3 }), RATE, false).verdict).toBe('short');
  });
});
