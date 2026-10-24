// 완성 mp4 검사 — 업로드를 가로채 받은 파일을 원판(합성용 원판)과 견준다.
//   상자(box) 읽기: 길이(mvhd), 소리 규격(mp4a), 영상 표본 크기(stsz) — 영상을 다시 인코딩하지 않았으면 표본 크기가 원판과 하나도 다르지 않다.
//   소리: 페이지 안에서 둘 다 풀어 빼면 목소리만 남는다(원판 소리를 건드리지 않았으면 목소리 칸 밖은 0에 가깝다).
import { readFileSync } from 'node:fs';

function boxes(buf, from, to) {
  const out = [];
  for (let at = from; at + 8 <= to;) {
    const size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    if (size < 8) break;
    out.push({ type, start: at + 8, end: at + size });
    at += size;
  }
  return out;
}
const child = (buf, box, type) => boxes(buf, box.start, box.end).find((b) => b.type === type);

/** 트랙별 정보: 종류(vide·soun), 표본 크기 목록, 소리 규격 */
export function tracks(buf) {
  const moov = boxes(buf, 0, buf.length).find((b) => b.type === 'moov');
  return boxes(buf, moov.start, moov.end).filter((b) => b.type === 'trak').map((trak) => {
    const mdia = child(buf, trak, 'mdia');
    const hdlr = child(buf, mdia, 'hdlr');
    const handler = buf.toString('latin1', hdlr.start + 8, hdlr.start + 12);
    const stbl = child(buf, child(buf, mdia, 'minf'), 'stbl');
    const stsz = child(buf, stbl, 'stsz');
    const fixed = buf.readUInt32BE(stsz.start + 4);
    const count = buf.readUInt32BE(stsz.start + 8);
    const sizes = fixed ? Array(count).fill(fixed) : Array.from({ length: count }, (_, i) => buf.readUInt32BE(stsz.start + 12 + i * 4));
    const stsd = child(buf, stbl, 'stsd');
    const entry = boxes(buf, stsd.start + 8, stsd.end)[0];
    const audio = entry.type === 'mp4a'
      ? { codec: 'mp4a', channels: buf.readUInt16BE(entry.start + 16), sampleRate: buf.readUInt32BE(entry.start + 24) >>> 16 } : null;
    return { handler, codec: entry.type, sizes, audio };
  });
}

/** mvhd 길이(초) */
export function duration(buf) {
  const moov = boxes(buf, 0, buf.length).find((b) => b.type === 'moov');
  const mvhd = child(buf, moov, 'mvhd');
  const v = buf[mvhd.start];
  return v === 1 ? Number(buf.readBigUInt64BE(mvhd.start + 24)) / buf.readUInt32BE(mvhd.start + 20) : buf.readUInt32BE(mvhd.start + 16) / buf.readUInt32BE(mvhd.start + 12);
}

export const originalClip = (genre) => readFileSync(`public/clips/final/${genre}.mp4`);

/** 지금 장면의 시간표(src/genres.ts의 live) — 새 장면 시험은 { pause: 7, window: 3 }을 넘긴다 */
export const LIVE_SCENE = { pause: 5, window: 3.5 };

/**
 * 페이지 안에서 완성본과 원판 소리를 풀어 빼고, 남은 소리(목소리)의 시작·끝·피크와 완성본 전체 피크·목소리 칸 밖에 남은 소리를 잰다.
 * 디코더가 앞머리(AAC 준비 표본)를 어떻게 다루든 두 파일이 같은 방식으로 풀리므로 빼기에는 영향이 없다 — 시각은 원판과의 어긋남을 찾아 맞춘다.
 */
