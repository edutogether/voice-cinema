#!/usr/bin/env node
/* 해상도 조사(2026-11-07 Bumm님 «모든 해상도 포스터 고쳤던거 기준으로», 팀장 전달) — Poster Studio의 scripts/verify/viewport-survey.mjs를 이 앱의 화면에 맞게 옮긴 것.

     node tools/verify/viewport-survey.mjs <주소 | dist 폴더> <결과 폴더> [--sizes 갈래:가로x세로,…] [--screens 낱말,…] [--capture] [--snapshot] [--assets <dist 폴더>] [--jobs 3] [--dpr 배율]
     node tools/verify/viewport-survey.mjs <Voice Cinema.exe> <결과 폴더> [--sizes desktop:가로x세로[@배율],…] [--screens 낱말,…] [--capture] [--jobs 2]
     node tools/verify/viewport-survey.mjs --selftest

   크기마다 진짜 흐름(스플래시 → 메인 → 녹음실 → 녹음 → 합성 → 완성, 오류 세 가지, 개인정보처리방침)을 지나며 화면마다 잰다:
   ① 가로 넘침(문서 폭 > 화면 폭) ② 화면 밖(잘라 주는 부모 없이 삐져나간 요소) · 칸 밖(잘라 내는 칸의 가장자리를 넘어 감춰진 단추 · 글)
   ③ 글자 잘림(감춘 칸보다 글이 김) ④ 겹침(글 · 그림 · 단추끼리 4px 넘게. 떠 있는 것이 끼면 글 · 단추끼리만) ⑤ 아래로 잘림(감춘 칸 밖으로 글자가 밀려남)
   ⑥ 빈 띠(contain으로 담은 영상 · 그림의 위아래 · 양옆 띠, 2px 넘게) ⑦ 메인 16:9(가운데 영상 · 아래 그림 띠가 잘리지 않는가, 11/7 Bumm님 «위아래로 잘려 있어»)
   ⑧ 손가락 단추(터치 기기에서 높이 40px 미만) ⑨ 주 단추가 첫 화면 아래(가로로 눕힌 휴대폰은 제외). 참고로 «↓N»은 주 단추까지 N px 내려야 보인다는 뜻이고, 글자는 역할별 크기를 함께 적는다(비율까지 곱한 실제 크기).
   녹음실 영상의 cover 잘림은 Bumm님 답(그대로 둠)이라 세지 않는다.

   갈래: pc(마우스) · tablet(터치) · phone(터치). PC 크기는 화면 해상도가 아니라 «실제 창»이다 — 크롬 탭 · 주소창 · 작업 표시줄을 뺀 안쪽(Poster Studio와 같다).
   마이크는 크롬의 가짜 장치, 업로드는 도구가 페이지 밖에서 답한다 — 네트워크로 나가면 종료코드 2. 스크롤 막대는 켜 둔다(헤드리스 기본값은 막대를 숨겨 작은 창 문제를 가린다).
   --assets를 주면 엔진 · 장면 영상은 그 폴더에서 답한다 — 라이브를 잴 때 큰 파일을 되받지 않으려는 것이다(같은 커밋의 빌드여야 한다).
   --capture는 화면마다 원본 해상도 캡처를 <결과>/<PC · 태블릿 · 휴대폰>/<크기>/<화면>.png로 남기고, 문서가 창보다 길면 -전체.png를 더한다. 없으면 결함이 있는 화면만 남긴다.
   첫 인자가 .exe면 설치판을 잰다 — 앱을 숨긴 창(VC_TEST_WINDOW=hidden, 재는 크기가 시험 모니터보다 커서 보이면 큰 모니터까지 넘어간다)으로 띄워 창 안쪽 크기를 그 값으로 바꾸고 같은 화면들을 지난다.
   «@배율»은 화면 밀도만 흉내 낸다(Windows 설정은 바꾸지 않는다, 크기는 배율을 적용한 뒤의 값). 업로드는 앱의 세션에서 답하고, 결과는 <결과>/설치판/<크기>/에 둔다.
   --snapshot은 화면마다 요소의 자리 · 크기 · 글자를 <결과>/snap/…json으로 남긴다 — tools/verify/layout-compare.mjs로 전 · 뒤를 대조한다.
   결과는 <결과>/report.json · report.md. 결함이 있으면 종료코드 1, 흐름이 막히면 표에 «막힘»으로 적고 역시 1이다. */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, _electron } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUE_FLAGS = ['--sizes', '--screens', '--assets', '--jobs', '--dpr'];
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
const SELFTEST = args.includes('--selftest');
const CAPTURE = args.includes('--capture');
const SNAPSHOT = args.includes('--snapshot');
const JOBS = Number(opt('--jobs', '3'));
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

// 휴대폰: 앞은 실제 브라우저 높이(주소창 · 아래 막대를 뺀 값), 뒤는 화면 전체. 가로로 눕힌 휴대폰도 잰다.
const PHONE = ['360x640', '390x664', '430x740', '393x659', '375x553', '360x668', '384x712', '440x763', '390x844', '430x932', '393x852', '360x780', '384x824', '440x956', '320x568', '932x380', '844x340', '780x304'];
const TABLET = ['1366x1024', '1024x1366', '1024x768', '768x1024', '820x1180', '1180x820'];
// PC 앞 일곱은 팀장 목록의 실제 창, 그다음은 Poster Studio 조사 목록, 뒤는 낮은 창과 761~1099 폭 창
const PC = ['1280x587', '1366x635', '1536x731', '1920x945', '2048x1017', '2560x1305', '3840x2025',
  '1024x768', '1280x800', '1366x768', '1440x900', '1536x864', '1600x900', '1920x1080', '2560x1440', '1440x767', '1920x947', '2560x1307',
  '761x600', '800x600', '900x500', '1024x640', '1099x700', '1200x600', '1400x560', '1920x600'];
