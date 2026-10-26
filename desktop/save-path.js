'use strict';
// «이 기기에 저장»으로 받는 파일의 저장 위치. 크롬처럼 묻지 않고 다운로드 폴더에 두고, 같은 이름이 있으면 « (1)»을 붙인다 —
// 같은 장르를 여러 학생이 저장해도 앞 학생의 영화를 덮어쓰지 않는다.
const path = require('node:path');

function uniqueSavePath(dir, filename, exists) {
  const { name, ext } = path.parse(path.basename(filename));
  let candidate = path.join(dir, `${name}${ext}`);
  for (let n = 1; exists(candidate); n++) candidate = path.join(dir, `${name} (${n})${ext}`);
  return candidate;
}

module.exports = { uniqueSavePath };
