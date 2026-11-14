// 메일 전달: 인터넷이 돌아오면 영상을 올리고 → 담임교사에게 메일을 보내고 → 기기에서 지운다.
// 업로드 · 메일 모두 App Check 토큰이 필요해 화면 쪽에서 돈다. 보관은 설치판이면 메인 프로세스(desktop/mail-store.js)가 암호화해서 하고,
// 웹(크롬)이면 이 사이트의 IndexedDB(src/lib/mailStoreWeb.ts)에 한다(2026-11-08 Bumm님 «웹도 끊기면 메일 칸을 띄움»).
// 메일은 서버(functions/index.js의 /mail)가 정한 틀로 Resend를 거쳐 보낸다 — 여기서는 받는 주소 · 이름 · 영화 링크만 넘긴다(2026-11-08 실제 발송).
// 끊김은 기기가 알리는 것(navigator.onLine)만 본다 — 시험은 끊김을 흉내 낸다(e2e/web-mail.spec.js, desktop/e2e/mail.spec.mjs).
// 🔴 이 파일의 로그에 메일 주소 · 이름을 넣지 않는다.
import { API_BASE } from '../config';
import { buildUploadFilename } from '../logic';
import { IN_INSTALLER } from './installer';
import { afterFailure, dueGroups, type MailItem } from './mailQueue';
import { webMailStore, type MailInfo, type MailStore } from './mailStoreWeb';
import { boothHeaders, HttpError, uploadToCloud } from './upload';

declare global {
  interface Window {
    vcDesktop?: { mail: MailStore };
  }
}

// 설치판은 암호화 보관(다리)만 쓴다 — 다리를 열지 못하면(키 손상 등) 웹 보관으로 넘어가지 않는다.
// 웹은 IndexedDB가 있을 때만. 보관이 없으면 메일 칸에서 «맞아요, 보내 주세요»가 맡기지 못하고 «다시 제작하기»를 안내한다(11/9 — «이 기기에 저장»은 휴대폰만, Result.tsx).
const bridge: MailStore | null = IN_INSTALLER
  ? window.vcDesktop?.mail ?? null
  : typeof indexedDB === 'undefined' ? null : webMailStore;
const POLL_MS = 15_000;
// 서버는 Resend를 15초까지 기다린다 — 그보다 넉넉히 기다리고, 넘으면 이번에는 실패로 세어 나중에 다시 보낸다
const MAIL_TIMEOUT_MS = 30_000;
// 창(탭)이 여러 개여도 한 창만 보낸다 — 같은 영화를 두 번 올리거나 메일이 두 통 가지 않게
const DELIVERY_LOCK = 'voice-cinema-mail';

/** 메일 보관이 있으면 참이다 — 거짓이면 첫 화면의 «메일 대기» 단추를 그리지 않는다. */
export const mailEnabled = bridge !== null;
/** 웹 보관이면 참이다 — 대기 화면이 «이 창이 열려 있어야» · «크롬 기록을 지우면»을 알린다. */
export const mailInBrowser = bridge === webMailStore;

export type MailActivity = 'upload' | 'send' | 'delete';

export interface MailState {
  items: MailItem[];
  activity: MailActivity | null;
}

