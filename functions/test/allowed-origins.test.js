// CORS 허용 출처 규칙을 고정한다.
//
// 왜 이 테스트가 있는가: 2026-09-09에 정본 주소를 voice.edutogether.kr로 옮기기로
// 하면서, 허용 목록에 이미 있던 edutogether.kr 항목이 그 서브도메인을 매치하지
// 않는다는 것을 발견했다. 눈으로 보면 "이미 edutogether.kr이 있네" 하고 넘어가기
// 쉬운 자리다. 반대로 그걸 알아챈 다음에는 "그냥 edutogether.kr 전체를 허용하면
// 되잖아"라고 앵커를 푸는 쪽으로 고치기도 쉬운데, 그러면 공격자가 가진 도메인의
// 서브도메인까지 통째로 열린다. 두 방향 모두 여기서 걸리게 한다.
//
// index.js를 import하지 않고 소스를 읽는 이유: 그 파일은 최상위에서
// initializeApp()을 호출해 자격증명 없이 부수효과가 생긴다. 배열 리터럴만
// 떼어내 평가하면 실제로 배포되는 값 그대로를 검사할 수 있다.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const indexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');
const source = readFileSync(indexPath, 'utf8');

const literal = source.match(/const ALLOWED_ORIGINS = \[([\s\S]*?)\];/);
if (!literal) throw new Error('index.js에서 ALLOWED_ORIGINS 배열을 찾지 못했다');

/** 실제로 배포되는 정규식 목록 */
const ALLOWED_ORIGINS = new Function(`return [${literal[1]}]`)();
const allows = (origin) => ALLOWED_ORIGINS.some((r) => r.test(origin));

describe('허용해야 하는 출처', () => {
  test.each([
    ['https://voice-cinema.web.app', '현재 정본'],
    ['https://voice-cinema.firebaseapp.com', 'Hosting 기본 도메인'],
    ['https://edutogether.kr', 'Portal 리버스 프록시'],
    ['https://voice.edutogether.kr', '전환 예정 정본'],
    ['http://localhost:4321', '개발 서버'],
    ['http://127.0.0.1:4321', '개발 서버'],
  ])('%s (%s)', (origin) => {
    expect(allows(origin)).toBe(true);
  });
});

// 여기가 이 파일의 핵심이다 — 허용 목록에 부모 도메인이 있다고 해서 그 서브도메인이
// 따라 들어오지 않는다. voice.edutogether.kr이 통과하는 것은 "edutogether.kr이
// 있어서"가 아니라 자기 항목이 따로 있어서다.
test('부모 도메인 규칙은 서브도메인을 매치하지 않는다', () => {
  const parent = ALLOWED_ORIGINS.find((r) => r.source === String.raw`^https:\/\/edutogether\.kr$`);
  expect(parent, 'edutogether.kr 항목을 찾지 못함').toBeTruthy();
  expect(parent.test('https://voice.edutogether.kr')).toBe(false);
});

describe('차단해야 하는 출처', () => {
  test.each([
    // 앵커를 풀어 서브도메인을 통째로 허용하면 여기서 걸린다
    ['https://evil.edutogether.kr', '허가하지 않은 서브도메인'],
    ['https://evil.voice-cinema.web.app', '허가하지 않은 서브도메인'],
    // 끝 앵커($)를 풀면 여기서 걸린다 — 공격자가 가진 도메인의 접미사 위조
    ['https://voice.edutogether.kr.attacker.com', '접미사 위조'],
    ['https://edutogether.kr.attacker.com', '접미사 위조'],
    ['https://voice-cinema.web.app.attacker.com', '접미사 위조'],
    // 시작 앵커(^)를 풀면 여기서 걸린다
    ['https://notedutogether.kr', '접두사 위조'],
    ['https://attacker.com/https://edutogether.kr', '경로에 끼워넣기'],
    // 프로토콜을 느슨하게 하면 여기서 걸린다 — 부스 와이파이에서 가로채기 가능
    ['http://voice.edutogether.kr', '평문 http'],
    ['http://voice-cinema.web.app', '평문 http'],
    // 점(.) 이스케이프가 빠지면 여기서 걸린다 — 앵커가 있어도 막히지 않는다
    ['https://edutogetherXkr', '점을 임의 문자로 치환'],
    ['https://voiceXedutogether.kr', '점을 임의 문자로 치환'],
    ['https://voice-cinemaXweb.app', '점을 임의 문자로 치환'],
    // 폐지된 배포처 (2026-09-08)
    ['https://edutogether.github.io', 'GitHub Pages, 폐지됨'],
  ])('%s (%s)', (origin) => {
    expect(allows(origin)).toBe(false);
  });
});

// 위 항목들을 하나하나 적어두는 것만으로는 새로 추가되는 규칙을 못 막는다 —
// 목록에 들어오는 모든 규칙이 앵커를 갖추도록 강제한다.
test('모든 규칙이 시작·끝 앵커를 갖는다', () => {
  for (const r of ALLOWED_ORIGINS) {
    expect(r.source.startsWith('^'), `${r} 에 시작 앵커(^)가 없다`).toBe(true);
    expect(r.source.endsWith('$'), `${r} 에 끝 앵커($)가 없다`).toBe(true);
  }
});

// 점(.)을 이스케이프하지 않으면 정규식에서 "아무 문자 하나"가 된다 — 앵커가 멀쩡해도
// ^https://edutogetherXkr$ 가 통과한다. 위 차단 목록은 지금 있는 주소만 덮으므로,
// 앞으로 추가되는 규칙까지 커버하려면 목록 전체의 성질로 검사해야 한다.
// 이스케이프 쌍(백슬래시+문자)을 통째로 걷어낸 뒤에도 점이 남아 있으면,
// 그 점은 이스케이프되지 않은 것이다.
const hasUnescapedDot = (pattern) => pattern.replace(/\\./g, '').includes('.');

test('모든 규칙에서 점(.)이 이스케이프돼 있다', () => {
  for (const r of ALLOWED_ORIGINS) {
    expect(hasUnescapedDot(r.source), `${r} 에 이스케이프되지 않은 점이 있다`).toBe(false);
  }
});
