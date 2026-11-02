import { LOCAL_HOSTS } from './sceneMode';

/** 로컬 디자인 시안에서만 마이크 없이 녹음 화면을 체험한다. */
export function isLocalRecordingSample(location: Pick<Location, 'hostname' | 'search'>): boolean {
  return LOCAL_HOSTS.includes(location.hostname)
    && new URLSearchParams(location.search).get('preview') === 'home-design';
}
