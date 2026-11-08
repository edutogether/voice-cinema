import { API_BASE, BOOTH_TOKEN, FIREBASE_CONFIG, MAX_UPLOAD_ATTEMPTS, RECAPTCHA_ENTERPRISE_SITE_KEY, UPLOAD_TIMEOUT_MS } from '../config';
import { shouldRetryUpload } from '../logic';
import { loadAppCheckModule } from './vendor';

let appCheck: Promise<unknown> | null = null;

// App Check 토큰을 기다리는 상한. reCAPTCHA가 끝내 준비되지 않으면(학교 망이 구글을 막거나 느린 와이파이에서 스크립트가 안 오면) 토큰 약속이
// 끝나지 않아 업로드가 영영 시작되지 않았다 — 요청 하나 없이 «저장하고 있어요»에 멈춘다(10/24 느린 회선 측정에서 발견). 상한이 지나면
// 토큰 없이 보내고, 판단은 서버가 한다(거절되면 재시도 → 이 기기에 저장으로 이어진다).
const APP_CHECK_WAIT_MS = 20000;

const RECAPTCHA_SCRIPT = 'https://www.google.com/recaptcha/enterprise.js?render=explicit';
type RecaptchaWindow = Window & { grecaptcha?: { enterprise?: { ready?: (callback: () => void) => void } }; ___grecaptcha_cfg?: unknown };

/**
 * reCAPTCHA Enterprise를 받아 준비될 때까지 기다린다. 이 스크립트가 다시 넣는 gstatic 스크립트까지, 하나라도 받지 못하면
 * 넣은 스크립트와 전역 grecaptcha를 지우고 거절한다 — 다음에 처음부터 다시 받게 한다(로더는 남은 grecaptcha를 그대로 이어 쓴다).
 */
function loadRecaptcha(): Promise<void> {
  const w = window as RecaptchaWindow;
  const isRecaptcha = (el: EventTarget | null): el is HTMLScriptElement =>
    el instanceof HTMLScriptElement && /^https:\/\/www\.(google|gstatic)\.com\/recaptcha\//.test(el.src);
  return new Promise((resolve, reject) => {
    const stopWatching = () => document.removeEventListener('error', onError, true);
    const fail = (reason: string) => {
      stopWatching();
      for (const el of document.querySelectorAll('script')) if (isRecaptcha(el)) el.remove();
      delete w.grecaptcha;
      delete w.___grecaptcha_cfg;
      reject(new Error(reason));
    };
    // 스크립트의 error는 거품이 일지 않지만 document의 잡기 단계에는 온다 — 로더가 넣는 스크립트의 실패도 여기서 본다
    function onError(event: Event) {
      if (isRecaptcha(event.target)) fail('reCAPTCHA 스크립트를 받지 못함');
    }
    document.addEventListener('error', onError, true);
    const script = document.createElement('script');
    script.src = RECAPTCHA_SCRIPT;
    script.onload = () => {
      const ready = w.grecaptcha?.enterprise?.ready;
      if (!ready) return fail('reCAPTCHA가 준비 함수를 내지 않음');
      ready(() => {
        stopWatching();
        resolve();
      });
    };
    document.head.appendChild(script);
  });
}

/** App Check(reCAPTCHA Enterprise) 인스턴스. 저장 시점의 토큰 발급 대기를 줄이려 미리 초기화해 둔다. */
export function initAppCheck(): Promise<unknown> {
  return (appCheck ??= (async () => {
    const m = await loadAppCheckModule();
    // SDK가 스스로 넣는 reCAPTCHA 스크립트는 받기 실패를 다루지 않는다(onload만 건다). 그래서 끊긴 채 연 창은 준비 약속이 끝나지 않아
    // 인터넷이 돌아와도 토큰을 받지 못했다 — 11/8 실측: App Check 교환 0번, 업로드 401만 네 번. 와이파이 없이 켜는 설치판도 같다.
    // SDK를 켜기 전에 직접 받아 둔다(SDK는 이미 있는 grecaptcha를 그대로 쓴다). 받지 못하면 이 약속을 버려 다음 요청이 다시 받는다.
    await loadRecaptcha();
    const app = m.initializeApp(FIREBASE_CONFIG);
    return m.initializeAppCheck(app, {
      provider: new m.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  })().catch((e: unknown) => {
    appCheck = null;
    throw e;
  }));
}

async function appCheckToken(): Promise<string> {
  const m = await loadAppCheckModule();
  const result = await m.getToken(await initAppCheck());
  return result.token;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(new Error('인코딩 실패'));
    fr.readAsDataURL(blob);
  });
}

/** 업로드 서버가 보는 헤더 — 공개 부스 토큰과 App Check 토큰. 업로드와 설치판의 메일 전달(/mail)이 같이 쓴다. */
export async function boothHeaders(): Promise<Record<string, string>> {
  // 토큰 발급 자체가 실패해도(reCAPTCHA 차단 등) 여기서 미리 포기하지 않고 헤더 없이
  // 그대로 보낸다 — 실제 보안 판단은 서버가 하므로, 클라이언트가 먼저 던지든 서버가
  // 401을 주든 최종적으로 겪는 재시도·폴백 결과는 같다.
  let token = '';
  try {
    token = await Promise.race([
      appCheckToken(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error(`${APP_CHECK_WAIT_MS / 1000}초 안에 준비되지 않음`)), APP_CHECK_WAIT_MS)),
    ]);
  } catch (e) {
    console.warn('[App Check 토큰 발급 실패]', e instanceof Error ? e.message : e);
  }
  return { 'Content-Type': 'application/json', 'x-booth-token': BOOTH_TOKEN, 'X-Firebase-AppCheck': token };
}

async function uploadOnce(dataBase64: string, filename: string): Promise<string> {
  const headers = await boothHeaders();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename, mimeType: 'video/mp4', dataBase64 }),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let json: { ok?: boolean; url?: string; error?: string };
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error('저장 응답 파싱 실패: ' + text.slice(0, 200), { cause: e });
    }
    if (!json.ok || !json.url) throw new Error('영상 저장 실패: ' + (json.error || 'unknown'));
    return json.url;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 완성본을 Cloud Functions 경유로 올리고 공개 URL을 돌려준다.
 * 부스 와이파이는 순간적으로 끊기는 일이 흔해 재시도를 둔다. 타임아웃(AbortError)은
 * shouldRetryUpload()가 재시도 대상에서 빼므로 느린 회선에서 대기가 배로 늘지 않는다.
 */
export async function uploadToCloud(blob: Blob, filename: string): Promise<string> {
  const dataBase64 = await blobToBase64(blob);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      return await uploadOnce(dataBase64, filename);
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_UPLOAD_ATTEMPTS || !shouldRetryUpload(e)) throw e;
      console.warn(`[업로드 ${attempt}차 실패, 재시도]`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr;
}

/** 업로드에 실패했을 때 이 기기에 직접 내려받게 한다(로컬 폴백). */
export function downloadBlob(blob: Blob, filename: string): () => void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 클릭 직후 바로 회수하면 일부 브라우저에서 다운로드가 취소되므로 한 틱 뒤에 회수한다.
  const timer = setTimeout(() => URL.revokeObjectURL(url), 60000);
  return () => {
    clearTimeout(timer);
    URL.revokeObjectURL(url);
  };
}
