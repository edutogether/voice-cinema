// 웹(크롬)의 메일 대기 보관(2026-11-08 Bumm님 «웹도 끊기면 메일 칸을 띄움») — 설치판 다리(desktop/mail-store.js)와 같은 다섯 가지를
// 이 사이트의 IndexedDB로 낸다. 정보(items)와 영상(videos)은 한 건씩 한 거래로 쓴다 — 도중에 창이 닫혀도 반쪽 건이 남지 않는다.
// 🟠 암호화하지 않는다: 웹에서는 열쇠도 같은 사이트 저장소에 둘 수밖에 없어 디스크를 읽는 사람에게서 지켜 주는 것이 없다
// (privacy.html에 «이 브라우저의 사이트 저장소에 보관»이라고 사실대로 적었다). 브라우저의 사이트 데이터를 지우면 함께 지워진다.
// 🔴 이 파일의 로그에 메일 주소 · 이름을 넣지 않는다.
import { MAIL_PURGE_AT } from '../config';
import type { MailItem } from './mailQueue';

export type MailInfo = Pick<MailItem, 'name' | 'email' | 'genreId' | 'genreName'>;

/** 설치판 다리(window.vcDesktop.mail)와 웹 보관이 같이 따르는 모양 — mailDelivery.ts는 어느 쪽인지 모른 채 쓴다. */
export interface MailStore {
  add(info: MailInfo, bytes: ArrayBuffer): Promise<string>;
  list(): Promise<MailItem[]>;
  video(id: string): Promise<Uint8Array>;
  update(id: string, patch: Partial<MailItem>): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'voice-cinema-mail';
const ITEMS = 'items';
const VIDEOS = 'videos';

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('보관 거래가 취소됨'));
  });
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(ITEMS, { keyPath: 'id' });
        req.result.createObjectStore(VIDEOS);
      };
      req.onsuccess = () => {
        const db = req.result;
        // 다른 창이 판을 올리면 이 연결을 닫아 막지 않는다 — 다음에 쓸 때 다시 연다
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    opening.catch(() => { opening = null; });
  }
  return opening;
}

export const webMailStore: MailStore = {
  async add(info, bytes) {
    const db = await open();
    const id = crypto.randomUUID();
    const tx = db.transaction([ITEMS, VIDEOS], 'readwrite');
    tx.objectStore(VIDEOS).put(new Blob([bytes], { type: 'video/mp4' }), id);
    tx.objectStore(ITEMS).put({ ...info, id, createdAt: Date.now(), attempts: 0, nextAt: 0, failed: false } satisfies MailItem);
    await finished(tx);
    return id;
  },

  /** 2026-12-01 00:00(KST) 이후 처음 읽을 때 전부 지운다 — 링크도 그때 사라진다(설치판과 같다). */
  async list() {
    const db = await open();
    if (Date.now() >= MAIL_PURGE_AT) {
      const tx = db.transaction([ITEMS, VIDEOS], 'readwrite');
      tx.objectStore(ITEMS).clear();
      tx.objectStore(VIDEOS).clear();
      await finished(tx);
      return [];
    }
    const items = await result(db.transaction(ITEMS).objectStore(ITEMS).getAll() as IDBRequest<MailItem[]>);
    return items.sort((a, b) => a.createdAt - b.createdAt);
  },

  async video(id) {
    const db = await open();
    const blob = await result(db.transaction(VIDEOS).objectStore(VIDEOS).get(id) as IDBRequest<Blob | undefined>);
    if (!blob) throw new Error('보관한 영상이 없음');
    return new Uint8Array(await blob.arrayBuffer());
  },

  async update(id, patch) {
    const db = await open();
    const tx = db.transaction(ITEMS, 'readwrite');
    const items = tx.objectStore(ITEMS);
    const item = await result(items.get(id) as IDBRequest<MailItem | undefined>);
    // 그사이 운영자가 지운 건은 되살리지 않는다
    if (item) items.put({ ...item, ...patch, id });
    await finished(tx);
  },

  async remove(id) {
    const db = await open();
    const tx = db.transaction([ITEMS, VIDEOS], 'readwrite');
    tx.objectStore(ITEMS).delete(id);
    tx.objectStore(VIDEOS).delete(id);
    await finished(tx);
  },
};
