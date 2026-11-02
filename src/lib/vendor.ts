// public/vendor/ 아래 파일들은 번들러가 건드리지 않고 원본 그대로 복사된다.
// ffmpeg.wasm은 Worker + WebAssembly + blob: URL로 코어를 스스로 로드하는데,
// 번들러가 이 파일들을 해시·재작성하면 그 경로 해석이 깨진다. 그래서 절대 경로로
// 동적 import 한다(@vite-ignore로 번들러의 정적 해석 자체를 막는다).

export interface FFmpegInstance {
  load(opts: { coreURL: string; wasmURL: string }): Promise<void>;
  writeFile(name: string, data: Uint8Array): Promise<void>;
  readFile(name: string): Promise<{ buffer: ArrayBuffer }>;
  deleteFile(name: string): Promise<void>;
  exec(args: string[]): Promise<number>;
  on(event: 'log', cb: (e: { message: string }) => void): void;
  off(event: 'log', cb: (e: { message: string }) => void): void;
}

interface FFmpegModule {
  FFmpeg: new () => FFmpegInstance;
}
interface FFmpegUtilModule {
  fetchFile: (input: string | Blob) => Promise<Uint8Array>;
}
interface AppCheckModule {
  initializeApp: (config: object) => unknown;
  initializeAppCheck: (app: unknown, opts: object) => unknown;
  ReCaptchaEnterpriseProvider: new (key: string) => unknown;
  getToken: (instance: unknown) => Promise<{ token: string }>;
}

// qrcode.js는 전역 함수를 노출하는 고전 스크립트다(index.html의 <script src>).
declare global {
  interface Window {
    qrcode: (typeNumber: number, errorCorrectionLevel: string) => {
      addData(text: string): void;
      make(): void;
      createDataURL(cellSize: number, margin: number): string;
    };
  }
}

// 한 번 받은 모듈은 다시 받지 않는다. 받기에 실패한 약속은 버린다 — 와이파이가 잠깐 끊겨 한 번 실패해도 다음 시도(저장 다시 누르기 등)에
// 새로고침 없이 다시 받는다(11/2 종합감사 — 예전에는 실패한 약속을 그대로 들고 있어 ffmpeg.ts의 «다음 저장 시도에 다시 받는다»가 지켜지지 않았다)
const loadOnce = <T>(path: string): (() => Promise<T>) => {
  let promise: Promise<T> | null = null;
  return () => (promise ??= (import(/* @vite-ignore */ path) as Promise<T>).catch((error: unknown) => {
    promise = null;
    throw error;
  }));
};

export const loadFFmpegModule = loadOnce<FFmpegModule>('/vendor/ffmpeg/index.js');
export const loadFFmpegUtil = loadOnce<FFmpegUtilModule>('/vendor/ffmpeg-util/index.js');
export const loadAppCheckModule = loadOnce<AppCheckModule>('/vendor/firebase/firebase-app-check.js');

export function makeQR(text: string): string {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(8, 8);
}
