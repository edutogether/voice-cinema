import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 서비스워커의 프리캐시 목록을 빌드 시점에 자동 생성한다.
 *
 * 왜 필요한가: 예전에는 sw.js 안에 캐시할 파일 목록을 손으로 적어뒀는데, 파일을
 * 하나 추가하고 목록 갱신을 잊으면 **오프라인에서 앱이 통째로 안 뜨는** 사고가
 * 났다(2026-09-07 감사에서 App Check 번들이 빠져 실제로 그 상태였다). 빌드가
 * 실제로 만들어낸 산출물에서 목록을 뽑으면 그 실수 자체가 불가능해진다.
 * 파일명에 붙는 해시도 자동으로 따라간다.
 *
 * 무엇을 넣고 무엇을 빼는가:
 *  - 넣는다: html/js/css(앱 셸)와 vendor/**(ffmpeg 엔진·App Check 번들 등), fonts/**(서브셋 폰트).
 *    앱이 부팅하려면 반드시 필요한 것들이라 오프라인에 있어야 한다.
 *  - 뺀다: clips/**(6개 합쳐 37MB). install에서 한꺼번에 받으면 행사장 와이파이에서
 *    설치 자체가 실패한다 — 실제로 재생한 장르부터 런타임에 쌓는다.
 */
export function precacheSW({ swSource, precacheDirs = ['vendor', 'fonts'], excludeDirs = ['clips'] }) {
  let outDir;
  return {
    name: 'voice-cinema-precache-sw',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    // 산출물이 전부 디스크에 쓰인 뒤에 실행한다 — HTML과 public/ 복사본까지
    // 전부 보이는 유일한 시점이다.
    writeBundle() {
      const files = listFiles(outDir).map((abs) => ({
        abs,
        url: '/' + path.relative(outDir, abs).split(path.sep).join('/'),
      }));

      const included = files.filter(({ url }) => {
        if (url === '/sw.js') return false;
        if (excludeDirs.some((d) => url.startsWith(`/${d}/`))) return false;
        if (precacheDirs.some((d) => url.startsWith(`/${d}/`))) return true;
        return /\.(html|js|css)$/.test(url);
      });

      // 목록이 비거나 진입점이 빠지면 오프라인이 조용히 죽는다 — 배포되기 전에 멈춘다.
      if (!included.some((e) => e.url.endsWith('.html'))) {
        throw new Error('프리캐시 목록에 HTML 진입점이 없습니다 — 오프라인에서 앱이 뜨지 않습니다.');
      }
      if (!included.some((e) => e.url.startsWith('/vendor/'))) {
        throw new Error('프리캐시 목록에 vendor/ 파일이 없습니다 — 오프라인에서 엔진 로드가 실패합니다.');
      }

      const manifest = included
        .map(({ abs, url }) => ({ url, hash: hashFile(abs) }))
        .sort((a, b) => a.url.localeCompare(b.url));

      // 목록이나 내용이 조금이라도 바뀌면 캐시 이름이 바뀌어 옛 캐시가 폐기된다.
      // 예전처럼 사람이 CACHE_NAME 버전 올리는 걸 잊어 옛 화면이 계속 보이는 일이 없다.
      const version = createHash('sha256')
        .update(manifest.map((e) => e.url + e.hash).join('\n'))
        .digest('hex')
        .slice(0, 12);

      const source = readFileSync(swSource, 'utf8')
        .replace('__PRECACHE_URLS__', JSON.stringify(manifest.map((e) => e.url), null, 2))
        .replace('__CACHE_VERSION__', JSON.stringify(version));

      writeFileSync(path.join(outDir, 'sw.js'), source);
      console.log(`  서비스워커 프리캐시 ${manifest.length}개 (캐시 ${version})`);
    },
  };
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...listFiles(abs));
    else out.push(abs);
  }
  return out;
}

function hashFile(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16);
}