const DEFAULT_SIZES = [...PHONE.map((s) => 'phone:' + s), ...TABLET.map((s) => 'tablet:' + s), ...PC.map((s) => 'pc:' + s)].join(',');
// 설치판: 최소 창 · 반 화면 · 최대화한 안쪽(1366×768 100% · 1920×1080 100 · 125 · 150% · 2560×1440 · 4K 100 · 150 · 200 · 300%) · 3840×2160
const DESKTOP = ['640x640', '667x700', '760x660', '1100x660', '1366x697', '1280x649@1.5', '1536x793@1.25', '1920x1009', '2560x1369', '2560x1369@1.5', '1920x1009@2', '1280x649@3', '3840x2089', '3840x2160'];
// 실제 기기 배율: 휴대폰 3, 태블릿 2. PC는 화면 배율이 정해진 창만(1920×1080 노트북 150% · 125%)
const DPR = { phone: () => 3, tablet: () => 2, pc: (w, h) => (w === 1280 && h === 587 ? 1.5 : w === 1536 && h === 731 ? 1.25 : 1) };
const FOLDER = { phone: '휴대폰', tablet: '태블릿', pc: 'PC', desktop: '설치판' };
const UA = {
  phone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  tablet: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
const LAUNCH = { ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--mute-audio'] };

// 역할별 글자 — Poster Studio와 대조할 표의 줄이다. 앞의 선택자가 화면에 있으면 그 값을 쓴다.
const ROLES = {
  '앱 이름': ['#splash .name', '.chart-app strong', '.studio-brand > span'],
  '화면 제목': ['.chart-heading h1', '.result-details h2', '.controls h2', 'main h1'],
  '보조 제목': ['.chart-invitation h2', '.studio-heading h1', 'main h2'],
  '장면 이름': ['.scene-shell.is-current .gname', '.poster-credit strong'],
  '안내 문장': ['.hint', '#doneMsg', '#loadingSub', '.chart-invitation > p:last-of-type', 'main p'],
  '주 단추': ['#recBtn', '#saveBtn', '.scene-shell.is-current .tile-enter', '#openMovieBtn', '#downloadBtn'],
  '보조 단추': ['#previewBtn', '#resetBtn', '.back', '#doneHomeBtn', '#errBackBtn'],
  '작은 글': ['.privacylink', '.festival-steps', '.cinema-footer', '.chart-guide p', '.clip-time', '.scene-choice-card > span', '.workflow-footer'],
};

/* 페이지 안에서 도는 판정 — 값은 전부 화면 px다(zoom 안의 getBoundingClientRect는 화면 px, 글자 크기는 currentCSSZoom을 곱한다). */
function measurePage(roles) {
  const W = document.documentElement.clientWidth, H = innerHeight;
  const vis = (el) => (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const name = (el) => { const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 22); return (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '')) + (t ? ' «' + t + '»' : ''); };
  // body의 overflow는 화면으로 옮겨 가서 잘라 주는 부모가 아니다 — 이 앱은 body에 overflow-x:hidden이 있어 부모로 세면 삐져나간 것을 전부 놓친다
  const clipsX = (el) => { for (let a = el.parentElement; a && a !== document.documentElement && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { const r = a.getBoundingClientRect(); if (r.left >= -1 && r.right <= W + 1) return true; } } return false; };
  // 스플래시가 떠 있으면 그 화면만 잰다 — 그 뒤에 깔린 메인은 가려져 있다
  const splash = document.getElementById('splash');
  const scope = splash && vis(splash) ? splash : document.body;
  const hiddenOrSide = (el) => !!el.closest('[hidden], [aria-hidden="true"], .scene-shell:not(.is-current), .scene-choices');
  const floating = (el) => { for (let x = el; x && x !== scope; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'absolute' || p === 'fixed' || p === 'sticky') return true; } return false; };
  const pinned = (el) => { for (let x = el; x && x !== scope; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const hscroll = Math.max(0, document.documentElement.scrollWidth - W);
  const off = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || hiddenOrSide(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if ((r.right > W + 1 || r.left < -1) && !clipsX(el) && getComputedStyle(el).position !== 'fixed') off.push(name(el) + ' ' + Math.round(r.left) + '~' + Math.round(r.right));
  }
  // 칸 밖: 화면 안이라도 가로를 잘라 내는 가장 가까운 조상의 가장자리를 넘어 감춰진 단추 · 글
  const cutBox = (el) => { for (let a = el.parentElement; a && a !== document.documentElement && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (!/(hidden|clip|auto|scroll)/.test(s.overflowX)) continue; return /x|both|inline/.test(s.scrollSnapType) || (/(auto|scroll)/.test(s.overflowX) && /(hidden|clip)/.test(s.overflowY)) ? null : a; } return null; };
  for (const el of scope.querySelectorAll('button, a, input, select, textarea, label, h1, h2, h3, p, li, span, strong')) {
    if (!vis(el) || hiddenOrSide(el)) continue; const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue;
    if (/^(SPAN|STRONG|A|LABEL)$/.test(el.tagName) && el.parentElement?.closest('button, a, p, h1, h2, h3, li, label')) continue;
    if (!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !el.textContent.trim()) continue;
    const box = cutBox(el); if (!box) continue; const b = box.getBoundingClientRect();
    if (r.right > b.right + 1 || r.left < b.left - 1) off.push('(칸 밖) ' + name(el) + ' ' + Math.round(r.left) + '~' + Math.round(r.right) + ' / 칸 ' + Math.round(b.left) + '~' + Math.round(b.right));
  }
  const clipped = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || hiddenOrSide(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el); const hides = /(hidden|clip)/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none';
    if (hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) clipped.push(name(el) + ' ' + el.scrollWidth + '/' + el.clientWidth + '×' + el.scrollHeight + '/' + el.clientHeight);
  }
  // 겹침: «잎» 덩어리(글이 직접 든 요소 · 그림 · 영상 · 단추)끼리. 떠 있는 것이 끼면 글 · 단추끼리만 — 그림 위에 얹은 표시는 일부러 겹친 것이다.
  const MEDIA = /^(IMG|VIDEO|CANVAS)$/;
  const mediaLike = (el) => MEDIA.test(el.tagName) || (!el.textContent.trim() && !!el.querySelector('img, video, canvas'));
  const TEXTUAL = /^(H1|H2|H3|P|LI|LABEL|SPAN|STRONG|A)$/;
  const rectOf = (o) => { if (o.box || !TEXTUAL.test(o.el.tagName)) return o.el.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(o.el); const rs = [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0); if (!rs.length) return o.el.getBoundingClientRect(); return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) }; };
  // 장면 카드(.tile)는 카드 전체가 단추라, 단추 하나로 세지 않고 안의 글 · 그림을 따로 잰다
  const leaves = [...scope.querySelectorAll('img, video, canvas, button, input, textarea, select, h1, h2, h3, p, li, label, span, strong, a')].filter((el) => {
    if (!vis(el) || hiddenOrSide(el) || el.matches('.tile')) return false;
    const host = el.parentElement?.closest('button:not(.tile), a, p, h1, h2, h3, li, label');
    if (/^(SPAN|STRONG|A|LABEL)$/.test(el.tagName) && host) return false;
    if (/^(SPAN|STRONG)$/.test(el.tagName) && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4;
  }).map((el) => ({ el, fl: floating(el), pin: pinned(el), media: mediaLike(el) }));
  const hit = (a, b) => { const p = rectOf(a), q = rectOf(b); const ow = Math.min(p.right, q.right) - Math.max(p.left, q.left), oh = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top); return ow > 4 && oh > 4 ? { ow, oh, x: Math.max(p.left, q.left), y: Math.max(p.top, q.top) + scrollY } : null; };
  const pairs = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if ((a.fl || b.fl) && (a.media || b.media)) continue;
    const h = hit(a, b); if (h) pairs.push({ a, b, h });
  }
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || hiddenOrSide(el)) continue; const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.backgroundImage === 'none') continue;
    if (el.closest('[role="status"], [role="alert"], [aria-live]')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.width * r.height > W * H * 0.9) continue;
    const c = { el, pin: true, box: true };
    for (const l of leaves) { if (l.pin || el.contains(l.el) || l.el.contains(el)) continue; const h = hit(c, l); if (h) pairs.push({ a: c, b: l, h }); }
  }
  const sy = scrollY, maxY = document.scrollingElement.scrollHeight - H;
  if (maxY > 4 && pairs.some((p) => p.a.pin || p.b.pin)) { scrollTo(0, maxY); for (const p of pairs) if ((p.a.pin || p.b.pin) && !hit(p.a, p.b)) p.gone = true; scrollTo(0, sy); }
  const overlaps = pairs.filter((p) => !p.gone).map(({ a, b, h }) => name(a.el) + ' ↔ ' + name(b.el) + ' ' + Math.round(h.ow) + '×' + Math.round(h.oh) + ' @' + Math.round(h.x) + ',' + Math.round(h.y));
  const cutY = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || hiddenOrSide(el)) continue; const s = getComputedStyle(el);
    if (el.clientWidth <= 2 || el.clientHeight <= 2) continue;
    if (!/(hidden|clip)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 4) continue;
    const box = el.getBoundingClientRect(), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.textContent.trim() || !vis(t.parentElement) || hiddenOrSide(t.parentElement)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      if ([...rg.getClientRects()].some((r) => r.height > 0 && (r.bottom > box.bottom + 2 || r.top < box.top - 2))) { cutY.push(name(el) + ' «' + t.textContent.trim().slice(0, 16) + '» ' + el.scrollHeight + '/' + el.clientHeight); break; }
    }
  }
  // 빈 띠: 다 담은(contain) 영상 · 그림이 칸 비율과 달라 남는 띠
  const bands = [];
  for (const el of scope.querySelectorAll('video, img')) {
    if (!vis(el) || hiddenOrSide(el)) continue;
    const fit = getComputedStyle(el).objectFit; if (fit !== 'contain' && fit !== 'scale-down') continue;
    const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight; if (!iw || !ih) continue;
    const r = el.getBoundingClientRect(), ar = iw / ih, bx = r.width - Math.min(r.width, r.height * ar), by = r.height - Math.min(r.height, r.width / ar);
    if (bx > 2 || by > 2) bands.push(name(el) + ' ' + (bx > 2 ? '양옆 ' + Math.round(bx) : '위아래 ' + Math.round(by)) + 'px · 칸 ' + Math.round(r.width) + '×' + Math.round(r.height));
  }
  // 메인 16:9: 가운데 영상 · 아래 그림 띠를 cover로 그리는 칸이 16:9에서 1.5% 넘게 벗어나면 잘린 것이다
  const crops = [];
  for (const el of scope.querySelectorAll('.scene-shell.is-current .tile-media, .scene-choices .scene-choice-card img')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const off169 = Math.abs(r.width / r.height / (16 / 9) - 1);
    if (off169 > 0.015) crops.push((el.className && typeof el.className === 'string' ? el.className.split(/\s+/)[0] : el.tagName.toLowerCase()) + ' ' + (r.width / r.height).toFixed(2) + ':1 (' + Math.round(off169 * 100) + '%)');
  }
  // 손가락 단추(터치 기기만 본다 — 판정은 도구 쪽)
  const small = [];
  if (matchMedia('(pointer: coarse)').matches) for (const el of scope.querySelectorAll('button, input, select, textarea, a.btn')) {
    if (!vis(el) || hiddenOrSide(el)) continue; const r = el.getBoundingClientRect();
    if (r.width > 4 && r.height > 4 && r.height < 40) small.push(name(el) + ' ' + Math.round(r.height) + 'px');
  }
  // 주 단추: 그 화면에서 할 일이 스크롤 없이 보이는가(판정은 도구 쪽 — 가로로 눕힌 휴대폰은 세지 않는다)
  const primary = ['#recBtn', '#saveBtn', '.scene-shell.is-current .tile-enter', '#openMovieBtn', '#qrbox', '#downloadBtn', '#errBackBtn'].map((q) => document.querySelector(q)).find((el) => el && vis(el));
  const cta = primary ? Math.max(0, Math.round(primary.getBoundingClientRect().bottom + scrollY - H)) : 0;
  const below = ['#recBtn', '#saveBtn', '.scene-shell.is-current .tile-enter', '#qrbox', '#openMovieBtn', '#downloadBtn', '#doneHomeBtn', '#errBackBtn'].map((q) => document.querySelector(q)).filter((el) => el && vis(el)).map((el) => Math.round(el.getBoundingClientRect().bottom + scrollY - H)).filter((px) => px > 0);
  // 글자: 역할별 크기와 가장 작은 글자(비율까지 곱한 실제 크기). 원문이 작게 적힌 것을 찾으려고 글이 직접 든 요소를 전부 본다.
  const px = (el) => Math.round(parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom || 1) * 10) / 10;
  const type = {};
  for (const [role, list] of Object.entries(roles)) for (const q of list) { const el = [...scope.querySelectorAll(q)].find((x) => vis(x) && !hiddenOrSide(x) && x.textContent.trim()); if (el) { type[role] = px(el); break; } }
  let minFont = null, minText = '';
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || hiddenOrSide(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const f = px(el); if (minFont === null || f < minFont) { minFont = f; minText = el.textContent.trim().slice(0, 16); }
  }
  return { W, H, zoom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1, hscroll, off: [...new Set(off)].slice(0, 12), clipped: clipped.slice(0, 12), overlaps: overlaps.slice(0, 12), cutY: cutY.slice(0, 8), bands, crops: [...new Set(crops)].slice(0, 4), small: small.slice(0, 8), cta, below: below.length ? Math.max(...below) : 0, docH: document.documentElement.scrollHeight, type, minFont, minText };
}

