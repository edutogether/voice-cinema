import { ENGINE_WASM_BYTES, PAUSE_SECONDS, VOICE_WINDOW_SECONDS } from '../config';
import { finalClipUrl } from '../genres';
import { pickAudioExtension, progressPercent } from '../logic';
import { loadFFmpegModule, loadFFmpegUtil, type FFmpegInstance } from './vendor';

// @ffmpeg/util의 toBlobURL(progress=true)은 스트림 리더가 도중에 실패하면 이미 읽은
// Response.body를 다시 arrayBuffer()로 읽으려다 "body stream already read" 오류를
// 낸다(라이브에서 재현 확인됨). 그 경로를 피해 직접 fetch + 진행률을 구현한다.
// 진행률은 받은(압축을 푼) 바이트로만 알린다 — Content-Length는 압축된 크기라 분모로 쓰면 100%를 넘는다(10/20).
async function toBlobURLWithProgress(
  url: string,
  mimeType: string,
  onProgress?: (received: number) => void
): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`엔진 파일 다운로드 실패: ${resp.status} ${url}`);
  if (!resp.body) {
    return URL.createObjectURL(new Blob([await resp.arrayBuffer()], { type: mimeType }));
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received);
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: mimeType }));
}

let engine: FFmpegInstance | null = null;
let loading: Promise<FFmpegInstance> | null = null;

/** 엔진(31MB)을 한 번만 받아 재사용한다. 첫 저장 전에 미리 백그라운드로 준비해 둔다. */
export function loadEngine(onProgress?: (percent: number) => void): Promise<FFmpegInstance> {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  loading = (async () => {
    const { FFmpeg } = await loadFFmpegModule();
    const inst = new FFmpeg();
    const coreURL = await toBlobURLWithProgress('/vendor/ffmpeg-core/ffmpeg-core.js', 'text/javascript');
    const wasmURL = await toBlobURLWithProgress(
      '/vendor/ffmpeg-core/ffmpeg-core.wasm',
      'application/wasm',
      (received) => onProgress?.(progressPercent(received, ENGINE_WASM_BYTES))
    );
    await inst.load({ coreURL, wasmURL });
    engine = inst;
    return inst;
  })();
  loading.catch(() => {
    // 다음 저장 시도 때 다시 받을 수 있도록 실패한 약속은 버린다.
    loading = null;
  });
  return loading;
}

/** 엔진을 다 받아 바로 쓸 수 있는가 — 녹음실은 엔진을 기다리지 않는다(받는 중이면 저장할 때 처리한다). */
export const engineReady = () => engine !== null;

/** 녹음 하나의 목소리 처리 값 — 녹음 판정(src/lib/voiceCheck.ts)이 정한다. */
export interface VoicePlan {
  /** 작은 목소리 보정(0~+12dB) */
  gainDb: number;
  /** 녹음 길이(초, 목소리 칸 3.5초 이하) */
  seconds: number;
  /** 녹음의 채널 수 — 한 채널로 평균 낼 때 쓴다 */
  channels: number;
}

/**
 * 녹음을 목소리 칸에 넣을 소리로 다듬는다(10/24 대표님 — 미리 듣기와 완성본이 이 결과를 같이 쓴다).
 * 채널을 평균 내 한 채널 48kHz로 맞춰 → 90Hz 아래 웅웅거림을 걷고 → 작은 목소리만 정해진 만큼 키우고 → 큰 목소리는 부드럽게 눌러(3:1) →
 * −2dBFS에서 막는다. 리미터의 자동 레벨(`level`)은 FFmpeg 기본값이 켜짐이라 누른 소리를 다시 0dB 쪽으로 끌어올리므로 끄고,
 * 앞보기 지연(3ms)은 `latency`로 되돌려 목소리가 늦게 들어가지 않게 한다. 앞의 빈 소리는 자르지 않고(대표님 결정),
 * 처음 5ms·끝 30ms만 페이드로 딸깍 소리를 막는다. 자르는 자리는 녹음 길이가 아니라 목소리 칸 끝(3.5초)이다 — 웹엠 녹음은 시작 시각이
 * 몇 ms 밀려 있어 녹음 길이로 자르면 그만큼 끝이 잘린다(엔진에서 확인, 3.000초로 자르면 7.5ms가 빠졌다).
 * 채널 평균은 `pan`으로 직접 낸다 — `aformat=channel_layouts=mono` 뒤에 필터를 이으면 두 채널을 나누지 않고 더해 +3dB 커졌다(엔진에서 확인).
 */
export const voiceFilter = ({ gainDb, seconds, channels }: VoicePlan) =>
  `pan=mono|c0=${Array.from({ length: Math.max(1, channels) }, (_, c) => `${(1 / Math.max(1, channels)).toFixed(4)}*c${c}`).join('+')},` +
  'aresample=48000,highpass=f=90,' +
  `volume=${gainDb.toFixed(1)}dB,acompressor=threshold=0.125:ratio=3:attack=5:release=120,` +
  'alimiter=limit=0.794:attack=3:release=60:level=false:latency=true,' +
  `atrim=0:${VOICE_WINDOW_SECONDS},afade=t=in:d=0.005,afade=t=out:st=${Math.max(0, Math.min(seconds, VOICE_WINDOW_SECONDS) - 0.03).toFixed(3)}:d=0.03`;

