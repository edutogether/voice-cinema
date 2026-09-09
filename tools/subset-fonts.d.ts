import type { Plugin } from 'vite';

/** 빌드 산출물에 실제로 들어 있는 글자만 남긴 Pretendard 서브셋을 만든다. */
export function subsetFonts(options: { srcDir: string; outSubdir?: string }): Plugin;