const isBad = (m) => !!(m.hscroll || m.off.length || m.clipped.length || m.overlaps.length || m.cutY.length || m.bands.length || m.crops.length || m.small.length);

// 배치 대조용 — 요소의 자리 · 크기 · 글자. 화소가 아니라 배치를 보는 까닭: 영상 · 애니메이션은 찍을 때마다 화소가 다르다.
function layoutPage() {
  const out = [], vis = (el) => (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const key = (el) => { const p = []; for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) { const sib = e.parentElement ? [...e.parentElement.children].filter((x) => x.tagName === e.tagName) : [e]; p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (sib.length > 1 ? ':' + sib.indexOf(e) : '')); } return p.join('>'); };
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|SOURCE|TRACK)$/.test(el.tagName) || !vis(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 0.5 && r.height < 0.5) continue;
    const s = getComputedStyle(el);
    out.push([key(el), Math.round(r.left * 2) / 2, Math.round(r.top * 2) / 2, Math.round(r.width * 2) / 2, Math.round(r.height * 2) / 2, s.fontSize, s.lineHeight, s.color, s.backgroundColor]);
  }
  return { w: innerWidth, h: innerHeight, sx: scrollX, sy: scrollY, docH: document.documentElement.scrollHeight, els: out };
}

if (SELFTEST) {
  // 판정 시험 — 심은 결함은 모두 잡고 일부러 그런 것(미끼)은 하나도 안 잡아야 한다. 하나라도 틀리면 종료코드 1.
  const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='red'/%3E%3C/svg%3E";
  const A = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif">
    <div id=textcut style="height:60px;overflow:hidden;width:200px">첫 줄<br>둘째 줄<br>셋째 줄 감춰짐</div>
    <span id=logo style="display:block;position:relative;width:88px;height:44px;overflow:hidden"><img style="position:absolute;width:108px;height:108px;top:-32px" src="${svg}"></span>
    <h2 id=sr style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap">숨김 제목 길게 길게</h2>
    <div style="position:relative;width:300px"><p id=para style="margin:0">흐름 안의 문단입니다</p><button id=floatbtn style="position:absolute;left:20px;top:4px">떠 있는 단추</button></div>
    <div style="position:relative;width:200px;height:120px"><img id=poster style="width:200px;height:120px" src="${svg}"><span id=badge style="position:absolute;right:4px;top:4px">완성</span></div>
    <div style="position:relative;width:600px"><h1 id=wideh1 style="margin:0;font-size:24px">짧은 제목</h1><a id=corner href="#" style="position:absolute;right:0;top:0">구석 링크</a></div>
    <div style="position:relative;width:300px;height:60px"><button id=slide aria-label="다음 장면 보기" style="width:300px;height:60px;padding:0;border:0"><img style="width:300px;height:60px" src="${svg}"></button><button id=arrow style="position:absolute;right:4px;top:10px">다음</button></div>
    <p id=toast role=status style="position:fixed;left:20px;top:150px;margin:0;background:#000;color:#fff">알림</p>
    <div style="height:150px"></div><p id=under style="margin:0">고정 줄에 늘 가려지는 글</p>
    <div id=dock style="position:fixed;left:0;right:0;bottom:0;height:200px;background:#eee"><button>다음</button></div>
    <div id=wide style="width:1500px;height:10px"></div></body>`;
  const B = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif;padding-bottom:220px">
    <div style="height:550px"></div><p id=reachable style="margin:0">처음엔 고정 줄 밑, 내리면 보이는 글</p>
    <div style="position:fixed;left:0;right:0;bottom:0;height:200px;background:#eee"><button>다음</button></div></body>`;
  const D = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif">
    <div style="width:200px;height:80px;overflow-y:auto"><button id=widebtn style="width:260px">칸보다 넓은 단추</button></div>
    <div style="width:200px;display:flex;overflow-x:auto;scroll-snap-type:x mandatory"><button id=snap1 style="flex:0 0 180px">한 장</button><button id=snap2 style="flex:0 0 180px">두 장</button></div>
    <div style="width:120px;overflow-x:auto;overflow-y:hidden;white-space:nowrap"><span id=chip>옆으로 넘겨 보는 긴 이름표</span></div></body>`;
  const E = `<!doctype html><meta charset=utf-8><body style="margin:0"><img id=snapshot style="width:300px;height:100px;object-fit:contain;background:#000" src="${svg}"></body>`;
  const F = `<!doctype html><meta charset=utf-8><body style="margin:0"><img id=snapshot style="width:300px;height:100px;object-fit:cover" src="${svg}"></body>`;
  // 이 앱에서 쓰는 모양: body overflow-x:hidden 아래로 삐져나간 글, 캐러셀 옆 장면 · 흐르는 그림 띠(미끼), 16:9가 아닌 가운데 영상 칸, 16:9인 칸, zoom 안의 글자 크기, 숨긴 글자
  const G = `<!doctype html><meta charset=utf-8><body style="margin:0;overflow-x:hidden;font:20px/30px sans-serif">
    <p id=runaway style="position:absolute;left:900px;top:0;margin:0;width:300px">화면 밖으로 나간 글</p>
    <div style="position:relative;overflow:hidden;width:400px;height:200px"><div class="scene-shell" style="position:absolute;left:300px;width:300px"><button id=sidebtn style="width:300px">옆 장면 단추</button></div></div>
    <div class=scene-choices style="overflow:hidden;width:300px"><div style="display:flex;width:900px"><button id=flow style="flex:0 0 300px">흐르는 칸</button><button style="flex:0 0 300px">다음 칸</button></div></div>
    <div class="scene-shell is-current"><div class=tile-media id=badratio style="width:500px;height:100px"></div></div>
    <div style="zoom:.5"><p id=small style="margin:0;font-size:20px">줄인 글자</p></div>
    <div style="position:relative;width:300px;height:240px"><button class=tile id=card style="display:block;width:300px;height:240px;padding:0;border:0;position:relative"><span style="display:block;width:300px;height:170px"><img style="display:block;width:300px;height:170px" src="${svg}"></span><span class=gname id=cardname style="display:block;width:120px">장면 이름</span><span class=tile-enter id=cardbtn style="position:absolute;left:60px;top:198px">더빙하기 단추</span></button><button class=scene-arrow id=cardarrow style="position:absolute;left:0;top:60px">이전</button></div></body>`;
  const I = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif"><button id=behind style="width:300px;height:200px">메인</button><p id=behind2 style="position:absolute;left:0;top:0;margin:0">겹친 글</p><div id=splash style="position:fixed;inset:0;background:#fff"><p id=splashname style="margin:0">앱 이름</p></div></body>`;
  const H2 = `<!doctype html><meta charset=utf-8><body style="margin:0"><div class="scene-shell is-current"><div class=tile-media style="width:320px;height:180px"></div></div></body>`;
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const run = async (html) => { await page.setContent(html); await delay(150); return page.evaluate(measurePage, { 작은: ['#small'] }); };
  const [a, b, d, e, f, g, h, i] = [await run(A), await run(B), await run(D), await run(E), await run(F), await run(G), await run(H2), await run(I)];
  // 터치 기기에서만 세는 손가락 단추
  const touch = await browser.newContext({ viewport: { width: 400, height: 700 }, hasTouch: true, isMobile: true });
  const tp = await touch.newPage();
  await tp.setContent('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body><button id=tiny style="height:24px">작은 단추</button><button id=fine style="height:44px">좋은 단추</button></body>');
  const t = await tp.evaluate(measurePage, {});
  await browser.close();
  const has = (list, id) => list.some((s) => s.includes('#' + id));
  const expect = [
    ['글자 잘림을 잡는다', has(a.cutY, 'textcut')], ['일부러 자른 로고는 안 잡는다', !has(a.cutY, 'logo')], ['1px 숨김 제목은 안 잡는다', !has(a.cutY, 'sr')],
    ['떠 있는 단추가 문단을 덮으면 잡는다', a.overlaps.some((s) => s.includes('#floatbtn') && s.includes('#para'))],
    ['그림 위 배지는 안 잡는다', !a.overlaps.some((s) => s.includes('#badge'))],
    ['고정 줄에 늘 가려지는 글을 잡는다', has(a.overlaps, 'under')],
    ['내리면 비켜 보이는 글은 안 잡는다', b.overlaps.length === 0],
    ['가로 넘침을 잡는다', a.hscroll > 0 && has(a.off, 'wide')],
    ['줄 끝까지 늘어난 제목 상자 옆 구석 링크는 안 잡는다', !a.overlaps.some((s) => s.includes('#corner'))],
    ['그림만 든 넘기기 칸 위 화살표는 안 잡는다', !a.overlaps.some((s) => s.includes('#arrow'))],
    ['그림 위에 잠깐 띄운 알림은 안 잡는다', !a.overlaps.some((s) => s.includes('#toast'))],
    ['세로 스크롤 칸 밖으로 잘린 단추를 잡는다', has(d.off, 'widebtn')],
    ['옆으로 넘기는 칸(scroll-snap)의 다음 장은 안 잡는다', !has(d.off, 'snap2')],
    ['가로만 스크롤하는 이름표 줄은 안 잡는다', !d.off.some((s) => s.includes('옆으로 넘겨'))],
    ['다 담은 그림의 빈 띠를 잡는다', has(e.bands, 'snapshot')],
    ['꽉 채운 그림은 띠로 안 잡는다', f.bands.length === 0],
    ['body overflow-x:hidden 아래로 삐져나간 글을 잡는다', has(g.off, 'runaway')],
    ['캐러셀 옆 장면 단추는 칸 밖으로 안 잡는다', !has(g.off, 'sidebtn')],
    ['흐르는 그림 띠는 칸 밖으로 안 잡는다', !has(g.off, 'flow')],
    ['장면 카드 그림 위 화살표는 안 잡는다', !g.overlaps.some((s) => s.includes('#cardarrow'))],
    ['장면 카드 안의 글끼리 겹치면 잡는다', g.overlaps.some((s) => s.includes('#cardname') && s.includes('#cardbtn'))],
    ['스플래시 뒤의 메인은 안 잰다', i.overlaps.length === 0],
    ['가운데 영상 칸이 16:9가 아니면 잡는다', g.crops.length === 1],
    ['16:9인 칸은 안 잡는다', h.crops.length === 0],
    ['zoom 안의 글자는 곱한 크기로 읽는다', g.type['작은'] === 10],
    ['터치 기기의 40px 미만 단추를 잡는다', has(t.small, 'tiny') || t.small.some((s) => s.includes('작은 단추'))],
    ['터치 기기의 44px 단추는 안 잡는다', !t.small.some((s) => s.includes('좋은 단추'))],
    ['마우스 기기는 단추 높이를 세지 않는다', a.small.length === 0],
  ];
  let fails = 0;
  for (const [what, ok] of expect) { console.log(`${ok ? '통과' : '실패'}: ${what}`); if (!ok) fails++; }
  process.exit(fails ? 1 : 0);
}

