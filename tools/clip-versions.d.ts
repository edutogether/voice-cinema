import type { Plugin } from 'vite';

export function clipVersions(options: {
  /** 해시를 낼 폴더(public/clips) */
  dir: string;
}): Plugin;
