import { describe, expect, test } from 'vitest';
import { mixFilter, voiceFilter, type VoicePlan } from './ffmpeg';

// 합성 필터 글자(src/lib/ffmpeg.ts) — 엔진에서 실측으로 정한 값과 순서를 고정한다(11/2 종합감사: 계약 시험의 리미터 정규식과 E2E 수치에만 기대고 있었다).
// 소리 자체는 E2E(dubbing-flow · recording-voice)가 엔진으로 잰다. 여기서는 그 값이 글자에서 빠지거나 순서가 바뀌는 것을 먼저 잡는다.

const plan = (over: Partial<VoicePlan> = {}): VoicePlan => ({ gainDb: 6, start: 0.12, end: 2.48, at: 0, fadeOut: 0.03, channels: 2, ...over });
const dbfs = (linear: number) => 20 * Math.log10(linear);
const steps = (filter: string) => filter.split(',').map((s) => s.split('=')[0]);

describe('voiceFilter — 녹음을 목소리 칸에 넣을 소리로', () => {
  test('채널은 pan으로 직접 평균 낸다 — 두 채널은 반씩, 한 채널은 그대로, 0이면 한 채널로 본다', () => {
    expect(voiceFilter(plan({ channels: 2 }))).toMatch(/^pan=mono\|c0=0\.5000\*c0\+0\.5000\*c1,/);
    expect(voiceFilter(plan({ channels: 1 }))).toMatch(/^pan=mono\|c0=1\.0000\*c0,/);
    expect(voiceFilter(plan({ channels: 0 }))).toMatch(/^pan=mono\|c0=1\.0000\*c0,/);
  });

  test('aformat=channel_layouts=mono를 쓰지 않는다 — 뒤에 필터를 이으면 두 채널을 더해 +3dB 커졌다', () => {
    expect(voiceFilter(plan())).not.toContain('aformat');
  });

  test('시각을 0부터 다시 센 뒤 자르고, 자른 뒤 다시 0부터 센다 — 웹엠 녹음의 밀린 시작 시각과 판정 시각이 어긋나지 않게', () => {
    expect(voiceFilter(plan({ start: 0.12, end: 2.48 }))).toContain('asetpts=PTS-STARTPTS,atrim=0.120:2.480,asetpts=PTS-STARTPTS,');
  });

  test('다듬는 순서: 채널 → 시각 → 자르기 → 48kHz → 90Hz 고역 → 보정 → 압축 → 리미터 → 페이드', () => {
    expect(steps(voiceFilter(plan()))).toEqual([
      'pan', 'asetpts', 'atrim', 'asetpts', 'aresample', 'highpass', 'volume', 'acompressor', 'alimiter', 'afade', 'afade',
    ]);
    expect(voiceFilter(plan())).toContain('aresample=48000,highpass=f=90,');
  });

  test('작은 목소리 보정은 소수 한 자리 dB로 그대로 싣는다', () => {
    expect(voiceFilter(plan({ gainDb: 0 }))).toContain('volume=0.0dB,');
    expect(voiceFilter(plan({ gainDb: 12 }))).toContain('volume=12.0dB,');
  });

  test('압축은 −18dBFS부터 3:1, 리미터는 −2dBFS에서 자동 레벨 끔 · 지연 보정 켬', () => {
    const f = voiceFilter(plan());
    const threshold = Number(f.match(/acompressor=threshold=([\d.]+):ratio=3:/)?.[1]);
    expect(dbfs(threshold)).toBeCloseTo(-18, 0);
    const limit = Number(f.match(/alimiter=limit=([\d.]+):/)?.[1]);
    expect(dbfs(limit)).toBeCloseTo(-2, 1);
    expect(f).toMatch(/alimiter=[^,]*:level=false:latency=true,/);
  });

  test('처음 5ms · 끝 fadeOut만 페이드 — 끝 페이드는 자른 구간의 끝에 붙는다', () => {
    const f = voiceFilter(plan({ start: 0.1, end: 2.6, fadeOut: 0.03 }));
    expect(f).toMatch(/afade=t=in:d=0\.005,afade=t=out:st=2\.470:d=0\.030$/);
  });

  test('구간이 끝 페이드보다 짧아도 페이드 시작이 음수가 되지 않는다', () => {
    expect(voiceFilter(plan({ start: 1, end: 1.01, fadeOut: 0.03 }))).toMatch(/afade=t=out:st=0\.000:d=0\.030$/);
  });
});

describe('mixFilter — 원판 소리에 목소리를 섞는다', () => {
  test('목소리를 at초(ms 반올림)만큼 늦춰 넣는다', () => {
    expect(mixFilter(5)).toContain('adelay=5000:all=1,');
    expect(mixFilter(4.8304)).toContain('adelay=4830:all=1,');
    expect(mixFilter(0)).toContain('adelay=0:all=1,');
  });

  test('한 채널 목소리는 두 채널에 그대로 복사한다 — amix에 맡기면 −3dB로 나눠 펼쳐 미리 듣기보다 작아졌다', () => {
    expect(mixFilter(5)).toMatch(/^\[1:a\]pan=stereo\|c0=c0\|c1=c0,/);
  });

  test('목소리 뒤를 무음으로 늘리고, 길이는 원판을 따르며 섞을 때 크기를 나누지 않는다', () => {
    const f = mixFilter(5);
    expect(f).toContain(',apad[voice];');
    expect(f).toContain('[0:a][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,');
  });

  test('원판 소리는 다시 낮추지 않는다 — 목소리 칸은 원판에 −8dB로 이미 구웠다', () => {
    expect(mixFilter(5)).not.toMatch(/\[0:a\][^;]*volume/);
  });

  test('섞은 뒤 −1dBFS에서 막는다 — 자동 레벨 끔 · 지연 보정 켬(빼면 원판 소리 전체가 5ms 밀린다)', () => {
    const f = mixFilter(5);
    const limit = Number(f.match(/alimiter=limit=([\d.]+):/)?.[1]);
    expect(dbfs(limit)).toBeCloseTo(-1, 1);
    expect(f).toMatch(/alimiter=limit=[\d.]+:level=false:latency=true\[a\]$/);
  });
});