const [target, outArg] = positional;
if (!target || !outArg) { console.error('사용법: node tools/verify/viewport-survey.mjs <주소 | dist 폴더> <결과 폴더> [--sizes 갈래:WxH,…] [--screens 낱말,…] [--capture] [--snapshot] [--assets <dist>] [--jobs N] [--dpr 배율] | --selftest'); process.exit(2); }
const out = path.resolve(outArg);
await fs.mkdir(out, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.txt': 'text/plain' };

// dist 폴더를 받으면 127.0.0.1의 작은 서버로 연다 — 영상을 앞뒤로 옮기므로 Range를 받는다
function serve(root) {
  const server = http.createServer((req, res) => {
    const clean = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, clean.endsWith('/') ? clean + 'index.html' : clean);
    if (!file.startsWith(root) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    const size = fss.statSync(file).size, type = TYPES[path.extname(file)] || 'application/octet-stream';
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const start = Number(m[1]), end = m[2] ? Number(m[2]) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      fss.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
    fss.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })); });
}

const isDir = !target.toLowerCase().endsWith('.exe') && fss.existsSync(target) && fss.statSync(target).isDirectory();
const local = isDir ? await serve(path.resolve(target)) : null;
const base = local ? local.url : target.replace(/\/?$/, '/');
const assetsRoot = opt('--assets', null) ? path.resolve(opt('--assets')) : null;
const onlyScreens = opt('--screens', null)?.split(',');
const EXE = target.toLowerCase().endsWith('.exe') ? path.resolve(target) : null;
const sizes = opt('--sizes', EXE ? DESKTOP.map((d) => 'desktop:' + d).join(',') : DEFAULT_SIZES).split(',').map((s) => {
  const [kind, wh] = s.split(':');
  const [size, scale] = wh.split('@');
  const [w, h] = size.split('x').map(Number);
  return { kind, w, h, tag: wh, scale: scale ? Number(scale) : 1 };
});
const report = [];
let realUploads = 0;

