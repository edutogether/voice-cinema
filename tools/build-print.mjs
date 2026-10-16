// 인쇄물 네 종(설치운영설명서·부스 게시물·교사용 안내·교육청 장면 검토 자료)을 HTML 원본에서 A4 PDF로 뽑는다(Playwright 크로미움).
//
//   node tools/build-print.mjs
//
// 원본: _docs/ops/print/*.html(공통 양식 print.css, 그림 img/). 결과: _docs/ops/Voice Cinema_<이름>.pdf
// 원본을 고친 뒤 다시 돌리면 된다. 쪽수를 함께 찍어 넘침(게시물 한 장·교사용 2~3쪽)을 바로 알 수 있게 한다.
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const src = join(root, '_docs', 'ops', 'print');
const DOCS = [
  { html: 'operator-manual.html', pdf: 'Voice Cinema_설치운영설명서.pdf' },
  { html: 'booth-poster.html', pdf: 'Voice Cinema_부스게시물.pdf', maxPages: 1 },
  { html: 'teacher-guide.html', pdf: 'Voice Cinema_교사용안내.pdf', maxPages: 3 },
  { html: 'review-summary.html', pdf: 'Voice Cinema_장면검토자료.pdf', maxPages: 1 },
];

const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage();
  for (const doc of DOCS) {
    const file = join(src, doc.html);
    if (!existsSync(file)) throw new Error(`원본이 없다: ${file}`);
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
    await page.evaluate('document.fonts.ready');
    // 그림이 안 보이면(경로 틀림·아직 안 찍음) PDF에 빈 칸이 나가므로 이름을 알린다
    const broken = await page.locator('img').evaluateAll((imgs) => imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute('src')));
    if (broken.length) { failed = true; console.error(`${doc.html}: 그림을 못 읽음 — ${broken.join(', ')}`); }
    const out = join(root, '_docs', 'ops', doc.pdf);
    await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pages = (readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const over = doc.maxPages && pages > doc.maxPages;
    if (over) failed = true;
    console.log(`${doc.pdf}: ${pages}쪽${over ? ` — ${doc.maxPages}쪽을 넘음` : ''}`);
  }
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
