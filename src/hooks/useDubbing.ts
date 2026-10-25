import { useCallback, useEffect, useRef, useState } from 'react';
import { pickSupportedMime } from '../logic';
import type { Scene } from '../genres';
import { decodeTake, engineReady, processVoice, type VoicePlan } from '../lib/ffmpeg';
import { stopVideoAt, watchVideoTime } from '../lib/videoClock';
import { checkTake, createVoiceTracker, maxSpeechFor, rms, type Verdict } from '../lib/voiceCheck';

// 장면 더빙 흐름(대표님 10/11 확정, app-plan §1 — 녹음·안내 박자는 10/24, 말끝 감지·정지 연출은 10/25 대표님 지시로 고침):
//   장면 시작 → 0~정지 시각 재생(상대 대사 자막) → 장면의 정지 시각에 멈춤 + 화면이 살짝 어두워짐(대사가 있으면 바로 크게)
//   → «이제 당신의 차례입니다 !» → 3·2·1 → 녹음기가 실제로 켜진 뒤 «지금 외쳐요 !» → 말이 시작되기를 기다림(최대 2.5초)
//   → 말끝을 알아보면(마지막 말소리 뒤 0.6초 조용, 첫 말이 짧으면 0.9초) 바로 멈춤(발화 최대 3초) → 어두움을 걷고 녹음 검사
//   → 같은 영상을 정지 시각부터 이어 재생하며 다듬은 목소리를 그 자리에 맞춰 들려줌 → 다시 녹음·저장.
// 녹음 전에는 «미리보기»로 장면 전체를 소리와 함께 볼 수 있다(10/20 대표님 — 녹음·합성 없이 보기만, 끝나거나 멈추면 준비 상태로).
// «다시 듣기»는 10/20 대표님 지시로 없앴다(이어 재생이 이미 내 목소리가 들어간 장면을 들려준다).
// 단계(phase) 하나가 화면 전체를 결정하고, 정리는 effect cleanup이 맡는다.
export type Phase = 'idle' | 'previewing' | 'requesting' | 'watching' | 'cue' | 'countdown' | 'recording' | 'checking' | 'continuing' | 'recorded';

/** 멈춤 뒤 «이제 당신의 차례입니다 !»를 보여 주는 시간 — 절정에서 녹음까지 1.5초(10/24 대표님, 전에는 3.9초) */
export const CUE_MS = 600;
/** 3·2·1 숫자 하나의 시간 */
export const COUNT_MS = 300;
/** 녹음기가 이 안에 켜지지 않으면 녹음을 시작하지 못한 것으로 본다 */
const RECORDER_START_MS = 2000;
/** 녹음 중 음량을 재는 간격(src/lib/voiceCheck.ts의 한 칸과 같다) */
const METER_MS = 20;
/** 목소리 처리를 기다리는 상한 — 넘으면 처리 전 녹음으로 미리 듣고, 처리는 저장할 때 마저 한다 */
const PROCESS_WAIT_MS = 2500;
/** 브라우저가 녹음을 풀지 못해 엔진으로 풀 때 엔진(31MB)을 기다리는 상한 */
const ENGINE_DECODE_WAIT_MS = 20000;

/** 준비 화면 안내 — 이 장면이 멈추는 시각을 그대로 알린다(지금 원판 5초, 새 장면 6.7초) */
export const idleHint = (pause: number) => `'장면 시작'을 누르면 장면이 흐르다 ${Math.floor(pause * 10) / 10}초에 멈춰요. 3·2·1 뒤에 내 목소리로 외쳐 주세요 !`;