let state: MailState = { items: [], activity: null };
const listeners = new Set<() => void>();
const setState = (patch: Partial<MailState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const subscribeMail = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getMailState = () => state;

/** 기기가 연결 없음을 알리면 거짓이다. */
export const isOnline = () => navigator.onLine;

// 보관을 읽지 못해도(브라우저가 저장소를 막는 등) 화면을 멈추지 않는다 — 목록만 그대로 둔다
const refresh = async () => {
  if (!bridge) return;
  try {
    setState({ items: await bridge.list() });
  } catch (e) {
    console.error('[메일 대기열] 목록을 읽지 못함', e instanceof Error ? e.message : '');
  }
};

async function upload(item: MailItem): Promise<string> {
  const bytes = await bridge!.video(item.id);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const url = await uploadToCloud(new Blob([bytes as BlobPart], { type: 'video/mp4' }), buildUploadFilename(item.genreId, item.createdAt, token));
  await bridge!.update(item.id, { url });
  return url;
}

/** 한 묶음(한 선생님 몫, 30편까지 — mailQueue.ts의 dueGroups)을 한 통으로 보낸다. 서버가 { ok: true }로 답해야 보낸 것이다 — 그 밖은 모두 실패로 세어 나중에 다시 보낸다. */
async function send(group: MailItem[]): Promise<void> {
  const resp = await fetch(`${API_BASE}/mail`, {
    method: 'POST',
    headers: await boothHeaders(),
    body: JSON.stringify({ to: group[0].email.trim(), items: group.map((item) => ({ name: item.name.trim(), url: item.url })) }),
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
  });
  let json: { ok?: boolean } = {};
  try { json = await resp.json(); } catch { /* 응답이 JSON이 아니면 실패로 센다 */ }
  if (!resp.ok || json.ok !== true) throw new HttpError(`메일 서버 응답 ${resp.status}`, resp.status);
}

/** 서버가 요청을 거절했다(4xx) — 연결 실패 · 시간 초과 · 5xx는 아니다(mailQueue.ts의 afterFailure). */
const rejected = (e: unknown) => e instanceof HttpError && e.status >= 400 && e.status < 500;

let running = false;
async function run(): Promise<void> {
  if (!bridge || running || !isOnline()) return;
  running = true;
  try {
    // 다른 창이 보내는 중이면 기다리지 않고 목록만 새로 읽는다 — 그 창이 끝내면 다음 차례에 이 창도 지워진 것을 본다
    if (navigator.locks) await navigator.locks.request(DELIVERY_LOCK, { ifAvailable: true }, (lock) => (lock ? deliver(bridge!) : refresh()));
    else await deliver(bridge);
  } finally {
    running = false;
  }
}

async function deliver(store: MailStore): Promise<void> {
  try {
    // 읽은 목록을 화면에도 알린다 — 다른 창이 이미 보내고 지웠으면 여기서 빈 목록을 읽고, 이 창의 «메일 대기»도 그때 사라진다
    // (11/9 CI: 늦게 잠금을 잡은 창이 빈 목록을 알리지 않아 «메일 대기 1건»이 끝까지 남았다)
    const items = await store.list();
    setState({ items });
    for (const group of dueGroups(items, Date.now())) {
      if (!isOnline()) break;
      try {
        setState({ activity: 'upload' });
        for (const item of group) item.url ??= await upload(item);
        setState({ activity: 'send' });
        await send(group);
        setState({ activity: 'delete' });
        for (const item of group) await store.remove(item.id);
        await refresh();
      } catch (e) {
        console.error('[메일 대기열] 이번에는 보내지 못함', e instanceof Error ? e.message : '');
        for (const item of group) await store.update(item.id, afterFailure(item, Date.now(), rejected(e)));
        await refresh();
      }
    }
  } catch (e) {
    console.error('[메일 대기열] 처리 중단', e instanceof Error ? e.message : '');
  } finally {
    setState({ activity: null });
  }
}

/** 인터넷이 돌아왔다 — 기다리던 건과 «보내지 못함»을 전부 처음부터 다시 시도한다. */
async function retryAll(): Promise<void> {
  if (!bridge) return;
  try {
    for (const item of await bridge.list()) await bridge.update(item.id, { attempts: 0, rejections: 0, nextAt: 0, failed: false });
  } catch (e) {
    console.error('[메일 대기열] 다시 시도를 준비하지 못함', e instanceof Error ? e.message : '');
  }
  await refresh();
  await run();
}

/** 앱이 뜰 때 한 번. 꺼져 있는 동안 남은 건도 이어서 보낸다. */
export function startMailDelivery(): void {
  if (!bridge) return;
  window.addEventListener('online', () => { void retryAll(); });
  setInterval(() => { void run(); }, POLL_MS);
  void refresh().then(run);
}

export async function queueMail(info: MailInfo, blob: Blob): Promise<void> {
  if (!bridge) throw new Error('메일 보관 없음');
  await bridge.add(info, await blob.arrayBuffer());
  await refresh();
  void run();
}

export async function retryMail(id: string): Promise<void> {
  await bridge!.update(id, { attempts: 0, rejections: 0, nextAt: 0, failed: false });
  await refresh();
  void run();
}

export async function removeMail(id: string): Promise<void> {
  await bridge!.remove(id);
  await refresh();
}
