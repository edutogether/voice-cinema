// 빌드 산출물에 실제로 들어 있는 글자만 남긴 Pretendard 서브셋을 만든다.
//
// 왜 있는가: 이 앱에는 웹폰트가 아예 없어서, Pretendard가 설치된 기기(대표 PC)와
// 없는 기기(폰·부스 태블릿·인앱 브라우저)가 서로 다른 글꼴로 보였다(2026-09-09 대표
// 지적). 자체 호스팅으로 바꾸되 원본 6종 4.6MB를 그대로 실을 수는 없다 —
// 이 앱은 이미 엔진 31MB를 받고 행사장 와이파이에서 돈다.
//
// 글자 집합을 **빌드 산출물에서** 뽑는다. 소스를 훑으면 JS가 조합해 만드는 문구나
// aria·alt·placeholder를 빠뜨리기 쉬운데, 산출물에는 화면에 나올 수 있는 문자열이
// 전부 들어 있다. 서버가 돌려주는 오류 문구도 화면에 그대로 뜨므로 functions/ 쪽
// 문자열까지 함께 넣는다.
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import subsetFont from 'subset-font';

// 이 앱이 실제로 쓰는 굵기만 만든다. CSS에 500·600·700·750·800이 있고, 굵기를
// 적지 않은 본문이 400이다. 750은 해당 파일이 없어 브라우저가 800을 고른다.
// 900(Black)은 어디서도 쓰지 않으므로 만들지 않는다.
const WEIGHTS = [
  { weight: 400, file: 'Pretendard-Regular.woff2' },
  { weight: 500, file: 'Pretendard-Medium.woff2' },
  { weight: 600, file: 'Pretendard-SemiBold.woff2' },
  { weight: 700, file: 'Pretendard-Bold.woff2' },
  { weight: 800, file: 'Pretendard-ExtraBold.woff2' },
];

// 산출물에서 글자를 모을 대상. 폰트·영상 같은 이진 파일은 뺀다.
const TEXT_EXT = new Set(['.html', '.js', '.css']);

// 산출물만 믿지 않고 소스도 함께 읽는다.
//
// 산출물만 훑었더니 **140자가 빠졌다**(2026-09-09 실측). 번들러가 한글을 \uXXXX로
// 이스케이프해 내보내기 때문에, 파일을 그대로 읽으면 그 글자들이 안 보인다. 아래에서
// 이스케이프를 되돌리고, 그것과 무관하게 소스도 직접 읽어 두 경로가 서로를 메운다.
// functions/의 문구는 서버 오류가 화면에 그대로 뜨므로 함께 넣는다.
const SOURCE_GLOBS = ['index.html', 'privacy.html', 'functions/index.js', 'functions/validate.js'];
const SOURCE_DIRS = ['src'];

// 어떤 화면에서도 쓰일 수 있는 기본 문자. 숫자·영문·기호가 빠지면 진행률이나
// 파일명 같은 것이 두부로 나온다.
const BASE_CHARS = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCodePoint(0x20 + i)).join('');