// 권한 대기·실패 원인을 해당 전환 시점의 안내로 보여준다.
const HINT = {
  previewing: '녹음 없이 장면을 처음부터 끝까지 보여 줘요. 다 보면 다시 준비 화면으로 돌아와요.',
  requesting: '마이크를 준비하고 있어요. 권한 요청이 뜨면 허용해 주세요.',
  watching: '장면을 보세요. 곧 내 차례가 와요 !',
  cue: '장면이 멈췄어요. 이제 내 차례예요 !',
  countdown: '숫자가 사라지면 외쳐 주세요. 말을 마치면 장면이 바로 이어져요.',
  recording: '지금 외쳐요 ! 말을 마치면 장면이 바로 이어져요.',
  checking: '목소리를 확인하고 있어요…',
  continuing: '내 목소리가 들어간 장면을 이어 보는 중이에요…',
  recorded: '잘했어요 ! 마음에 들면 저장하세요',
  // 아래 셋은 저장할 수 있는 녹음의 알림이다 — 휴대폰에서도 안내 칸 두 줄 안에 들게 짧게 둔다(넘치면 영상·단추가 움직인다)
  takeQuiet: '목소리가 아주 작게 담겼어요. 들어 보고 마음에 들면 저장하세요.',
  takeCut: '말끝이 잘렸을 수 있어요. 들어 보고 마음에 들면 저장하세요.',
  takeEarly: '앞부분이 빠졌을 수 있어요. 들어 보고 마음에 들면 저장하세요.',
  takeSilent: '목소리가 들리지 않았어요. 마이크 가까이에서 크게 외쳐 주세요.',
  takeBroken: '녹음이 제대로 담기지 않았어요. 다시 눌러 주세요.',
  hidden: '화면을 벗어나서 녹음을 멈췄어요. 다시 눌러 주세요.',
  micDenied: '마이크 접근이 차단됐어요. 브라우저의 사이트 권한과 기기의 마이크 권한을 허용한 뒤 다시 눌러 주세요.',
  micMissing: '연결된 마이크를 찾지 못했어요. 마이크를 연결한 뒤 다시 눌러 주세요.',
  micBusy: '마이크를 열지 못했어요. 다른 앱의 마이크 사용을 종료하고 연결 상태를 확인한 뒤 다시 눌러 주세요.',
  micUnsupported: '이 브라우저에서는 녹음을 지원하지 않아요. Chrome 또는 Safari에서 열어 주세요.',
  micUnknown: '마이크를 연결하지 못했어요. 연결 상태를 확인한 뒤 다시 눌러 주세요.',
  insecure: '녹음하려면 HTTPS 주소 또는 이 기기의 localhost 주소에서 열어 주세요.',
  micBroken: '⚠ 마이크에 문제가 생겼어요 — 연결 확인 후 다시 눌러 주세요',
  recordFailed: '⚠ 녹음을 시작하지 못했어요 — 다시 눌러 주세요',
  playFailed: '영상을 재생하지 못했어요. 장면 시작을 다시 눌러 주세요.',
  previewFailed: '영상을 재생하지 못했어요. 미리보기를 다시 눌러 주세요.',
} as const;

/** 저장할 수 있는 녹음의 판정별 안내 — 작음·잘림·일찍 말함은 들어 보고 아이·선생님이 정한다 */
const RECORDED_HINT: Partial<Record<Verdict, string>> = {
  quiet: HINT.takeQuiet, cut: HINT.takeCut, early: HINT.takeEarly,
};

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
/** 화면이 가려지면 거두는 단계 — 녹음을 아직 담지 않았거나 담는 중이다 */
const CAPTURE_PHASES: readonly Phase[] = ['requesting', 'watching', 'cue', 'countdown', 'recording'];

// 처음 상태(정지·시작 지점·무음)로 되돌린다.
function resetVideo(v: HTMLVideoElement | null): void {
  if (!v) return;
  v.pause();
  v.currentTime = 0;
  v.muted = true;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const within = <T,>(promise: Promise<T>, ms: number) => Promise.race([
  promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('시간 초과')), ms)),
]);

// 마이크 스트림은 한 번 얻으면 앱이 살아있는 동안 재사용한다(장르를 바꿀 때마다
// 권한 프롬프트가 다시 뜨지 않도록).
let micStream: MediaStream | null = null;
type MicFailure = 'denied' | 'missing' | 'busy' | 'unsupported' | 'insecure' | 'unknown';
type MicResult = { stream: MediaStream; error?: never } | { stream?: never; error: MicFailure };
const MIC_HINT: Record<MicFailure, string> = {
  denied: HINT.micDenied, missing: HINT.micMissing, busy: HINT.micBusy,
  unsupported: HINT.micUnsupported, insecure: HINT.insecure, unknown: HINT.micUnknown,
};
function dropMic(): void {
  micStream?.getTracks().forEach(track => track.stop());
  micStream = null;
}
async function ensureMic(): Promise<MicResult> {
  if (!window.isSecureContext) return { error: 'insecure' };
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') return { error: 'unsupported' };
  if (micStream?.getAudioTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted)) return { stream: micStream };
  // 끊어지거나 소리가 멈춘 스트림으로 녹음하지 않고 다음 입력에서 마이크를 다시 연결한다.
  dropMic();
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    return { stream: micStream };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return { error: 'denied' };
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { error: 'missing' };
    if (name === 'NotReadableError' || name === 'AbortError') return { error: 'busy' };
    return { error: 'unknown' };
  }
}