/**
 * 원판(영상 + 상대 대사·배경음) 소리에 다듬은 목소리를 5.0초 자리에 섞는다(app-plan §2-4). 목소리는 3.5초 이하라
 * 언제나 5.0~8.5초 안에 들고, 완성본은 원판 길이(정확히 10.0초) 그대로다. 원판의 목소리 칸은 이미 −8dB 낮춰 구웠으므로
 * 여기서 더 낮추지 않는다. 섞은 뒤 −1dBFS에서 한 번 더 막아 찢어지지 않게 한다(자동 레벨 끔·지연 보정 — 위와 같은 까닭).
 * 한 채널 목소리는 두 채널로 그대로 복사해 섞는다 — amix에 맡기면 −3dB로 나눠 펼쳐, 한 채널을 양쪽에 그대로 내는 브라우저의
 * 미리 듣기보다 완성본 목소리가 3dB 작아진다(엔진에서 확인).
 */
export const MIX_FILTER =
  `[1:a]pan=stereo|c0=c0|c1=c0,adelay=${PAUSE_SECONDS * 1000}:all=1[voice];` +
  '[0:a][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,' +
  'alimiter=limit=0.891:level=false:latency=true[a]';

// 엔진 안 임시 파일 이름을 작업마다 다르게 한다 — 녹음실의 목소리 처리와 완성 화면의 합성이 겹쳐도 서로의 파일을 지우지 않는다.
let jobSeq = 0;

async function run(args: string[], inputs: [string, Uint8Array][], output: string, what: string): Promise<{ buffer: ArrayBuffer }> {
  const ff = await loadEngine();
  const files = [...inputs.map(([name]) => name), output];
  const log: string[] = [];
  const onLog = ({ message }: { message: string }) => log.push(message);
  ff.on('log', onLog);
  try {
    for (const [name, data] of inputs) await ff.writeFile(name, data);
    const code = await ff.exec(args);
    // exec()는 실패해도 예외를 던지지 않고 0이 아닌 코드만 반환한다 — 여기서 직접
    // 확인하지 않으면 readFile()에서 "FS error"라는 알아보기 힘든 에러로만 나타나
    // 진짜 원인(오디오 디코딩 실패 등)이 감춰진다.
    if (code !== 0) throw new Error(`${what} 실패\n` + log.slice(-8).join('\n'));
    return await ff.readFile(output);
  } finally {
    ff.off('log', onLog);
    await Promise.all(files.map((f) => ff.deleteFile(f).catch(() => {})));
  }
}

/**
 * 녹음을 손대지 않고 WAV로 푼다 — 브라우저가 자기 녹음을 풀지 못할 때(사파리 mp4 녹음 등) 녹음 검사가 쓰는 대체 경로다.
 * 채널 수는 그대로 둔다(판정이 채널 수를 다듬기에 넘긴다).
 */
export async function decodeTake(take: Blob, mime: string): Promise<Blob> {
  const { fetchFile } = await loadFFmpegUtil();
  const id = ++jobSeq;
  const input = `raw${id}.${pickAudioExtension(mime)}`;
  const output = `raw${id}.wav`;
  const data = await run(['-i', input, '-c:a', 'pcm_s16le', output], [[input, await fetchFile(take)]], output, '녹음 풀기');
  return new Blob([data.buffer], { type: 'audio/wav' });
}

/** 녹음(webm·mp4)을 다듬은 목소리(16비트 WAV)로 만든다. */
export async function processVoice(take: Blob, mime: string, plan: VoicePlan): Promise<Blob> {
  const { fetchFile } = await loadFFmpegUtil();
  const id = ++jobSeq;
  const input = `take${id}.${pickAudioExtension(mime)}`;
  const output = `voice${id}.wav`;
  const data = await run(['-i', input, '-af', voiceFilter(plan), '-c:a', 'pcm_s16le', output],
    [[input, await fetchFile(take)]], output, '목소리 처리');
  return new Blob([data.buffer], { type: 'audio/wav' });
}

/** 원판 영상 + 다듬은 목소리를 브라우저 안에서 합쳐 mp4로 만든다. */
export async function mergeClip(genreId: string, voice: Blob): Promise<Blob> {
  const { fetchFile } = await loadFFmpegUtil();
  const id = ++jobSeq;
  const [video, audio, output] = [`clip${id}.mp4`, `voice${id}.wav`, `movie${id}.mp4`];
  // 영상은 그대로 복사(-c:v copy)하고 소리만 새로 섞는다 — 브라우저 안 WASM에서
  // 영상까지 재인코딩하면 클립당 40초 가까이 걸려 부스에서 감당할 수 없다.
  const data = await run([
    '-i', video, '-i', audio,
    '-filter_complex', MIX_FILTER,
    '-map', '0:v:0', '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    output,
  ], [[video, await fetchFile(finalClipUrl(genreId))], [audio, await fetchFile(voice)]], output, '영상 합성');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