const FAKE_URL = 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs/dub_animation_0000000000000_000000000000.mp4';

// 브라우저 쪽: 크기마다 새 맥락. 업로드와 큰 파일은 도구가 페이지 밖에서 답한다.
async function openBrowser(browser, { kind, w, h, touch }) {
  const dpr = opt('--dpr') ? Number(opt('--dpr')) : DPR[kind](w, h);
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch, userAgent: UA[kind], permissions: ['microphone'], serviceWorkers: 'block', reducedMotion: 'no-preference' });
  const page = await context.newPage();
  // 업로드는 페이지 밖으로 나가지 않는다. 앞의 failing번은 실패로, 그다음은 1.5초 늦게 성공으로 답한다.
  const upload = { failing: 0, routed: 0, seen: 0 };
  context.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/upload')) upload.seen++; });
  await context.route('**/voiceCinema/upload', async (route) => {
    upload.routed++;
    if (upload.failing > 0) { upload.failing--; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '시험' }) }); return; }
    await delay(1500);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: FAKE_URL }) });
  });
  // App Check · reCAPTCHA는 잴 것이 아니다 — 토큰을 기다리지 않게 막는다
  await context.route(/recaptcha|firebaseappcheck/, (route) => route.abort());
  if (assetsRoot) await context.route(/\/(vendor\/ffmpeg-core|clips)\//, async (route) => {
    const file = path.join(assetsRoot, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!fss.existsSync(file)) { await route.fulfill({ status: 404 }); return; }
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
    const all = await fs.readFile(file);
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    if (range) { const start = Number(range[1]), end = range[2] ? Number(range[2]) : all.length - 1; await route.fulfill({ status: 206, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${all.length}` }, body: all.subarray(start, end + 1) }); return; }
    await route.fulfill({ status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes' }, body: all });
  });
  return { page, home: base, failNext: (n) => { upload.failing = n; }, realUploads: () => Math.max(0, upload.seen - upload.routed), close: () => context.close() };
}

// 설치판 쪽: 앱을 숨긴 창으로 띄운다. 모든 https가 앱의 세션을 지나므로 업로드와 App Check를 거기서 답한다(desktop/tools/layout-lib.mjs와 같은 자리).
async function openDesktop({ w, h, tag, scale }) {
  const app = await _electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${path.join(out, 'profile', tag)}`, '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    env: { ...process.env, VC_TEST_WINDOW: 'hidden' },
  });
  await app.evaluate(({ session }, url) => {
    const ses = session.fromPartition('persist:voice-cinema');
    const original = ses.fetch.bind(ses);
    const cors = { 'Access-Control-Allow-Origin': 'https://voice.edutogether.kr', Vary: 'Origin' };
    globalThis.__survey = { failing: 0, posts: 0, answered: 0 };
    ses.fetch = async (request, options) => {
      if (/recaptcha|firebaseappcheck/.test(request.url)) throw new Error('시험이라 막음');
      if (!request.url.endsWith('/voiceCinema/upload')) return original(request, options);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? '*' } });
      globalThis.__survey.posts++;
      await request.text();
      globalThis.__survey.answered++;
      if (globalThis.__survey.failing > 0) {
        globalThis.__survey.failing--;
        return new Response(JSON.stringify({ ok: false, error: '시험' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await new Promise((done) => setTimeout(done, 1500));
      return new Response(JSON.stringify({ ok: true, url }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    };
  }, FAKE_URL);
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, [cw, ch]) => { BrowserWindow.getAllWindows()[0].setContentSize(cw, ch); }, [w, h]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: scale, mobile: false });
  await delay(500);
  const inner = await page.evaluate(() => [innerWidth, innerHeight]);
  if (Math.abs(inner[0] - w) > 1 || Math.abs(inner[1] - h) > 1) { await app.close(); throw new Error(`창이 그 크기가 되지 않았다(안쪽 ${inner.join('x')})`); }
  await page.evaluate(() => sessionStorage.clear());
  let leaked = 0;
  return {
    page,
    home: 'https://voice.edutogether.kr/',
    failNext: (n) => app.evaluate((_e, count) => { globalThis.__survey.failing = count; }, n),
    realUploads: () => leaked,
    close: async () => { const c = await app.evaluate(() => globalThis.__survey); leaked = Math.max(0, c.posts - c.answered); await app.close(); },
  };
}

async function surveySize(browser, { kind, w, h, tag, scale }) {
  const touch = kind === 'phone' || kind === 'tablet';
  let opened;
  try {
    opened = kind === 'desktop' ? await openDesktop({ w, h, tag, scale }) : await openBrowser(browser, { kind, w, h, touch });
  } catch (e) {
    report.push({ size: tag, kind, screen: '흐름', error: `열기: ${e.message.split('\n')[0]}`, bad: true });
    console.log(`${kind} ${tag}: 열지 못함 — ${e.message.split('\n')[0]}`);
    return false;
  }
  const { page, home } = opened;
  const dir = path.join(out, FOLDER[kind], tag);
  // 짧게 지나가는 화면(«이제 당신의 차례» 0.6초 · 숫자 0.3초)을 찍을 수 있게 그때만 늘린다. 합성 실패는 원판 요청을 페이지 안에서 실패시킨다(<video>는 fetch를 쓰지 않는다).
  await page.addInitScript(() => {
    const realTimeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => realTimeout(fn, window.__stretch && ms === 600 ? 2500 : window.__stretch && ms === 300 ? 1600 : ms, ...rest);
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => { const u = String((input && input.url) || input); if (window.__failFinal && u.includes('/clips/final/')) return Promise.reject(new Error('시험용 합성 실패')); return realFetch(input, init); };
    const media = navigator.mediaDevices, gum = media.getUserMedia.bind(media);
    media.getUserMedia = (c) => (window.__denyMic ? Promise.reject(new DOMException('시험', 'NotAllowedError')) : gum(c));
  });
  const want = (screen) => !onlyScreens || onlyScreens.some((w0) => screen.includes(w0));
  const shot = async (screen) => {
    if (!want(screen)) return;
    if (touch && !(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) throw new Error('터치 흉내가 풀렸다 — 조사 도구 문제이며 이 크기의 값은 믿을 수 없다');
    const m = await page.evaluate(measurePage, ROLES);
    if (kind === 'phone' && w > h) m.cta = 0;
    const bad = isBad(m) || m.cta > 0;
    report.push({ size: tag, kind, screen, ...m, bad });
    if (CAPTURE || bad) {
      await fs.mkdir(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${screen}.png`) });
      if (m.docH > m.H + 1 && CAPTURE) await page.screenshot({ path: path.join(dir, `${screen}-전체.png`), fullPage: true });
    }
    if (SNAPSHOT) { await fs.mkdir(path.join(out, 'snap'), { recursive: true }); await fs.writeFile(path.join(out, 'snap', `${kind}-${tag}-${screen}.json`), JSON.stringify(await page.evaluate(layoutPage))); }
    console.log(`${kind} ${tag} ${screen}: ${bad ? `가로 ${m.hscroll} · 밖 ${m.off.length} · 잘림 ${m.clipped.length} · 겹침 ${m.overlaps.length} · 아래 ${m.cutY.length} · 띠 ${m.bands.length} · 16:9 ${m.crops.length} · 손가락 ${m.small.length} · 주 단추 아래 ${m.cta}` : '깨끗'} (최소 ${m.minFont}px)`);
  };
  const phase = (p) => page.locator(`#studio.active[data-phase="${p}"]`).waitFor({ timeout: 30000 });
  // 장면 넘김 움직임이 끝날 때까지 기다린다 — 움직이는 중에 재면 카드가 칸 밖에 있는 것으로 잡힌다
  const settle = () => page.evaluate(() => new Promise((done) => { let last = '', same = 0, n = 0; const tick = () => { const r = document.querySelector('.scene-shell.is-current')?.getBoundingClientRect(); const now = r ? r.left + ',' + r.width : ''; same = now === last ? same + 1 : 0; last = now; n++; if (same >= 10 || n > 300) done(); else requestAnimationFrame(tick); }; tick(); }));
  const seek = (t) => page.evaluate((s) => { document.getElementById('clip').currentTime = s; }, t);
  let step = '시작';
  let touchLost = false;
  try {
    step = '스플래시';
    await page.goto(home);
    await page.locator('#splash').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await delay(650);
    await shot('01-스플래시');
    step = '메인';
    await page.locator('#splash').waitFor({ state: 'detached', timeout: 30000 });
    await delay(700);
    await page.evaluate(() => { scrollTo(0, 0); });
    await shot('02-메인');
    // 엔진을 받는 동안의 «영상 저장 준비 중» 표시 — 보일 때와 같은 자리를 잰다
    if (want('03-메인-저장준비')) {
      await page.evaluate(() => { const bar = document.getElementById('enginebar'); bar.classList.add('show'); });
      await shot('03-메인-저장준비');
      await page.evaluate(() => { const bar = document.getElementById('enginebar'); bar.classList.remove('show'); });
    }
    // 제목이 가장 긴 애니메이션 장면으로 간다. 앞의 장면들은 메인에서 함께 잰다.
    step = '장면 고르기';
    await page.locator('.scene-arrow-next').click();
    await settle();
    await shot('04-메인-둘째장면');
    await page.locator('.scene-arrow-next').click();
    await page.locator('.scene-shell.is-current [data-genre="animation"]').waitFor({ timeout: 8000 });
    await delay(450);
    step = '녹음실 재생';
    await page.locator('.scene-shell.is-current .tile').click();
    await phase('previewing');
    await page.locator('.scene-caption').waitFor({ timeout: 15000 });
    await shot('05-녹음실-재생-상대대사');
    await seek(5.3);
    await page.locator('.scene-turn-cue').waitFor({ timeout: 8000 });
    await shot('06-녹음실-재생-대사구간');
    step = '녹음실 시작 전';
    await seek(9.75);
    await phase('idle');
    await delay(300);
    await shot('07-녹음실-시작전');
    step = '마이크 오류';
    await page.evaluate(() => { window.__denyMic = true; });
    await page.locator('#recBtn').click();
    await page.locator('#hint[data-mic-error="denied"]').waitFor({ timeout: 10000 });
    await shot('08-오류-마이크');
    await page.evaluate(() => { window.__denyMic = false; window.__stretch = true; });
    step = '녹음';
    await page.locator('#recBtn').click();
    await phase('watching');
    await delay(250);
    await seek(4.4);
    await page.locator('#cue').waitFor({ timeout: 15000 });
    await shot('09-녹음실-내차례');
    await page.locator('#overlay').waitFor({ timeout: 8000 });
    await shot('10-녹음실-숫자');
    await page.locator('#recpill').waitFor({ timeout: 12000 });
    await shot('11-녹음실-녹음중');
    await page.evaluate(() => { window.__stretch = false; });
    await phase('continuing');
    await delay(400);
    await shot('12-녹음실-이어보기');
    await seek(9.7);
    await page.locator('#afterRow').waitFor({ timeout: 20000 });
    await delay(200);
    await shot('13-녹음실-녹음뒤');
    step = '합성 실패';
    await page.evaluate(() => { window.__failFinal = true; });
    await page.locator('#saveBtn').click();
    await page.locator('#errbox').waitFor({ timeout: 60000 });
    await page.evaluate(() => { window.__failFinal = false; scrollTo(0, 0); });
    await shot('14-오류-합성');
    await page.locator('#errBackBtn').click();
    await page.locator('#afterRow').waitFor({ timeout: 10000 });
    step = '기기 저장';
    await opened.failNext(3);
    await page.locator('#saveBtn').click();
    await page.locator('#loading').waitFor({ timeout: 20000 });
    await delay(150);
    await page.evaluate(() => { scrollTo(0, 0); });
    await shot('15-저장중');
    await page.locator('#savemode').waitFor({ timeout: 90000 });
    await page.evaluate(() => { scrollTo(0, 0); });
    await shot('16-오류-기기저장');
    await page.goBack();
    await page.locator('#afterRow').waitFor({ timeout: 10000 });
    step = '완성';
    await opened.failNext(0);
    await page.locator('#saveBtn').click();
    await page.locator('#qrbox').waitFor({ timeout: 90000 });
    await delay(200);
    await page.evaluate(() => { scrollTo(0, 0); });
    await shot('17-완성');
    step = '개인정보처리방침';
    await page.goto(home + 'privacy.html');
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await delay(300);
    await shot('18-개인정보처리방침');
  } catch (e) {
    report.push({ size: tag, kind, screen: '흐름', error: `${step}: ${e.message.split('\n')[0]}`, bad: true });
    console.log(`${kind} ${tag}: ${step}에서 막힘 — ${e.message.split('\n')[0]}`);
    touchLost = e.message.includes('터치 흉내가 풀렸다');
  }
  await opened.close();
  realUploads += opened.realUploads();
  return touchLost;
}

// 터치 흉내는 가끔 PC 전체에서 한꺼번에 풀린다(11/7 실측: 브라우저를 나눠도 돌던 휴대폰 두 크기가 같은 순간에 풀려, 844×340이 PC 비율 0.53이 되고
// 375×553에서 «내 영화 열기»가 사라졌다). 실제 기기에는 없는 일이라 그 크기를 처음부터 다시 잰다.
const browser = EXE ? null : await chromium.launch(LAUNCH);
const queue = [...sizes];
await Promise.all(Array.from({ length: JOBS }, async () => {
  for (let s = queue.shift(); s; s = queue.shift()) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!(await surveySize(browser, s)) || attempt === 3) break;
      console.log(`${s.kind} ${s.tag}: 터치 흉내가 풀려 처음부터 다시 잰다(${attempt}번째)`);
      for (let i = report.length - 1; i >= 0; i--) if (report[i].size === s.tag && report[i].kind === s.kind) report.splice(i, 1);
    }
  }
}));
await browser?.close();
local?.server.close();
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));