interface TakeResult {
  blob: Blob;
  mime: string;
  /** 발화 상한에 닿았는데 아직 말하고 있었는가(말끝이 잘렸을 수 있다) */
  liveCut: boolean;
  /** 녹음 도중 마이크가 끊기거나(micLost) 녹음기가 오류를 냈다(failed) — 그 녹음은 쓰지 않는다 */
  problem: 'micLost' | 'failed' | null;
}

interface Take {
  recorder: MediaRecorder;
  /** 녹음기를 켠다. 실제로 켜지면(start 이벤트) true — 그 뒤에야 «지금 외쳐요 !»를 보인다 */
  start(): Promise<boolean>;
  /** 가장 최근 측정 칸의 음량(RMS) — 녹음 중 화면의 마이크 반응이 쓴다 */
  level(): number;
  done: Promise<TakeResult>;
  /** 녹음을 멈추고 음량 측정을 떼어 낸다(화면을 떠날 때·실패할 때) */
  discard(): void;
}

/**
 * 녹음기와 음량 측정을 미리 만든다(숫자가 끝나자마자 켜도록). 말소리 추적기(src/lib/voiceCheck.ts)가 말끝을 알아보면 바로 멈추고,
 * 말이 시작되지 않으면 기다림 상한(2.5초)에, 길면 발화 상한(maxSpeech)에 멈춘다.
 * 음량 측정은 녹음 중에만 하고 아무것도 저장하지 않는다 — 녹음 파일은 MediaRecorder 하나뿐이다.
 */
function prepareTake(stream: MediaStream, ctx: AudioContext, maxSpeech: number): Take {
  const mime = pickSupportedMime(MIME_CANDIDATES, (m) => MediaRecorder.isTypeSupported(m));
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const track = stream.getAudioTracks()[0];
  const chunks: Blob[] = [];
  let problem: TakeResult['problem'] = null;
  let liveCut = false;
  let lastLevel = 0;
  let closed = false;
  let timer = 0;
  const tracker = createVoiceTracker(maxSpeech);
  const stop = () => {
    clearInterval(timer);
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const lost = () => {
    problem ??= 'micLost';
    stop();
  };
  // 분석 노드는 소리 없이(이득 0) 출력에 이어 둔다 — 출력에 닿지 않은 노드를 처리하지 않는 브라우저가 있다.
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(analyser).connect(sink).connect(ctx.destination);
  // 녹음기를 켜기 전(멈춤 문구·3·2·1 동안) 소음 바닥을 미리 잰다 — 녹음 첫 칸부터 이어지는 부스 소음을 말 시작으로 보지 않게
  const frame = new Float32Array(analyser.fftSize);
  const priming = window.setInterval(() => {
    analyser.getFloatTimeDomainData(frame);
    tracker.prime(rms(frame));
  }, METER_MS);
  const release = () => {
    clearInterval(priming);
    clearInterval(timer);
    track?.removeEventListener('ended', lost);
    track?.removeEventListener('mute', lost);
    for (const node of [source, analyser, sink]) node.disconnect();
  };
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  recorder.onerror = () => {
    problem ??= 'failed';
    stop();
  };
  const done = new Promise<TakeResult>((resolve) => {
    recorder.onstop = () => {
      release();
      // 끊김 이벤트가 오지 않는 경우까지 — 녹음이 끝난 때 마이크가 이미 끊겨 있으면 그 녹음은 반쪽이다
      if (track?.readyState === 'ended') problem ??= 'micLost';
      const type = chunks[0]?.type || recorder.mimeType || mime || 'audio/webm';
      resolve({ blob: new Blob(chunks, { type }), mime: type, liveCut, problem });
    };
  });
  const start = () => new Promise<boolean>((resolve) => {
    const limit = setTimeout(() => {
      stop();
      resolve(false);
    }, RECORDER_START_MS);
    recorder.onstart = () => {
      clearTimeout(limit);
      if (closed) {
        stop();
        return;
      }
      clearInterval(priming);
      const startedAt = performance.now();
      track?.addEventListener('ended', lost);
      track?.addEventListener('mute', lost);
      timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(frame);
        lastLevel = rms(frame);
        const step = tracker.push(lastLevel, (performance.now() - startedAt) / 1000);
        if (step === 'continue') return;
        liveCut = step === 'stop-cut';
        stop();
      }, METER_MS);
      if (track && (track.readyState !== 'live' || track.muted)) lost();
      resolve(true);
    };
    try {
      recorder.start();
    } catch {
      clearTimeout(limit);
      resolve(false);
    }
  });
  return {
    recorder,
    start,
    level: () => lastLevel,
    done,
    discard() {
      closed = true;
      stop();
      release();
    },
  };
}

