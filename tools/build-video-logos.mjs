// 원판에 구울 로고 — tools/video-logos.png(1920×1080, 투명 바탕)를 만든다(Playwright 크로미움 필요).
//
//   node tools/build-video-logos.mjs
//
// 10/20 대표님: 완성 화면 그림과 «실제로 내려받는 영상»의 왼쪽 위에 InKY Film Festival, 오른쪽 위에 인천광역시교육청.
// 11/13 Bumm님: 영상 속 로고도 완성 화면 그림(누르기 전)처럼 — 흰 바탕 알약 없이 로고 · 글자를 그림 위에 바로, 그 크기 · 자리로.
// 그래서 휴대폰 완성 그림의 로고 값(src/styles/result.css 600 이하 묶음 — 위 14 · 높이 22 · 좌우 16 · 글자 13px · 그림자)을
// 휴대폰 영상 폭(390)에서 영상 폭(1920)으로 같은 비율로 키운다. 휴대폰에서 ▶를 눌러도 로고 크기가 그림 때와 같다.
// 공식 로고 파일만 쓰고 색을 바꾸거나 새로 그리지 않는다 — InKY는 완성 그림과 같은 모양(공식 조합 파일 inky.png의 카메라
// 영역 + 흰 «InKY Film Festival» 글자, Result.tsx), 교육청은 같은 education-on-dark.svg(엠블럼 공식 색 · 글자 흰색).
// 완성 그림은 위쪽 그림자 띠(.result-poster::before)가 흰 로고를 받치지만 영상에는 띠를 굽지 않는다(장면이 어두워진다) —
// 대신 로고 · 글자에 그림자를 단다.
// 합성은 영상을 다시 인코딩하지 않으므로(-c:v copy, src/lib/ffmpeg.ts) 로고는 원판에 미리 구워 둔다(tools/build-scene.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = (path, type) => `data:${type};base64,${readFileSync(join(root, path)).toString('base64')}`;

// 휴대폰 완성 그림 폭 390 → 영상 폭 1920
const K = 1920 / 390;
const px = (v) => `${(v * K).toFixed(2)}px`;
const SHADOW = `0 0 ${px(5)} rgba(0,0,0,.5)`;
const SHADOW2 = `0 ${px(1)} ${px(3)} rgba(0,0,0,.5)`;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family:P; font-weight:400; src:url(${data('fonts/Pretendard-Regular.woff2', 'font/woff2')}) format('woff2'); }
@font-face { font-family:P; font-weight:800; src:url(${data('fonts/Pretendard-ExtraBold.woff2', 'font/woff2')}) format('woff2'); }
html,body { margin:0; width:1920px; height:1080px; background:transparent; }
.logo { position:absolute; top:${px(14)}; height:${px(22)}; display:flex; align-items:center; gap:${px(6)}; font-family:P;
  font-size:${px(13)}; line-height:1; color:#fff; letter-spacing:${px(-0.4)}; white-space:nowrap; text-shadow:${SHADOW},${SHADOW2}; }
.inky { left:${px(16)}; }
.education { right:${px(16)}; }
.symbol { position:relative; display:block; overflow:hidden; width:${px(28)}; height:${px(17.5)}; flex-shrink:0; filter:drop-shadow(${SHADOW}) drop-shadow(${SHADOW2}); }
.symbol img { position:absolute; left:${px(-23.75)}; top:0; width:${px(158.75)}; height:auto; }
strong { font-weight:800; }
.education img { display:block; height:${px(21)}; width:auto; filter:drop-shadow(${SHADOW}) drop-shadow(${SHADOW2}); }
</style>
<div class="logo inky"><span class="symbol"><img src="${data('public/brands/inky.png', 'image/png')}"></span><span><strong>InKY</strong> Film Festival</span></div>
<div class="logo education"><img src="${data('public/brands/education-on-dark.svg', 'image/svg+xml')}"></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate('document.fonts.ready');
const out = join(root, 'tools', 'video-logos.png');
await page.screenshot({ path: out, omitBackground: true });
await browser.close();
console.log(`로고: ${out}`);
