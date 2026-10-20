import { useCallback, useEffect, useRef, useState } from 'react';
import { PAUSE_SECONDS, RECORD_SECONDS } from '../config';
import { pickSupportedMime } from '../logic';
import { stopVideoAt } from '../lib/videoClock';

// 장면 더빙 2.0 흐름(대표님 10/11 확정, app-plan §1):
//   장면 시작 → 0~5.0초 재생(상대 대사 자막) → 5.0초에서 멈춤 → «이제 당신의 차례입니다 !»
//   → 3·2·1 «지금 바로 당신의 목소리를 들려주세요 !» → «1»이 사라지는 순간부터 녹음 3.5초
//   → 같은 영상을 5.0초부터 이어 재생하며 녹음을 5.0~8.5초에 깔아 들려줌 → 다시 녹음·저장.
// 녹음 전에는 «미리보기»로 장면 전체를 소리와 함께 볼 수 있다(10/20 대표님 — 녹음·합성 없이 보기만, 끝나거나 멈추면 준비 상태로).
// «다시 듣기»는 10/20 대표님 지시로 없앴다(이어 재생이 이미 내 목소리가 들어간 장면을 들려준다).
// 단계(phase) 하나가 화면 전체를 결정하고, 정리는 effect cleanup이 맡는다.
export type Phase = 'idle' | 'previewing' | 'requesting' | 'watching' | 'cue' | 'countdown' | 'recording' | 'continuing' | 'recorded';

/** 5.0초 멈춤 뒤 «이제 당신의 차례입니다 !»를 보여 주는 시간 */
export const CUE_MS = 1200;
/** 3·2·1 숫자 하나의 시간(1.0과 같다) */
export const COUNT_MS = 900;

