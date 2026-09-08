import { useCallback, useEffect, useRef, useState } from 'react';
import { CLIP_SECONDS } from '../config';
import { pickSupportedMime } from '../logic';

// 예전 app.js에서는 정리(리셋) 작업이 resetRecord/stopAll/stopPreview/녹음 실패 분기
// 네 곳에 겹쳐 흩어져 있어, 상태를 하나 추가할 때마다 네 곳을 모두 고쳐야 했다.
// 여기서는 단계(phase) 하나가 화면 전체를 결정하고, 정리는 effect cleanup이 맡는다.
export type Phase = 'idle' | 'ready' | 'preview' | 'countdown' | 'recording' | 'recorded' | 'replaying';

// 안내 문구는 단계에서 파생하지 않고 전환 시점에 명시적으로 바꾼다 — 카운트다운
// 동안에는 직전 문구가 그대로 남아야 하기 때문이다(전환 전 동작과 동일).
const HINT = {
  idle: '먼저 [미리 보기]로 영상을 확인하고, 준비되면 녹음하세요',
  ready: '준비됐나요? [녹음 시작]을 누르면 3·2·1 후 시작돼요',
  preview: '👀 영상을 보며 어떤 더빙을 할지 생각해 보세요',
  recording: '🎙️ 지금 목소리를 연기해 보세요!',
  recorded: '잘했어요! 다시 듣고, 마음에 들면 저장하세요',
  replaying: '▶ 내 더빙 영화 재생 중…',
  micDenied: '⚠️ 마이크 사용을 허용해 주세요 (브라우저 권한)',
  insecure: '⚠️ 이 페이지는 https 주소여야 마이크가 켜져요',
  micBroken: '⚠ 마이크에 문제가 생겼어요 — 연결 확인 후 다시 눌러 주세요',
  recordFailed: '⚠ 녹음을 시작하지 못했어요 — 다시 눌러 주세요',
} as const;

// 진행바가 보이는 단계. 미리보기 중과 녹음이 시작된 뒤에만 보이고, 대기·카운트다운
// 중에는 숨는다(전환 전 `.progress.show` 토글 시점과 동일).
const PROGRESS_PHASES: readonly Phase[] = ['preview', 'recording', 'recorded', 'replaying'];

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

// 마이크 스트림은 한 번 얻으면 앱이 살아있는 동안 재사용한다(장르를 바꿀 때마다
// 권한 프롬프트가 다시 뜨지 않도록).
let micStream: MediaStream | null = null;
async function ensureMic(): Promise<MediaStream | null> {
  if (micStream) return micStream;
  if (!window.isSecureContext) return null;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    return micStream;
  } catch {
    return null;
  }
}

export interface Dubbing {
  phase: Phase;
  hint: string;
  showProgress: boolean;
  progress: number;
  countdown: number;
  recordedBlob: Blob | null;
  recordedMime: string;
  togglePreview: () => void;
  startRecord: () => void;
  replay: () => void;
  reset: () => void;
}