// 표: 크기 × 화면. 칸에는 결함 종류 수, «↓N»은 참고
const screens = [...new Set(report.filter((r) => r.screen !== '흐름').map((r) => r.screen))].sort();
const lines = ['| 크기 | 갈래 | 비율 | ' + screens.map((s) => s.replace(/^\d+-/, '')).join(' | ') + ' |', '|---|---|---|' + screens.map(() => '---|').join('')];
for (const { kind, tag } of sizes) {
  const rs = report.filter((r) => r.size === tag && r.kind === kind);
  const cell = (s) => {
    const r = rs.find((x) => x.screen === s); if (!r) return rs.find((x) => x.error) ? '막힘' : '—';
    const down = r.below ? ` ↓${r.below}` : '';
    if (!r.bad) return '🟢' + down;
    const k = []; if (r.hscroll) k.push(`가로${r.hscroll}`); if (r.off.length) k.push(`밖${r.off.length}`); if (r.clipped.length) k.push(`잘림${r.clipped.length}`); if (r.overlaps.length) k.push(`겹침${r.overlaps.length}`); if (r.cutY.length) k.push(`아래${r.cutY.length}`); if (r.bands.length) k.push(`띠${r.bands.length}`); if (r.crops.length) k.push(`16:9 ${r.crops.length}`); if (r.small.length) k.push(`손가락${r.small.length}`); if (r.cta) k.push(`주단추↓${r.cta}`);
    return '🔴 ' + k.join(' ') + down;
  };
  const zoom = rs.find((r) => r.zoom)?.zoom;
  lines.push(`| ${tag} | ${FOLDER[kind]} | ${zoom ? zoom.toFixed(3) : '—'} | ${screens.map(cell).join(' | ')} |`);
}
const flat = report.filter((r) => r.bad);
const details = flat.flatMap((r) => (r.error ? [`- ${FOLDER[r.kind]} ${r.size} 막힘: ${r.error}`] : [`- ${FOLDER[r.kind]} ${r.size} ${r.screen}: ` + [...(r.hscroll ? [`가로 넘침 ${r.hscroll}px`] : []), ...r.off, ...r.clipped.map((s) => '잘림 ' + s), ...r.overlaps.map((s) => '겹침 ' + s), ...r.cutY.map((s) => '아래 ' + s), ...r.bands.map((s) => '띠 ' + s), ...r.crops.map((s) => '16:9 ' + s), ...r.small.map((s) => '손가락 ' + s), ...(r.cta ? [`주 단추가 ${r.cta}px 아래`] : [])].join(' / ')]));
await fs.writeFile(path.join(out, 'report.md'), lines.join('\n') + '\n\n## 결함 ' + flat.length + '화면\n\n' + details.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`결함 ${flat.length}화면 / ${report.length}화면, 실제 업로드 ${realUploads}건`);
process.exit(realUploads ? 2 : flat.length ? 1 : 0);
