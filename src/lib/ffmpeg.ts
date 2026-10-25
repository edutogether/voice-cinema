import { CLIP_SECONDS, ENGINE_WASM_BYTES } from '../config';
import { finalClipUrl } from '../genres';
import { pickAudioExtension, progressPercent } from '../logic';
import { readInBackground } from './backgroundLoad';
import { loadFFmpegModule, loadFFmpegUtil, type FFmpegInstance } from './vendor';

const SW_CONTROL_WAIT_MS = 20000;

// @ffmpeg/util의 toBlobURL(progress=true)은 스트림 리더가 도중에 실패하면 이미 읽은
// Response.body를 다시 arrayBuffer()로 읽으려다 "body stream already read" 오류를
// 낸다(라이브에서 재현 확인됨). 그 경로를 피해 직접 fetch + 진행률을 구현한다.
// 진행률은 받은(압축을 푼) 바이트로만 알린다 — Content-Length는 압축된 크기라 분모로 쓰면 100%를 넘는다(10/20).
// 받는 동안 녹음실 장면 영상이 받히고 있으면 잠시 쉰다(src/lib/backgroundLoad.ts) — 장면이 먼저 재생돼야 한다.
async function toBlobURLWithProgress(
  url: string,
  mimeType: string,
  onProgress?: (received: number) => void
): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`엔진 파일 다운로드 실패: ${resp.status} ${url}`);
  const chunks: Uint8Array[] = [];
  let received = 0;
  await readInBackground(resp, (chunk) => {
    chunks.push(chunk);
    received += chunk.length;
    onProgress?.(received);
  });
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: mimeType }));
}

// 첫 방문에서는 서비스워커가 이 탭을 맡기 전에 엔진을 받기 시작하면 서비스워커가 그 받기를 못 봐 캐시에 넣지 못한다 —
// 그러면 다음에 열 때 31MB를 또 받는다. 서비스워커가 맡을 때까지 잠깐(최대 waitMs) 기다린다. 서비스워커가 없으면 바로 받는다.
async function whenServiceWorkerControls(waitMs: number): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || navigator.serviceWorker.controller) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(done, waitMs);
    navigator.serviceWorker.addEventListener('controllerchange', done);
    function done() {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', done);
      resolve();
    }
  });
}

let engine: FFmpegInstance | null = null;
let loading: Promise<FFmpegInstance> | null = null;