async function walk(dir, out = [], exts = [...TEXT_EXT]) {
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    if ((await stat(full)).isDirectory()) {
      // vendor(ffmpeg·firebase 번들)와 clips는 화면 문구가 아니다.
      if (entry === 'vendor' || entry === 'clips' || entry === 'fonts') continue;
      await walk(full, out, exts);
    } else if (exts.includes(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/** 번들러가 이스케이프한 \uXXXX를 실제 글자로 되돌린다. */
export function unescapeUnicode(text) {
  return text
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// 🔴 이 검사가 없으면 "글자를 하나도 못 모았다"와 "잘 모았다"가 똑같이 통과한다.
// 서브셋이 원본보다 작아졌는지만 보는 가드는 **글자가 적을수록 더 잘 통과**하므로
// 이쪽을 전혀 막지 못한다 — 실제로 훑을 파일을 0건으로 만들어 보니 한글이 한 글자도
// 없는 95자짜리 폰트가 그대로 빌드됐고 유닛테스트 52개도 전부 통과했다(2026-09-10 실측).
// 그대로 나갔으면 Pretendard가 없는 기기에서 화면의 모든 한글이 두부(□)로 찍힌다.
//
// 그래서 세 가지를 본다.
//  (1) 실제로 몇 개의 파일을 훑었는가 — 0이면 통과가 아니라 실패다(§21-1)
//  (2) 화면에 반드시 나오는 문구가 모인 글자 안에 들어 있는가 — 훑기와 **독립적으로**
//      여기 적어둔 문자열이라, 훑기가 깨지면 이쪽이 먼저 빈다
//  (3) 한글 음절 수가 바닥 아래로 떨어지지 않았는가 — 일부만 깨지는 경우를 잡는다
const 반드시_있어야_할_문구 = [
  '무성영화에 내 목소리를 더빙해', // 스플래시 태그라인
  '판타지', '호러', '액션', '드라마', '시트콤', '애니메이션', // 장르 여섯 개
  '녹음', '저장', '다시', '완성', // 스튜디오 화면 버튼
];
// 2026-09-10 기준 650자. 문구를 지우는 정상적인 변경도 있으므로 바닥은 넉넉히 잡되,
// "거의 다 날아간" 상태는 반드시 걸리게 한다.
const 한글_최소 = 400;

function 모은글자를_검사한다(chars, 훑은파일수) {
  if (훑은파일수 === 0) {
    throw new Error('글자를 모을 파일을 하나도 찾지 못했습니다 — 훑을 경로가 바뀐 것입니다.');
  }
  const 빠진문구 = 반드시_있어야_할_문구.filter((t) => [...t].some((c) => c !== ' ' && !chars.includes(c)));
  if (빠진문구.length) {
    throw new Error(`화면에 반드시 나오는 문구의 글자가 서브셋에서 빠집니다: ${빠진문구.join(', ')}`);
  }
  const 한글수 = [...chars].filter((c) => c >= '가' && c <= '힣').length;
  if (한글수 < 한글_최소) {
    throw new Error(`한글 음절이 ${한글수}자뿐입니다(최소 ${한글_최소}자) — 글자 수집이 깨졌습니다.`);
  }
  return { 훑은파일수, 한글수 };
}

/** 산출물과 소스에서 화면에 나올 수 있는 글자를 모은다. */
export async function collectChars(outDir, root) {
  const chars = new Set(BASE_CHARS);
  const sourceFiles = [
    ...SOURCE_GLOBS.map((p) => path.join(root, p)),
    ...(await Promise.all(SOURCE_DIRS.map((d) => walk(path.join(root, d), [], ['.ts', '.tsx', '.css', '.html'])))).flat(),
  ];
  const files = [...(await walk(outDir)), ...sourceFiles];
  for (const file of files) {
    for (const ch of unescapeUnicode(await readFile(file, 'utf8'))) chars.add(ch);
  }
  // 이모지·제어문자는 폰트가 다루지 않는다(파비콘과 스플래시 로고는 시스템 이모지다).
  for (const ch of [...chars]) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || (cp >= 0x1f000 && cp <= 0x1ffff) || cp === 0xfe0f) chars.delete(ch);
  }
  const 모은것 = [...chars].sort().join('');
  collectChars.마지막검사 = 모은글자를_검사한다(모은것, files.length);
  return 모은것;
}

export { 모은글자를_검사한다 };

/**
 * Vite 플러그인. 산출물이 다 만들어진 뒤에 돌아야 글자를 셀 수 있으므로
 * writeBundle에서 실행한다(precache 플러그인과 같은 이유).
 */
export function subsetFonts({ srcDir, outSubdir = 'fonts' }) {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'voice-cinema-subset-fonts',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    async writeBundle() {
      const chars = await collectChars(outDir, root);
      await mkdir(path.join(outDir, outSubdir), { recursive: true });
      const written = [];
      const faces = [];
      for (const { weight, file } of WEIGHTS) {
        const original = await readFile(path.join(srcDir, file));
        const subset = await subsetFont(original, chars, { targetFormat: 'woff2' });
        if (subset.length >= original.length) {
          throw new Error(`서브셋이 원본보다 작아지지 않았다: ${file}`);
        }
        const name = `pretendard-${weight}.woff2`;
        await writeFile(path.join(outDir, outSubdir, name), subset);
        written.push(`${weight} ${Math.round(subset.length / 1024)}KB`);
        // font-display: optional — 늦게 도착한 폰트로 갈아끼우지 않는다. 이 앱은
        // 스플래시가 먼저 그려지므로 도중에 글꼴이 바뀌면 로고·글자가 덜컹거린다
        // (2026-09-09 대표 지적). 대신 <link rel="preload">로 먼저 받아, 첫 화면부터
        // 쓰이도록 한다. 서비스워커가 프리캐시하므로 두 번째부터는 항상 즉시 쓰인다.
        faces.push(
          `@font-face{font-family:'Pretendard';font-style:normal;font-weight:${weight};` +
            `font-display:optional;src:url('/${outSubdir}/${name}') format('woff2')}`
        );
      }
      // 앱과 개인정보처리방침이 같은 정의를 쓴다 — 두 곳에 따로 적으면 갈라진다.
      await writeFile(path.join(outDir, outSubdir, 'pretendard.css'), faces.join(String.fromCharCode(10)) + String.fromCharCode(10));
      const 검사 = collectChars.마지막검사;
      // 무엇을 몇 개 봤는지 먼저 말한다 — 0건 통과를 사람이 눈으로도 잡을 수 있게.
      console.log(`  폰트 서브셋 ${chars.length}자(한글 ${검사.한글수}자, 파일 ${검사.훑은파일수}개 훑음) · ${written.join(' / ')}`);
    },
  };
}
