// 원판에 구울 로고 띠 — tools/video-logos.png(1920×1080, 투명 바탕)를 만든다(Playwright 크로미움 필요).
//
//   node tools/build-video-logos.mjs
//
// 10/20 대표님: 완성 화면 그림과 «실제로 내려받는 영상»의 왼쪽 위에 InKY Film Festival, 오른쪽 위에 인천광역시교육청.
// 공식 로고 파일만 쓰고 색을 바꾸거나 새로 그리지 않는다 — InKY는 머리글과 같은 모양(공식 조합 파일 inky.png의 카메라
// 영역 + «InKY Film Festival» 글자, src/components/FestivalHeader.tsx), 교육청은 education.png 그대로.
// 교육청 로고 글자는 남색이라 어두운 장면에서 읽히지 않으므로 둘 다 머리글처럼 흰 바탕 띠 위에 얹는다.
// 합성은 영상을 다시 인코딩하지 않으므로(-c:v copy, src/lib/ffmpeg.ts) 로고는 원판에 미리 구워 둔다(tools/build-scene.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = (path, type) => `data:${type};base64,${readFileSync(join(root, path)).toString('base64')}`;

// 머리글 심벌(45×32, 조합 파일을 너비 254로 줄여 왼쪽으로 38 민 자리)을 높이 42에 맞춰 같은 비율로 키운다.
const SYMBOL = 42 / 32;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family:P; font-weight:400; src:url(${data('fonts/Pretendard-Regular.woff2', 'font/woff2')}) format('woff2'); }
@font-face { font-family:P; font-weight:800; src:url(${data('fonts/Pretendard-ExtraBold.woff2', 'font/woff2')}) format('woff2'); }
html,body { margin:0; width:1920px; height:1080px; background:transparent; }
.logo { position:absolute; top:32px; height:64px; display:flex; align-items:center; gap:12px; padding:0 24px; box-sizing:border-box;
  border-radius:999px; background:#fff; box-shadow:0 3px 14px rgba(0,0,0,.28); font-family:P; font-size:28px; line-height:1;
  color:#171717; letter-spacing:-.6px; white-space:nowrap; }
.inky { left:36px; }
.education { right:36px; }
.symbol { position:relative; display:block; overflow:hidden; width:${45 * SYMBOL}px; height:${32 * SYMBOL}px; }
.symbol img { position:absolute; left:${-38 * SYMBOL}px; top:0; width:${254 * SYMBOL}px; }
strong { font-weight:800; }
.education img { display:block; height:44px; width:auto; }
</style>
<div class="logo inky"><span class="symbol"><img src="${data('public/brands/inky.png', 'image/png')}"></span><span><strong>InKY</strong> Film Festival</span></div>
<div class="logo education"><img src="${data('public/brands/education.png', 'image/png')}"></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate('document.fonts.ready');
const out = join(root, 'tools', 'video-logos.png');
await page.screenshot({ path: out, omitBackground: true });
await browser.close();
console.log(`로고 띠: ${out}`);