export function useDubbing(genreId: string, videoRef: React.RefObject<HTMLVideoElement | null>): Dubbing {
  const [phase, setPhase] = useState<Phase>('idle');
  const [hint, setHint] = useState<string>(HINT.idle);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recorded, setRecorded] = useState<{ blob: Blob; mime: string } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const replayRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  // 진행 중이던 비동기 작업(카운트다운, 마이크 권한 등)이 끝났을 때 그 사이 사용자가
  // 화면을 떠났거나 다시 녹음을 눌렀는지 판단하는 단일 취소 토큰.
  // 예전에는 같은 발상의 토큰이 녹음(session)과 호버 미리보기(hoverToken)에 따로 있었다.
  const runRef = useRef(0);

  const stopReplay = useCallback(() => {
    const r = replayRef.current;
    if (!r) return;
    r.audio.pause();
    URL.revokeObjectURL(r.url);
    replayRef.current = null;
  }, []);

  const stopRecorder = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  /** 녹음·재생·미리보기를 모두 멈추고 처음 상태로 되돌린다. */
  const reset = useCallback(() => {
    runRef.current++;
    stopRecorder();
    stopReplay();
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
      v.muted = true;
    }
    recorderRef.current = null;
    setRecorded(null);
    setProgress(0);
    setCountdown(0);
    setHint(HINT.idle);
    setPhase('idle');
  }, [stopRecorder, stopReplay, videoRef]);

  // 장르가 바뀌거나 화면을 벗어나면 무조건 초기화된다 — 예전엔 이걸 goHome()과
  // openStudio()가 각각 손으로 호출해야 했고, 빠뜨리면 옛 녹음이 살아남았다.
  useEffect(() => reset, [genreId, reset]);

  // 진행바와 "영상이 끝났을 때"의 처리는 단계마다 다르지만, 이전에는 같은 코드가
  // 미리보기·녹음 두 곳에 복사돼 있었다. 여기 한 곳에서 단계에 따라 갈라놓는다.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.duration) setProgress(Math.min(100, (v.currentTime / v.duration) * 100));
    };
    const onEnded = () => {
      if (phase === 'preview') stopPreviewRef.current();
      else if (phase === 'recording') stopRecorder();
      else if (phase === 'replaying') {
        stopReplay();
        setHint(HINT.recorded);
        setPhase('recorded');
      }
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', onEnded);
    };
  }, [phase, stopRecorder, stopReplay, videoRef]);

  const stopPreview = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
      v.muted = true;
    }
    setProgress(0);
    setHint(HINT.ready);
    setPhase('ready');
  }, [videoRef]);
  // onEnded가 최신 stopPreview를 보도록 ref로 들고 있는다(effect 의존성 순환 방지).
  const stopPreviewRef = useRef(stopPreview);
  stopPreviewRef.current = stopPreview;

  const togglePreview = useCallback(() => {
    if (phase === 'preview') {
      stopPreview();
      return;
    }
    if (phase !== 'idle' && phase !== 'ready') return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    setHint(HINT.preview);
    setPhase('preview');
    void v.play().catch(() => {});
  }, [phase, stopPreview, videoRef]);

  const startRecord = useCallback(() => {
    if (phase !== 'idle' && phase !== 'ready') return;
    const myRun = ++runRef.current;
    const stale = () => myRun !== runRef.current;

    void (async () => {
      const stream = await ensureMic();
      if (stale()) return;
      if (!stream) {
        setHint(window.isSecureContext ? HINT.micDenied : HINT.insecure);
        return;
      }

      // 카운트다운 동안에는 문구를 바꾸지 않는다 — 직전 문구가 그대로 남는다.
      setPhase('countdown');
      for (let n = 3; n > 0; n--) {
        setCountdown(n);
        await new Promise((r) => setTimeout(r, 900));
        if (stale()) return;
      }
      setCountdown(0);

      const v = videoRef.current;
      if (!v) return;
      v.muted = true;
      v.currentTime = 0;

      let limitTimer: ReturnType<typeof setTimeout> | undefined;
      let recorder: MediaRecorder;
      try {
        const mime = pickSupportedMime(MIME_CANDIDATES, (m) => MediaRecorder.isTypeSupported(m));
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        micStream = null;
        setHint(HINT.micBroken);
        setPhase('idle');
        return;
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        clearTimeout(limitTimer);
        if (stale()) return;
        const mime = chunks[0]?.type || 'audio/webm';
        setRecorded({ blob: new Blob(chunks, { type: mime }), mime });
        setProgress(100);
        setHint(HINT.recorded);
        setPhase('recorded');
        const vv = videoRef.current;
        if (vv) {
          vv.pause();
          vv.currentTime = 0;
        }
      };
      recorderRef.current = recorder;

      setHint(HINT.recording);
      setPhase('recording');
      await v.play().catch(() => {});
      if (stale()) {
        v.pause();
        return;
      }
      try {
        recorder.start();
      } catch {
        micStream = null;
        setHint(HINT.recordFailed);
        setPhase('idle');
        return;
      }

      // 영상이 끝나면 onEnded가 멈추지만, 재생이 막히거나 길이를 못 읽는 경우를 대비한 상한.
      const limitSec = (isFinite(v.duration) && v.duration > 0 ? v.duration : CLIP_SECONDS) + 2;
      limitTimer = setTimeout(() => {
        if (!stale()) stopRecorder();
      }, limitSec * 1000);
    })();
  }, [phase, stopRecorder, videoRef]);

  const replay = useCallback(() => {
    if (!recorded) return;
    stopReplay();
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.currentTime = 0;
    const url = URL.createObjectURL(recorded.blob);
    const audio = new Audio(url);
    replayRef.current = { audio, url };
    setHint(HINT.replaying);
    setPhase('replaying');
    void v.play().catch(() => {});
    void audio.play().catch(() => {});
  }, [recorded, stopReplay, videoRef]);

  // 화면을 벗어날 때 남은 리소스(재생용 blob URL, 녹음기)를 확실히 반환한다.
  useEffect(() => () => {
    stopReplay();
    stopRecorder();
  }, [stopReplay, stopRecorder]);

  return {
    phase,
    hint,
    showProgress: PROGRESS_PHASES.includes(phase),
    progress,
    countdown,
    recordedBlob: recorded?.blob ?? null,
    recordedMime: recorded?.mime ?? '',
    togglePreview,
    startRecord,
    replay,
    reset,
  };
}
