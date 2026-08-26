// 감사 발견 반영: clips/(레거시 설치판용)와 docs/clips/(라이브 GitHub Pages용)에
// 같은 6개 mp4가 물리적으로 중복돼 있는데 이를 맞춰주는 장치가 없었다 — 대표님이
// docs/clips/만 실제 영상으로 교체하면 clips/는 계속 컬러바로 남는 식의 사고를 막기 위해,
// docs/clips/(라이브, 정본)를 clips/(레거시, 회귀 대비용)로 복사한다.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'docs', 'clips');
const DEST = path.join(__dirname, '..', 'clips');
const GENRES = ['fantasy', 'animation', 'horror', 'action', 'drama', 'sitcom'];

let copied = 0;
for (const id of GENRES) {
  const srcFile = path.join(SRC, id + '.mp4');
  const destFile = path.join(DEST, id + '.mp4');
  if (!fs.existsSync(srcFile)) {
    console.log(`⚠ ${id}.mp4 없음 (docs/clips/) — 건너뜀`);
    continue;
  }
  fs.copyFileSync(srcFile, destFile);
  copied++;
  console.log(`✓ ${id}.mp4 동기화 완료`);
}
console.log(`\n${copied}/${GENRES.length}개 파일을 docs/clips/ → clips/ 로 동기화했습니다.`);
