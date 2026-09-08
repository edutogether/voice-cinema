import type { Plugin } from 'vite';

export function precacheSW(options: {
  /** 치환 전 서비스워커 원본 경로 */
  swSource: string;
  /** 산출물 루트 기준 폴더명 — 이 아래 파일은 전부 프리캐시한다(기본: vendor) */
  precacheDirs?: string[];
  /** 프리캐시에서 제외할 폴더명 — 런타임 캐싱으로 넘긴다(기본: clips) */
  excludeDirs?: string[];
}): Plugin;