function mono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** 저장할 녹음 — 원본은 이 기기 메모리에만 있고 서버로 보내지 않는다(서버에는 완성 영상만 간다). */
export interface Recording {
  take: Blob;
  mime: string;
  plan: VoicePlan;
  /** 녹음실에서 미리 다듬은 목소리(미리 듣기와 같은 소리). 엔진이 아직 준비되지 않았거나 실패하면 저장할 때 같은 처리를 한다. */
  voice: Promise<Blob> | null;
}

export interface Dubbing {
  phase: Phase;
  hint: string;
  countdown: number;
  /** 녹음 중 마이크 음량(RMS) — 화면의 마이크 반응이 프레임마다 읽는다. 녹음 중이 아니면 0 */
  micLevel: () => number;
  recording: Recording | null;
  /** 마지막 녹음의 판정 — 저장할 수 없는 것(silent·short)은 준비 상태로 돌아가며 남는다 */
  takeCheck: Verdict | null;
  micError: MicFailure | null;
  startTake: () => void;
  preview: () => void;
  reset: () => void;
}

/** 미리 듣기로 틀 목소리 — offset·duration은 처리 전 녹음을 대신 틀 때 그 안에서 영화에 넣을 구간이다 */
type PreviewVoice = { buffer: AudioBuffer; gain: number; offset: number; duration: number };

