import { afterEach, describe, expect, it, vi } from 'vitest';
import { installServiceWorker, serviceWorkerRegistering } from './sw';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('등록 결과', () => {
  function install(register: () => Promise<unknown>) {
    vi.stubEnv('PROD', true);
    vi.stubGlobal('navigator', { serviceWorker: Object.assign(new EventTarget(), { controller: null, register: vi.fn(register) }) });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout }));
    vi.stubGlobal('document', { readyState: 'complete' });
    installServiceWorker();
  }
  it('등록이 실패하면 false로 끝난다 — 엔진 받기가 서비스워커를 기다리지 않는다(Windows 설치판은 /sw.js가 404)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    install(() => Promise.reject(new Error('404')));
    await expect(serviceWorkerRegistering()).resolves.toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
  it('등록되면 true로 끝난다', async () => {
    install(() => Promise.resolve({}));
    await expect(serviceWorkerRegistering()).resolves.toBe(true);
  });
});