// 권한 대기·실패 원인을 해당 전환 시점의 안내로 보여준다.
const HINT = {
  idle: "'장면 시작'을 누르면 장면이 흐르다 가장 긴박한 순간에 멈춰요. 그때 내 목소리로 외쳐 주세요 !",
  previewing: '녹음 없이 장면을 처음부터 끝까지 보여 줘요. 다 보면 다시 준비 화면으로 돌아와요.',
  requesting: '마이크를 준비하고 있어요. 권한 요청이 뜨면 허용해 주세요.',
  watching: '장면을 보세요. 곧 내 차례가 와요 !',
  cue: '장면이 멈췄어요. 이제 내 차례예요 !',
  countdown: '숫자가 사라지면 3.5초 동안 목소리를 들려주세요.',
  recording: '지금 목소리를 들려주세요 !',
  continuing: '내 목소리가 들어간 장면을 이어 보는 중이에요…',
  recorded: '잘했어요 ! 마음에 들면 저장하세요',
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

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

// 처음 상태(정지·시작 지점·무음)로 되돌린다.
function resetVideo(v: HTMLVideoElement | null): void {
  if (!v) return;
  v.pause();
  v.currentTime = 0;
  v.muted = true;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 마이크 스트림은 한 번 얻으면 앱이 살아있는 동안 재사용한다(장르를 바꿀 때마다
// 권한 프롬프트가 다시 뜨지 않도록).
let micStream: MediaStream | null = null;
type MicFailure = 'denied' | 'missing' | 'busy' | 'unsupported' | 'insecure' | 'unknown';
type MicResult = { stream: MediaStream; error?: never } | { stream?: never; error: MicFailure };
const MIC_HINT: Record<MicFailure, string> = {
  denied: HINT.micDenied, missing: HINT.micMissing, busy: HINT.micBusy,
  unsupported: HINT.micUnsupported, insecure: HINT.insecure, unknown: HINT.micUnknown,
};
async function ensureMic(): Promise<MicResult> {
  if (!window.isSecureContext) return { error: 'insecure' };
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return { error: 'unsupported' };
  if (micStream?.getAudioTracks().some(track => track.readyState === 'live' && track.enabled)) return { stream: micStream };
  // 끊어진 스트림으로 녹음하지 않고 다음 입력에서 마이크를 다시 연결한다.
  micStream?.getTracks().forEach(track => track.stop());
  micStream = null;
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

export interface Dubbing {
  phase: Phase;
  hint: string;
  countdown: number;
  /** 녹음 3.5초 중 남은 몫(1 → 0). 녹음 중에만 의미가 있다. */
  recordLeft: number;
  recordedBlob: Blob | null;
  recordedMime: string;
  micError: MicFailure | null;
  startTake: () => void;
  preview: () => void;
  reset: () => void;
}

export function useDubbing(genreId: string, videoRef: React.RefObject<HTMLVideoElement | null>, sampleMode = false): Dubbing {
  const [phase, setPhase] = useState<Phase>('idle');
  const [hint, setHint] = useState<string>(HINT.idle);
  const [countdown, setCountdown] = useState(0);
  const [recordLeft, setRecordLeft] = useState(1);
  const [micError, setMicError] = useState<MicFailure | null>(null);
  const [recorded, setRecorded] = useState<{ blob: Blob; mime: string } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const voiceRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const cancelClockRef = useRef<(() => void) | null>(null);
  // 진행 중이던 비동기 작업(카운트다운, 마이크 권한 등)이 끝났을 때 그 사이 사용자가
  // 화면을 떠났거나 처음부터 다시 했는지 판단하는 단일 취소 토큰.
  const runRef = useRef(0);

  const stopVoice = useCallback(() => {
    const r = voiceRef.current;
    if (!r) return;
    r.audio.pause();
    URL.revokeObjectURL(r.url);
    voiceRef.current = null;
  }, []);

  const stopClock = useCallback(() => {
    cancelClockRef.current?.();
    cancelClockRef.current = null;
  }, []);

  const stopRecorder = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  /** 녹음·재생을 모두 멈추고 처음 상태로 되돌린다. */
  const reset = useCallback(() => {
    runRef.current++;
    stopClock();
    stopRecorder();
    stopVoice();
    resetVideo(videoRef.current);
    recorderRef.current = null;
    setRecorded(null);
    setCountdown(0);
    setRecordLeft(1);
    setMicError(null);
    setHint(HINT.idle);
    setPhase('idle');
  }, [stopClock, stopRecorder, stopVoice, videoRef]);

  // 장르가 바뀌거나 화면을 벗어나면 무조건 초기화된다.
  useEffect(() => reset, [genreId, reset]);

  /**
   * 영상을 5.0초부터 끝까지 재생하며, 녹음이 있으면 5.0초에 맞춰 함께 튼다(합성 전 미리 듣기).
   * 녹음은 정확히 3.5초라 8.5초에 끝나고, 8.5~10.0초는 원판의 해소 장면 소리만 남는다.
   */
  const playFromPause = useCallback((v: HTMLVideoElement, voice: Blob | null, myRun: number, onEnd: () => void) => {
    stopVoice();
    if (voice) {
      const url = URL.createObjectURL(voice);
      voiceRef.current = { audio: new Audio(url), url };
    }
    const audio = voiceRef.current?.audio;
    v.muted = false;
    v.currentTime = PAUSE_SECONDS;
    const ended = () => {
      v.removeEventListener('ended', ended);
      if (myRun !== runRef.current) return;
      stopVoice();
      onEnd();
    };
    v.addEventListener('ended', ended);
    void v.play().then(() => {
      if (myRun === runRef.current) void audio?.play().catch(() => {});
    }).catch(() => {
      v.removeEventListener('ended', ended);
      if (myRun === runRef.current) onEnd();
    });
  }, [stopVoice]);

  const finishTake = useCallback((voice: Blob | null, myRun: number) => {
    const v = videoRef.current;
    if (!v || myRun !== runRef.current) return;
    setHint(HINT.continuing);
    setPhase('continuing');
    playFromPause(v, voice, myRun, () => {
      setHint(sampleMode ? '체험을 마쳤어요. 다운로드는 원본 영상이에요.' : HINT.recorded);
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
    resetVideo(v);
    setMicError(null);
    setRecorded(null);

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

      // 1) 0~5.0초 — 소리와 함께 재생하다 5.0초에서 정확히 멈춘다.
      setHint(HINT.watching);
      setPhase('watching');
      v.muted = false;
      const reachedPause = new Promise<void>((resolve) => {
        cancelClockRef.current = stopVideoAt(v, PAUSE_SECONDS, resolve);
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

      // 2) 멈춤 → «이제 당신의 차례입니다 !» → 3·2·1
      setHint(HINT.cue);
      setPhase('cue');
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

      // 3) 녹음 3.5초 — 영상은 5.0초 정지 화면 그대로, 소리 없음(스피커 소리가 마이크로 들어가 겹치지 않게).
      setRecordLeft(1);
      setHint(sampleMode ? '샘플 체험이라 목소리는 녹음하지 않아요.' : HINT.recording);
      setPhase('recording');
      const startedAt = performance.now();
      let frame = 0;
      const tickLeft = () => {
        if (stale()) return;
        setRecordLeft(Math.max(0, 1 - (performance.now() - startedAt) / (RECORD_SECONDS * 1000)));
        frame = requestAnimationFrame(tickLeft);
      };
      frame = requestAnimationFrame(tickLeft);

      if (sampleMode || !stream) {
        await wait(RECORD_SECONDS * 1000);
        cancelAnimationFrame(frame);
        if (stale()) return;
        setRecordLeft(0);
        finishTake(null, myRun);
        return;
      }

      let recorder: MediaRecorder;
      try {
        const mime = pickSupportedMime(MIME_CANDIDATES, (m) => MediaRecorder.isTypeSupported(m));
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        cancelAnimationFrame(frame);
        micStream = null;
        resetVideo(v);
        setHint(HINT.micBroken);
        setPhase('idle');
        return;
      }
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        cancelAnimationFrame(frame);
        if (stale()) return;
        const mime = chunks[0]?.type || recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        setRecorded({ blob, mime });
        setRecordLeft(0);
        finishTake(blob, myRun);
      };
      recorderRef.current = recorder;
      try {
        recorder.start();
      } catch {
        cancelAnimationFrame(frame);
        resetVideo(v);
        micStream = null;
        setHint(HINT.recordFailed);
        setPhase('idle');
        return;
      }
      // 합성 때 정확히 3.5초로 자르고 모자라면 무음으로 채우므로(ffmpeg.ts) 여기서는 시간에 맞춰 멈추기만 한다.
      await wait(RECORD_SECONDS * 1000);
      if (!stale()) stopRecorder();
    })();
  }, [phase, videoRef, sampleMode, stopClock, stopRecorder, finishTake]);

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

  // 화면을 벗어날 때 남은 리소스(재생용 blob URL, 녹음기, 프레임 감시)를 확실히 반환한다.
  useEffect(() => () => {
    stopClock();
    stopVoice();
    stopRecorder();
  }, [stopClock, stopVoice, stopRecorder]);

  return {
    phase,
    hint: sampleMode ? `샘플 체험 · 마이크 녹음 없음. ${hint}` : hint,
    countdown,
    recordLeft,
    recordedBlob: recorded?.blob ?? null,
    recordedMime: recorded?.mime ?? '',
    micError,
    startTake,
    preview,
    reset,
  };
}