export function useDubbing(genreId: string, scene: Scene, videoRef: React.RefObject<HTMLVideoElement | null>, sampleMode = false): Dubbing {
  const [phase, setPhase] = useState<Phase>('idle');
  const [hint, setHint] = useState<string>(() => idleHint(scene.pause));
  const [countdown, setCountdown] = useState(0);
  const [micError, setMicError] = useState<MicFailure | null>(null);
  const [recorded, setRecorded] = useState<Recording | null>(null);
  const [takeCheck, setTakeCheck] = useState<Verdict | null>(null);

  const takeRef = useRef<Take | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const voiceRef = useRef<(() => void) | null>(null);
  const cancelClockRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  // 진행 중이던 비동기 작업(카운트다운, 마이크 권한 등)이 끝났을 때 그 사이 사용자가
  // 화면을 떠났거나 처음부터 다시 했는지 판단하는 단일 취소 토큰.
  const runRef = useRef(0);

  const stopVoice = useCallback(() => {
    voiceRef.current?.();
    voiceRef.current = null;
  }, []);

  const stopClock = useCallback(() => {
    cancelClockRef.current?.();
    cancelClockRef.current = null;
  }, []);

  const discardTake = useCallback(() => {
    takeRef.current?.discard();
    takeRef.current = null;
  }, []);

  /** 녹음·재생을 모두 멈추고 처음 상태로 되돌린다. */
  const reset = useCallback(() => {
    runRef.current++;
    stopClock();
    discardTake();
    stopVoice();
    resetVideo(videoRef.current);
    setRecorded(null);
    setTakeCheck(null);
    setCountdown(0);
    setMicError(null);
    setHint(idleHint(scene.pause));
    setPhase('idle');
  }, [stopClock, discardTake, stopVoice, videoRef, scene.pause]);

  // 장르가 바뀌거나 화면을 벗어나면 무조건 초기화된다.
  useEffect(() => reset, [genreId, reset]);

  // 녹음을 담는 도중 화면이 가려지면(다른 앱·탭) 그 녹음을 거둔다 — 백그라운드에서는 시계·영상이 멈추거나 늦어 반쪽 녹음이 된다.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden || !CAPTURE_PHASES.includes(phaseRef.current)) return;
      reset();
      setHint(HINT.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [reset]);

  /** 오디오 장치는 누르는 그 순간에 깨운다 — 아이폰은 누른 순간이 아니면 소리를 막는다. */
  const audioContext = useCallback((): AudioContext => {
    audioRef.current ??= new AudioContext();
    void audioRef.current.resume().catch(() => {});
    return audioRef.current;
  }, []);

  /**
   * 영상을 정지 시각부터 끝까지 재생하며, 다듬은 목소리를 영상의 첫 프레임이 나갈 때 원판 소리의 시계에 맞춰 함께 튼다(합성 전 미리 듣기).
   * 목소리는 완성본과 같은 파일이고 같은 자리(정지 시각)에서 시작한다. 목소리는 목소리 칸 안에서 끝나고, 그 뒤는 원판의 해소 장면 소리만 남는다.
   * 끝나거나 브라우저가 멈추면(백그라운드 등) 녹음 뒤 화면으로 넘어간다.
   */
  const playFromPause = useCallback((v: HTMLVideoElement, voice: PreviewVoice | null, myRun: number, onEnd: () => void) => {
    stopVoice();
    const ctx = audioRef.current;
    const pause = scene.pause;
    v.muted = false;
    v.currentTime = pause;
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      v.removeEventListener('ended', end);
      v.removeEventListener('pause', end);
      if (myRun !== runRef.current) return;
      stopVoice();
      onEnd();
    };
    v.addEventListener('ended', end);
    void v.play().then(() => {
      if (myRun !== runRef.current || finished) return;
      v.addEventListener('pause', end);
      if (!voice || !ctx) return;
      const source = ctx.createBufferSource();
      source.buffer = voice.buffer;
      const level = ctx.createGain();
      level.gain.value = voice.gain;
      source.connect(level).connect(ctx.destination);
      let started = false;
      const stopWatch = watchVideoTime(v, (time) => {
        if (started || v.paused || time < pause - 0.05) return;
        started = true;
        stopWatch();
        // 얼마나 늦었는지는 원판 소리의 시계(currentTime)로 잰다 — 화면에 나간 그림의 시각(time)은 그 순간 소리보다 8~21ms 앞서거나
        // 뒤져, 그것으로 맞추면 미리 듣기가 완성본(원판 소리 위 정지 시각)과 그만큼 어긋났다(10/25)
        const late = Math.max(0, v.currentTime - pause);
        if (late < voice.duration) source.start(0, voice.offset + late, voice.duration - late);
      });
      voiceRef.current = () => {
        stopWatch();
        if (started) source.stop();
        source.disconnect();
        level.disconnect();
      };
    }).catch(() => {
      v.removeEventListener('ended', end);
      if (myRun === runRef.current && !finished) onEnd();
    });
  }, [stopVoice, scene]);

  const finishTake = useCallback((voice: PreviewVoice | null, verdict: Verdict, myRun: number) => {
    const v = videoRef.current;
    if (!v || myRun !== runRef.current) return;
    setHint(HINT.continuing);
    setPhase('continuing');
    playFromPause(v, voice, myRun, () => {
      setHint(sampleMode ? '체험을 마쳤어요. 다운로드는 원본 영상이에요.' : RECORDED_HINT[verdict] ?? HINT.recorded);
      setPhase('recorded');
    });
  }, [videoRef, playFromPause, sampleMode]);

  const startTake = useCallback(() => {
    // 미리보기 중에 «장면 시작»을 누르면 미리보기를 접고 바로 시작한다(아래 resetVideo의 멈춤은 미리보기 쪽에서 지난 실행으로 무시된다).
    if (phase !== 'idle' && phase !== 'previewing') return;
    const myRun = ++runRef.current;
    const stale = () => myRun !== runRef.current;
    const v = videoRef.current;
    if (!v) return;
    let ctx: AudioContext | null = null;
    if (!sampleMode) {
      try {
        ctx = audioContext();
      } catch {
        setMicError('unsupported');
        setHint(HINT.micUnsupported);
        return;
      }
    }
    resetVideo(v);
    setMicError(null);
    setRecorded(null);
    setTakeCheck(null);

    // 쓸 수 없는 녹음 — 준비 상태로 돌아가 «장면 시작»으로 다시 녹음한다(저장으로 넘어가지 않는다).
    const fail = (message: string, options: { mic?: boolean; verdict?: Verdict } = {}) => {
      takeRef.current?.discard();
      takeRef.current = null;
      if (options.mic) dropMic();
      resetVideo(v);
      setCountdown(0);
      setTakeCheck(options.verdict ?? null);
      setHint(message);
      setPhase('idle');
    };

    void (async () => {
      let stream: MediaStream | null = null;
      if (!sampleMode) {
        setPhase('requesting');
        setHint(HINT.requesting);
        const result = await ensureMic();
        if (stale()) return;
        if (result.error) {
          setMicError(result.error);
          setHint(MIC_HINT[result.error]);
          setPhase('idle');
          return;
        }
        stream = result.stream;
      }

      // 1) 0~정지 시각 — 소리와 함께 재생하다 장면의 정지 시각에서 정확히 멈춘다.
      setHint(HINT.watching);
      setPhase('watching');
      v.muted = false;
      const reachedPause = new Promise<void>((resolve) => {
        cancelClockRef.current = stopVideoAt(v, scene.pause, resolve);
      });
      try {
        await v.play();
      } catch {
        if (stale()) return;
        stopClock();
        resetVideo(v);
        setHint(HINT.playFailed);
        setPhase('idle');
        return;
      }
      await reachedPause;
      cancelClockRef.current = null;
      if (stale()) return;

      // 2) 멈춤(화면이 살짝 어두워진다) → «이제 당신의 차례입니다 !» → 3·2·1. 녹음기는 지금 만들어 두어 숫자가 끝나자마자 켠다.
      setHint(HINT.cue);
      setPhase('cue');
      const maxSpeech = maxSpeechFor(scene.voiceWindow);
      if (stream && ctx) {
        try {
          takeRef.current = prepareTake(stream, ctx, maxSpeech);
        } catch {
          fail(HINT.micBroken, { mic: true });
          return;
        }
      }
      await wait(CUE_MS);
      if (stale()) return;
      setHint(HINT.countdown);
      setPhase('countdown');
      for (let n = 3; n > 0; n--) {
        setCountdown(n);
        await wait(COUNT_MS);
        if (stale()) return;
      }
      setCountdown(0);

      // 3) 녹음 — 영상은 정지 화면 그대로, 소리 없음(스피커 소리가 마이크로 들어가 겹치지 않게).
      //    «지금 외쳐요 !»는 녹음기가 실제로 켜진 뒤에 보인다 — 신호를 보고 바로 외친 첫 음절이 빠지지 않게.
      const take = takeRef.current;
      if (take && !(await take.start())) {
        if (!stale()) fail(HINT.recordFailed, { mic: true });
        return;
      }
      if (stale()) return;
      setHint(sampleMode ? '샘플 체험이라 목소리는 녹음하지 않아요.' : HINT.recording);
      setPhase('recording');
      if (!take || !ctx) {
        await wait(maxSpeech * 1000);
        if (stale()) return;
        finishTake(null, 'ok', myRun);
        return;
      }

      const result = await take.done;
      if (stale()) return;
      takeRef.current = null;
      if (result.problem) {
        fail(result.problem === 'micLost' ? HINT.micBroken : HINT.recordFailed, { mic: true });
        return;
      }

      // 4) 녹음 검사 — 어두움을 먼저 걷고(정지 화면을 어둡게 둔 채 기다리게 하지 않는다), 실제로 담긴 소리를 풀어
      //    무음·잘림·작은 목소리를 보고 영화에 넣을 구간과 보정 음량을 정한다.
      setHint(HINT.checking);
      setPhase('checking');
      // 브라우저가 자기 녹음을 풀지 못하면(사파리 mp4 녹음이 그런 판이 있다) 엔진으로 풀어 본다 — 그것까지 안 되면 녹음이 깨진 것이다.
      const decode = (blob: Blob) => blob.arrayBuffer().then((bytes) => ctx.decodeAudioData(bytes));
      let decoded = result.blob.size ? await decode(result.blob).catch(() => null) : null;
      if (!decoded && result.blob.size && !stale()) {
        decoded = await within(decodeTake(result.blob, result.mime), ENGINE_DECODE_WAIT_MS).then(decode).catch(() => null);
      }
      if (stale()) return;
      if (!decoded) {
        fail(HINT.takeBroken, { verdict: 'short' });
        return;
      }
      const check = checkTake(mono(decoded), decoded.sampleRate, scene.voiceWindow, result.liveCut);
      if (check.verdict === 'silent' || check.verdict === 'short') {
        fail(check.verdict === 'silent' ? HINT.takeSilent : HINT.takeBroken, { verdict: check.verdict });
        return;
      }
      const plan: VoicePlan = { gainDb: check.gainDb, start: check.start, end: check.end, channels: decoded.numberOfChannels };
      // 다듬은 목소리를 미리 듣기와 완성본이 같이 쓴다. 엔진을 아직 받는 중이면 기다리지 않고 저장할 때 다듬는다.
      const voice = engineReady() ? processVoice(result.blob, result.mime, plan) : null;
      voice?.catch(() => {});
      let preview: AudioBuffer | null = null;
      if (voice) {
        preview = await within(voice, PROCESS_WAIT_MS).then((wav) => wav.arrayBuffer()).then((bytes) => ctx.decodeAudioData(bytes)).catch(() => null);
      }
      if (stale()) return;
      setRecorded({ take: result.blob, mime: result.mime, plan, voice });
      setTakeCheck(check.verdict);
      // 다듬은 목소리가 아직 없으면 처리 전 녹음의 같은 구간에 같은 보정 음량만 걸어 들려준다(완성본은 저장할 때 다듬은 소리다).
      finishTake(preview
        ? { buffer: preview, gain: 1, offset: 0, duration: preview.duration }
        : { buffer: decoded, gain: 10 ** (plan.gainDb / 20), offset: plan.start, duration: plan.end - plan.start }, check.verdict, myRun);
    })();
  }, [phase, videoRef, sampleMode, scene, audioContext, stopClock, finishTake]);

  /**
   * 녹음 없이 장면 전체(0~10초)를 소리와 함께 본다(10/20 대표님). 끝나거나 멈추면(브라우저가 멈춘 경우도) 준비 상태로 돌아간다.
   * 미리보기를 접는 쪽(reset·startTake)은 실행 번호를 먼저 올리므로, 그때 생기는 멈춤은 여기서 지난 실행으로 무시된다.
   */
  const preview = useCallback(() => {
    if (phase !== 'idle') return;
    const v = videoRef.current;
    if (!v) return;
    const myRun = ++runRef.current;
    resetVideo(v);
    setMicError(null);
    setHint(HINT.previewing);
    setPhase('previewing');
    const detach = () => {
      v.removeEventListener('pause', finish);
      v.removeEventListener('ended', finish);
    };
    function finish() {
      detach();
      if (myRun === runRef.current) reset();
    }
    v.muted = false;
    v.addEventListener('pause', finish);
    v.addEventListener('ended', finish);
    void v.play().catch(() => {
      detach();
      if (myRun !== runRef.current) return;
      resetVideo(v);
      setHint(HINT.previewFailed);
      setPhase('idle');
    });
  }, [phase, videoRef, reset]);

  // 화면을 벗어날 때 남은 리소스(녹음기·음량 측정, 목소리 재생, 프레임 감시, 오디오 장치)를 확실히 반환한다.
  useEffect(() => () => {
    stopClock();
    stopVoice();
    discardTake();
    void audioRef.current?.close().catch(() => {});
    audioRef.current = null;
  }, [stopClock, stopVoice, discardTake]);

  const micLevel = useCallback(() => takeRef.current?.level() ?? 0, []);

  return {
    phase,
    hint: sampleMode ? `샘플 체험 · 마이크 녹음 없음. ${hint}` : hint,
    countdown,
    micLevel,
    recording: recorded,
    takeCheck,
    micError,
    startTake,
    preview,
    reset,
  };
}
