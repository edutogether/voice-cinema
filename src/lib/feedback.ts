/* 현장 의견 보내기(2026-11-08 Bumm님 «Poster Studio와 똑같이», 팀장 전달 — _docs/intents/2026-11-08-field-feedback).
   웹 첫 화면 «의견 보내기» 창이 이름 · 의견과 함께 판 번호 · 화면 크기 · 기기 · 단계를 서버(/feedback)로 보낸다.
   서버가 Firestore에 저장하고 Bumm님 카카오톡으로 알린다. 녹음한 목소리 · 영화는 싣지 않는다. */
import { API_BASE } from '../config';
import { boothHeaders } from './upload';

export const FEEDBACK_NAME_MAX = 40;
export const FEEDBACK_TEXT_MAX = 500;
const NAME_KEY = 'voiceCinema.feedbackName';
// 서버는 받은 순간부터 10초 안에 답한다(functions/feedback.js의 FEEDBACK_REPLY_BUDGET_MS) — 여유 5초를 더한 값이고, test/contract.test.js가 순서를 고정한다.
// App Check 토큰을 기다리는 시간은 boothHeaders가 따로 묶는다
const TIMEOUT_MS = 15000;

export type FeedbackResult = 'ok' | 'offline' | 'busy' | 'closed' | 'error';

// 이름은 그 기기에만 기억한다(저장소가 막힌 브라우저에서는 기억하지 못할 뿐 보내기는 된다)
export function rememberedName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
export function rememberName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* 기억하지 못해도 된다 */ }
}

/** 함께 보내는 것 — 판 번호(화면 번들 파일 이름) · 화면 크기(창 폭 × 높이 @ 배율) · 기기 갈래(public/fit.js의 data-fit) · 단계 */
export function feedbackContext(step: number) {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
  const file = src.split(/[?#]/)[0].split('/').pop() ?? '';
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return {
    version: /^[\w.-]{1,80}$/.test(file) ? file : 'unknown',
    screen: `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}@${dpr}`,
    device: document.documentElement.dataset.fit ?? 'unknown',
    step,
  };
}

// 보내기 전과 실패한 뒤에 각각 다시 읽는다(그사이 끊길 수 있다)
const isOffline = () => navigator.onLine === false;

export async function sendFeedback(name: string, text: string, step: number): Promise<FeedbackResult> {
  if (isOffline()) return 'offline';
  try {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: await boothHeaders(),
      body: JSON.stringify({ name, text, ...feedbackContext(step) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return 'ok';
    if (res.status === 410) return 'closed';
    return res.status === 429 ? 'busy' : 'error';
  } catch {
    return isOffline() ? 'offline' : 'error';
  }
}
