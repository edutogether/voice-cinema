// 설치판의 메일 전달: 인터넷이 돌아오면 영상을 올리고 → 인솔 교사에게 메일을 보내고 → 기기에서 지운다.
// 업로드에 App Check 토큰이 필요해 화면 쪽에서 돈다. 보관은 메인 프로세스(desktop/mail-store.js)가 암호화해서 한다.
// 이 판은 시험판이다: 영상 올리기까지는 실제로 하고, 메일은 보내지 않고 «보낸 것으로 처리»를 화면에 보인다.
// 🔴 이 파일의 로그에 메일 주소 · 이름을 넣지 않는다.
import { buildUploadFilename } from '../logic';
import { afterFailure, buildMail, dueGroups, type MailItem, type MailMessage } from './mailQueue';
import { uploadToCloud } from './upload';

type MailInfo = Pick<MailItem, 'name' | 'email' | 'genreId' | 'genreName'>;

declare global {
  interface Window {
    vcDesktop?: {
      mail: {
        add(info: MailInfo, bytes: ArrayBuffer): Promise<string>;
        list(): Promise<MailItem[]>;
        video(id: string): Promise<Uint8Array>;
        update(id: string, patch: Partial<MailItem>): Promise<void>;
        remove(id: string): Promise<void>;
      };
    };
  }
}

const bridge = window.vcDesktop?.mail ?? null;
const POLL_MS = 15_000;
const TRIAL_SEND_MS = 1500;

/** 웹에는 다리가 없다 — 이 값이 거짓이면 메일 화면을 하나도 그리지 않는다. */
export const mailEnabled = bridge !== null;

export type MailActivity = 'upload' | 'send' | 'delete';

/** «보낸 것으로 처리»한 기록 — 화면에만 보이고 저장하지 않는다. */
export interface TrialSent {
  key: number;
  mail: MailMessage;
  count: number;
  left: number;
}

export interface MailState {
  items: MailItem[];
  activity: MailActivity | null;
  trialOffline: boolean;
  trialSent: TrialSent[];
}

let state: MailState = { items: [], activity: null, trialOffline: false, trialSent: [] };
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

/** 시험판의 «인터넷 끊김 시험»까지 본다. 진짜 끊김은 navigator.onLine이 알린다. */
export const isOnline = () => navigator.onLine && !state.trialOffline;

const refresh = async () => {
  if (bridge) setState({ items: await bridge.list() });
};

async function upload(item: MailItem): Promise<string> {
  const bytes = await bridge!.video(item.id);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const url = await uploadToCloud(new Blob([bytes as BlobPart], { type: 'video/mp4' }), buildUploadFilename(item.genreId, item.createdAt, token));
  await bridge!.update(item.id, { url });
  return url;
}

let running = false;
let sentCount = 0;
async function run(): Promise<void> {
  if (!bridge || running || !isOnline()) return;
  running = true;
  try {
    for (const group of dueGroups(await bridge.list(), Date.now())) {
      if (!isOnline()) break;
      try {
        setState({ activity: 'upload' });
        for (const item of group) item.url ??= await upload(item);
        setState({ activity: 'send' });
        const mail = buildMail(group);
        await new Promise((done) => setTimeout(done, TRIAL_SEND_MS));
        setState({ activity: 'delete' });
        for (const item of group) await bridge.remove(item.id);
        await refresh();
        setState({ trialSent: [...state.trialSent, { key: ++sentCount, mail, count: group.length, left: state.items.length }] });
      } catch (e) {
        console.error('[메일 대기열] 이번에는 보내지 못함', e instanceof Error ? e.message : '');
        for (const item of group) await bridge.update(item.id, afterFailure(item, Date.now()));
        await refresh();
      }
    }
  } catch (e) {
    console.error('[메일 대기열] 처리 중단', e instanceof Error ? e.message : '');
  } finally {
    running = false;
    setState({ activity: null });
  }
}

/** 인터넷이 돌아왔다 — 기다리던 건과 «보내지 못함»을 전부 처음부터 다시 시도한다. */
async function retryAll(): Promise<void> {
  if (!bridge) return;
  for (const item of await bridge.list()) await bridge.update(item.id, { attempts: 0, nextAt: 0, failed: false });
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
  await bridge!.add(info, await blob.arrayBuffer());
  await refresh();
  void run();
}

export async function retryMail(id: string): Promise<void> {
  await bridge!.update(id, { attempts: 0, nextAt: 0, failed: false });
  await refresh();
  void run();
}

export async function removeMail(id: string): Promise<void> {
  await bridge!.remove(id);
  await refresh();
}

export function setTrialOffline(trialOffline: boolean): void {
  setState({ trialOffline });
  if (!trialOffline) void retryAll();
}

export function dismissTrialSent(key: number): void {
  setState({ trialSent: state.trialSent.filter((sent) => sent.key !== key) });
}
