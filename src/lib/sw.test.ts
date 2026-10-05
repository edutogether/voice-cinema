import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installServiceWorker } from './sw';

class PageScript { src = 'https://voice.example/assets/main-current.js'; }

function setup(assets: string[], controlled = true, responds = true) {
  vi.useFakeTimers();
  vi.stubEnv('PROD', true);
  const listeners = new Map<string, (event: unknown) => void>();
  const source = readFileSync('tools/sw-template.js', 'utf8')
    .replace('__PRECACHE_URLS__', JSON.stringify(assets)).replace('__CACHE_VERSION__', '"test"');
  vm.runInNewContext(source, { self: { addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn) } });
  const controller = { postMessage: vi.fn((data, ports) => {
    if (responds) listeners.get('message')!({ data, ports });
  }) };
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: controlled ? controller : null,
    register: vi.fn().mockResolvedValue({}),
  });
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout }));
  vi.stubGlobal('location', { href: 'https://voice.example/', origin: 'https://voice.example' });
  vi.stubGlobal('document', { readyState: 'complete', querySelectorAll: () => [new PageScript(), { href: 'https://voice.example/assets/main-current.css' }] });
  vi.stubGlobal('HTMLScriptElement', PageScript);
  vi.stubGlobal('MessageChannel', class {
    port1 = { onmessage: (_event: unknown) => {}, close: vi.fn() };
    port2 = { postMessage: (data: unknown) => this.port1.onmessage({ data }), close: vi.fn() };
  });
  const notify = vi.fn();
  const cleanup = installServiceWorker(notify)!;
  const change = () => {
    serviceWorker.controller = controller;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
  };
  return { notify, cleanup, change };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('실제로 열린 화면을 기준으로 업데이트 안내', () => {
  it('이미 최신 문서이면 SW가 뒤늦게 교체되어도 알리지 않는다', () => {
    const app = setup(['/assets/main-current.js', '/assets/main-current.css']);
    app.change();
    vi.runAllTimers();
    expect(app.notify).not.toHaveBeenCalled();
    app.cleanup();
  });
  it('JS 또는 CSS가 구버전인 문서에만 알린다', () => {
    for (const assets of [['/assets/main-new.js', '/assets/main-current.css'], ['/assets/main-current.js', '/assets/main-new.css']]) {
      const app = setup(assets);
      app.change();
      expect(app.notify).toHaveBeenCalledTimes(1);
      app.cleanup();
    }
  });
  it('첫 설치에는 알리지 않고 이후 업데이트는 알린다', () => {
    const app = setup(['/assets/main-new.js'], false);
    app.change();
    expect(app.notify).not.toHaveBeenCalled();
    app.change();
    expect(app.notify).toHaveBeenCalledTimes(1);
    app.cleanup();
  });
  it('이전 SW가 응답하지 않아도 수동 업데이트 안내는 유지한다', () => {
    const app = setup([], true, false);
    app.change();
    vi.advanceTimersByTime(3000);
    expect(app.notify).toHaveBeenCalledTimes(1);
    app.cleanup();
  });
  it('해제 시 이벤트와 응답 대기 타이머를 함께 정리한다', () => {
    const app = setup([], true, false);
    app.change();
    app.cleanup();
    app.change();
    vi.runAllTimers();
    expect(app.notify).not.toHaveBeenCalled();
  });
});
