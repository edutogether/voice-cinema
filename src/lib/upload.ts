import { API_BASE, BOOTH_TOKEN, FIREBASE_CONFIG, MAX_UPLOAD_ATTEMPTS, RECAPTCHA_ENTERPRISE_SITE_KEY, UPLOAD_TIMEOUT_MS } from '../config';
import { shouldRetryUpload } from '../logic';
import { loadAppCheckModule } from './vendor';

let appCheck: Promise<unknown> | null = null;

/** App Check(reCAPTCHA Enterprise) 인스턴스. 저장 시점의 토큰 발급 대기를 줄이려 미리 초기화해 둔다. */
export function initAppCheck(): Promise<unknown> {
  return (appCheck ??= (async () => {
    const m = await loadAppCheckModule();
    const app = m.initializeApp(FIREBASE_CONFIG);
    return m.initializeAppCheck(app, {
      provider: new m.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  })());
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

async function uploadOnce(dataBase64: string, filename: string): Promise<string> {
  // 토큰 발급 자체가 실패해도(reCAPTCHA 차단 등) 여기서 미리 포기하지 않고 헤더 없이
  // 그대로 보낸다 — 실제 보안 판단은 서버가 하므로, 클라이언트가 먼저 던지든 서버가
  // 401을 주든 최종적으로 겪는 재시도·폴백 결과는 같다.
  let token = '';
  try {
    token = await appCheckToken();
  } catch (e) {
    console.warn('[App Check 토큰 발급 실패]', e instanceof Error ? e.message : e);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-booth-token': BOOTH_TOKEN,
        'X-Firebase-AppCheck': token,
      },
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