/** 엔진(31MB)을 한 번만 받아 재사용한다. 첫 저장 전에 미리 백그라운드로 준비해 둔다. */
export function loadEngine(onProgress?: (percent: number) => void): Promise<FFmpegInstance> {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  loading = (async () => {
    await whenServiceWorkerControls(SW_CONTROL_WAIT_MS);
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
  /** 영화에 넣을 구간(초, 녹음 시작 기준) — 말 시작 조금 앞부터 마지막 말소리 조금 뒤까지(마지막 말소리는 자르지 않는다) */
  start: number;
  end: number;
  /** 그 구간을 놓는 자리 — 정지 시각에서 구간 시작까지(초, 0 이하). 말이 길면 앞 여백이 정지 시각 앞으로 가 구간이 칸 끝(10.0초) 안에 든다 */
  at: number;
  /** 끝 페이드 길이(초) — 마지막 말소리 뒤 여백 안(여백이 짧으면 여백만큼, 최소 5ms) */
  fadeOut: number;
  /** 녹음의 채널 수 — 한 채널로 평균 낼 때 쓴다 */
  channels: number;
}

/**
 * 녹음을 목소리 칸에 넣을 소리로 다듬는다(10/24 대표님 — 미리 듣기와 완성본이 이 결과를 같이 쓴다).
 * 채널을 평균 내 한 채널로 → 저장 구간만 자르고(말하기 전 긴 기다림은 넣지 않는다, 10/25 대표님) → 48kHz → 90Hz 아래 웅웅거림을 걷고 →
 * 작은 목소리만 정해진 만큼 키우고 → 큰 목소리는 부드럽게 눌러(3:1) → −2dBFS에서 막는다. 리미터의 자동 레벨(`level`)은 FFmpeg 기본값이
 * 켜짐이라 누른 소리를 다시 0dB 쪽으로 끌어올리므로 끄고, 앞보기 지연(3ms)은 `latency`로 되돌려 목소리가 늦게 들어가지 않게 한다.
 * 처음 5ms·끝 페이드(fadeOut — 보통 30ms, 마지막 말소리 뒤 여백 안)만 걸어 딸깍 소리를 막는다(음절을 깎지 않는다).
 * 자르기 전에 시각을 0부터 다시 센다 — 웹엠 녹음은 시작 시각이 몇 ms 밀려 있어, 그대로 자르면 녹음 판정(표본 순서로 잰 시각)과 어긋난다.
 * 채널 평균은 `pan`으로 직접 낸다 — `aformat=channel_layouts=mono` 뒤에 필터를 이으면 두 채널을 나누지 않고 더해 +3dB 커졌다(엔진에서 확인).
 */
export const voiceFilter = ({ gainDb, start, end, channels, fadeOut }: VoicePlan) =>
  `pan=mono|c0=${Array.from({ length: Math.max(1, channels) }, (_, c) => `${(1 / Math.max(1, channels)).toFixed(4)}*c${c}`).join('+')},` +
  `asetpts=PTS-STARTPTS,atrim=${start.toFixed(3)}:${end.toFixed(3)},asetpts=PTS-STARTPTS,` +
  'aresample=48000,highpass=f=90,' +
  `volume=${gainDb.toFixed(1)}dB,acompressor=threshold=0.125:ratio=3:attack=5:release=120,` +
  'alimiter=limit=0.794:attack=3:release=60:level=false:latency=true,' +
  `afade=t=in:d=0.005,afade=t=out:st=${Math.max(0, end - start - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`;

/**
 * 원판(영상 + 상대 대사·배경음) 소리에 다듬은 목소리를 섞는다(app-plan §2-4). at: 목소리를 넣는 영상 시각(초) — 장면의 정지 시각 + 배치(VoicePlan.at, 0 이하).
 * 목소리는 언제나 칸 끝(10.0초) 안에서 끝나고, 완성본은 원판 길이(정확히 10.0초) 그대로다. 원판의 목소리 칸은 이미 −8dB 낮춰 구웠으므로
 * 여기서 더 낮추지 않는다. 섞은 뒤 −1dBFS에서 한 번 더 막아 찢어지지 않게 한다(자동 레벨 끔·지연 보정 — 위와 같은 까닭).
 * 한 채널 목소리는 두 채널로 그대로 복사해 섞는다 — amix에 맡기면 −3dB로 나눠 펼쳐, 한 채널을 양쪽에 그대로 내는 브라우저의
 * 미리 듣기보다 완성본 목소리가 3dB 작아진다(엔진에서 확인).
 * 목소리 뒤를 무음으로 늘린다(apad) — 엔진의 amix(duration=first)는 목소리가 원판의 마지막 프레임(약 21ms) 안에서 끝나면 출력을 목소리 끝에서
 * 끊었다(10/26 엔진 실측: 목소리 끝 9.995초 → 소리 트랙 9.995초). 늘려 두면 출력은 언제나 원판 길이(48kHz 480,000표본)다.
 */
export const mixFilter = (at: number) =>
  `[1:a]pan=stereo|c0=c0|c1=c0,adelay=${Math.round(at * 1000)}:all=1,apad[voice];` +
  '[0:a][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,' +
  'alimiter=limit=0.891:level=false:latency=true[a]';

const prefetched = new Set<string>();

/**
 * 저장할 때 합성에 쓰는 완성용 원판(장르당 약 6MB)을 미리 받아 둔다 — 녹음하는 동안 받아 두면 «저장하기» 뒤에 그만큼 기다리지 않는다.
 * 녹음실 장면 영상이 다 받힌 뒤에 부른다. 받은 것은 서비스워커 캐시와 브라우저 캐시에 남아 합성 때 그대로 쓴다.
 */
export function prefetchFinalClip(genreId: string): void {
  if (prefetched.has(genreId)) return;
  prefetched.add(genreId);
  fetch(finalClipUrl(genreId))
    .then((resp) => (resp.ok ? readInBackground(resp) : Promise.reject(new Error(String(resp.status)))))
    .catch(() => prefetched.delete(genreId));
}

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

/** 원판 영상 + 다듬은 목소리를 브라우저 안에서 합쳐 mp4로 만든다. at: 목소리를 넣는 영상 시각(초) — 정지 시각 + 배치 */
export async function mergeClip(genreId: string, voice: Blob, at: number): Promise<Blob> {
  const { fetchFile } = await loadFFmpegUtil();
  const id = ++jobSeq;
  const [video, audio, output] = [`clip${id}.mp4`, `voice${id}.wav`, `movie${id}.mp4`];
  // 영상은 그대로 복사(-c:v copy)하고 소리만 새로 섞는다 — 브라우저 안 WASM에서
  // 영상까지 재인코딩하면 클립당 40초 가까이 걸려 부스에서 감당할 수 없다.
  // 길이는 정확히 10.000초로 자른다(-t) — 엔진은 원판 소리를 AAC 마지막 프레임까지 풀어(편집 목록의 끝 자르기를 따르지 않는다) 소리 트랙이
  // 10.005초가 됐다(10/26 실측, 영상 300프레임 10.000초). 영상은 그대로 300프레임이고, 목소리는 언제나 10.0초 안에서 끝나 잘리지 않는다.
  const data = await run([
    '-i', video, '-i', audio,
    '-filter_complex', mixFilter(at),
    '-map', '0:v:0', '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '160k',
    '-t', String(CLIP_SECONDS),
    '-movflags', '+faststart',
    output,
  ], [[video, await fetchFile(finalClipUrl(genreId))], [audio, await fetchFile(voice)]], output, '영상 합성');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
