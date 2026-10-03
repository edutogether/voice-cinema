/** 로컬 디자인 시안에서만 마이크 없이 녹음 화면을 체험한다. */
export function isLocalRecordingSample(location: Pick<Location, 'hostname' | 'search'>): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && new URLSearchParams(location.search).get('preview') === 'home-design';
}