export async function voiceInMovie(page, movieBase64, genre, freqs = [], scene = LIVE_SCENE) {
  return page.evaluate(async ({ movieBase64, genre, freqs, scene }) => {
    const ctx = new window.OfflineAudioContext(2, 48000 * 11, 48000);
    const bytes = Uint8Array.from(window.atob(movieBase64), (c) => c.charCodeAt(0));
    const movie = await ctx.decodeAudioData(bytes.buffer);
    const ref = await ctx.decodeAudioData(await (await window.fetch(`/clips/final/${genre}.mp4`, { cache: 'no-store' })).arrayBuffer());
    const mono = (b) => {
      const out = new Float32Array(b.length);
      for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += d[i] / b.numberOfChannels; }
      return out;
    };
    const m = mono(movie);
    const r = mono(ref);
    let peak = 0;
    for (let c = 0; c < movie.numberOfChannels; c++) for (const v of movie.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    const win = 240;
    const env = (sig) => {
      const out = [];
      for (let at = 0; at + win <= sig.length; at += win) { let s = 0; for (let i = at; i < at + win; i++) s += sig[i] * sig[i]; out.push(Math.sqrt(s / win)); }
      return out;
    };
    const res = new Float32Array(m.length);
    for (let i = 0; i < res.length; i++) res[i] = m[i] - (r[i] || 0);
    const e = env(res);
    const t = (i) => i * win / 48000;
    // 목소리는 정지 시각 0.1초 앞에 있을 수 없다 — 그 앞의 차이는 소리를 다시 인코딩한 차이다(대사가 큰 장면은 문턱을 넘기도 한다)
    const on = e.findIndex((x, i) => t(i) >= scene.pause - 0.1 && x >= 0.01);
    const off = e.length - 1 - [...e].reverse().findIndex((x) => x >= 0.01);
    let outside = 0;
    // 파일 첫 20ms는 뺀다 — 소리를 다시 인코딩하면 첫 프레임이 달라진다. 0초부터 큰 소리로 시작하는 시험 장면(220Hz 사인)에서
    // 0.000초 0.0078 · 0.005초 0.0061이 남았고 그 밖은 가장 커도 0.0021이었다(10/25, ffmpeg로 풀어 잼). 원판 소리를 낮췄는지와는 상관없는 자리다.
    e.forEach((x, i) => { if (t(i) >= 0.02 && (t(i) < scene.pause - 0.02 || t(i) > scene.pause + scene.window + 0.02)) outside = Math.max(outside, x); });
    let voicePeak = 0;
    for (const v of res) voicePeak = Math.max(voicePeak, Math.abs(v));
    // 목소리 높이별 세기(Goertzel) — 앞 녹음의 목소리가 섞였는지 본다
    const tone = (f) => {
      const k = 2 * Math.cos(2 * Math.PI * f / 48000);
      let s1 = 0, s2 = 0;
      for (let i = Math.round(scene.pause * 48000); i < Math.round((scene.pause + scene.window) * 48000); i++) { const s0 = res[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2) / (scene.window * 48000);
    };
    return { seconds: movie.duration, channels: movie.numberOfChannels, peak, voiceStart: on < 0 ? null : t(on), voiceEnd: on < 0 ? null : t(off + 1),
      voicePeak, outsideVoice: outside, tones: freqs.map(tone) };
  }, { movieBase64, genre, freqs, scene });
}

/**
 * 목소리가 놓인 자리 — 영화에 넣는 구간은 말 시작 0.12초 앞에서 시작하므로, 말소리는 정지 시각 + 0.12초 안팎(분석 칸 20ms만큼 늦을 수 있다)에서 들린다.
 * lead: 정지 시각에서 말소리까지 · lost: 녹음 안 말소리 길이와 영화 안 말소리 길이의 차이(앞·끝을 잃었으면 커진다)
 */
export const placement = (v, raw, scene = LIVE_SCENE) => ({
  lead: +(v.voiceStart - scene.pause).toFixed(4),
  lost: +((raw.end - raw.start) - (v.voiceEnd - v.voiceStart)).toFixed(4),
});
export const LEAD = { min: 0.105, max: 0.16 };
/**
 * 이 녹음에서 기대하는 앞 여백 — 말 시작이 녹음 파일 첫 0.12초 안이면 파일 처음부터 넣으므로 말 시작 그대로다
 * (부하로 녹음기가 늦게 켜지면 예약한 0.3초 말소리가 파일 0.085초에 담긴 적이 있다 — 10/25). 두 검출기(5ms 창)의 차이만 둔다.
 */
export const leadRange = (raw) => (raw.start >= 0.12 ? LEAD : { min: raw.start - 0.015, max: raw.start + 0.015 });
