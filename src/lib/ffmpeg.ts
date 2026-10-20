import { ENGINE_WASM_BYTES, PAUSE_SECONDS, RECORD_SECONDS } from '../config';
import { clipUrl } from '../genres';
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

/**
 * 원판(영상 + 상대 대사·BGM·효과음) 소리에 학생 녹음 3.5초를 5.0초 자리에 섞는다(app-plan §2-4).
 * 녹음은 정확히 3.5초로 자르고 모자라면 무음으로 채워 언제나 5.0~8.5초를 차지한다 — 그래서
 * 완성본은 언제나 원판 길이(정확히 10.0초) 그대로다. 앞의 빈 소리는 자르지 않는다(대표님 결정).
 * 90Hz 아래 웅웅거림을 걷고, 갑자기 큰 소리는 리미터로 눌러 찢어지지 않게 한다.
 */
export const MIX_FILTER =
  `[1:a]atrim=0:${RECORD_SECONDS},apad=whole_dur=${RECORD_SECONDS},highpass=f=90,alimiter=limit=0.89,` +
  `adelay=${PAUSE_SECONDS * 1000}:all=1[voice];` +
  '[0:a][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]';

/** 원판 영상 + 학생이 녹음한 음성을 브라우저 안에서 합쳐 mp4로 만든다. */
export async function mergeClip(genreId: string, audioBlob: Blob, mime: string): Promise<Blob> {
  const ff = await loadEngine();
  const { fetchFile } = await loadFFmpegUtil();
  const ext = pickAudioExtension(mime);
  const files = ['v.mp4', `a.${ext}`, 'out.mp4'];
  const log: string[] = [];
  const onLog = ({ message }: { message: string }) => log.push(message);

  ff.on('log', onLog);
  try {
    await ff.writeFile('v.mp4', await fetchFile(clipUrl(genreId)));
    await ff.writeFile(`a.${ext}`, await fetchFile(audioBlob));
    // 영상은 그대로 복사(-c:v copy)하고 소리만 새로 섞는다 — 브라우저 안 WASM에서
    // 영상까지 재인코딩하면 클립당 40초 가까이 걸려 부스에서 감당할 수 없다.
    const code = await ff.exec([
      '-i', 'v.mp4', '-i', `a.${ext}`,
      '-filter_complex', MIX_FILTER,
      '-map', '0:v:0', '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      'out.mp4',
    ]);
    // exec()는 실패해도 예외를 던지지 않고 0이 아닌 코드만 반환한다 — 여기서 직접
    // 확인하지 않으면 readFile()에서 "FS error"라는 알아보기 힘든 에러로만 나타나
    // 진짜 원인(오디오 디코딩 실패 등)이 감춰진다.
    if (code !== 0) throw new Error('영상 합성 실패\n' + log.slice(-8).join('\n'));
    const data = await ff.readFile('out.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  } finally {
    ff.off('log', onLog);
    await Promise.all(files.map((f) => ff.deleteFile(f).catch(() => {})));
  }
}
