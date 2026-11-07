'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMailStore } = require('../mail-store');

const CUTOFF = Date.parse('2026-12-01T00:00:00+09:00');
const seal = (text) => Buffer.from(`sealed:${Buffer.from(text).toString('hex')}`);
const unseal = (sealed) => Buffer.from(sealed.toString().slice('sealed:'.length), 'hex').toString();
const info = { name: '민수', email: 'teacher@ice.go.kr', genreId: 'fantasy', genreName: '판타지' };

let dir;
let clock;
const open = () => createMailStore({ dir, seal, unseal, purgeAt: CUTOFF, now: () => clock });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-mail-store-'));
  clock = Date.parse('2026-11-14T10:00:00+09:00');
});

/** 폴더의 모든 파일에서 글자를 찾는다(UTF-8 · UTF-16). */
function foundOnDisk(text) {
  const needles = [Buffer.from(text, 'utf8'), Buffer.from(text, 'utf16le')];
  return fs.readdirSync(dir).some((name) => {
    const data = fs.readFileSync(path.join(dir, name));
    return needles.some((needle) => data.includes(needle));
  });
}

test('넣은 그대로 읽히고, 껐다 켜도 남아 있다', () => {
  const video = Buffer.from('영상 바이트');
  const id = open().add(info, video);
  const store = open();
  const [item] = store.list();
  assert.equal(item.id, id);
  assert.equal(item.name, '민수');
  assert.equal(item.email, 'teacher@ice.go.kr');
  assert.equal(item.attempts, 0);
  assert.deepEqual(store.video(id), video);
});

test('이름 · 주소 · 영상이 파일에 평문으로 남지 않고, 키도 그대로 남지 않는다', () => {
  const video = Buffer.from('VIDEO-PLAINTEXT-MARK');
  open().add(info, video);
  assert.equal(foundOnDisk('teacher@ice.go.kr'), false);
  assert.equal(foundOnDisk('민수'), false);
  assert.equal(foundOnDisk('VIDEO-PLAINTEXT-MARK'), false);
  assert.equal(fs.readFileSync(path.join(dir, 'queue.key')).toString().startsWith('sealed:'), true);
});

test('파일을 건드리면 읽지 못한다', () => {
  const store = open();
  const id = store.add(info, Buffer.from('영상'));
  const target = path.join(dir, `${id}.video`);
  const data = fs.readFileSync(target);
  data[data.length - 1] ^= 1;
  fs.writeFileSync(target, data);
  assert.throws(() => store.video(id));
});

test('지우면 영상 · 정보 파일이 둘 다 사라진다', () => {
  const store = open();
  const id = store.add(info, Buffer.from('영상'));
  store.remove(id);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(fs.readdirSync(dir), ['queue.key']);
});

test('고쳐도 번호 · 이름은 그대로이고 고친 값이 남는다', () => {
  const store = open();
  const id = store.add(info, Buffer.from('영상'));
  store.update(id, { url: 'https://example.test/a.mp4', attempts: 2, id: 'bad' });
  const [item] = store.list();
  assert.equal(item.id, id);
  assert.equal(item.url, 'https://example.test/a.mp4');
  assert.equal(item.attempts, 2);
  assert.equal(item.name, '민수');
});

test('그사이 지운 건을 고쳐도 되살아나지 않는다', () => {
  const store = open();
  const id = store.add(info, Buffer.from('영상'));
  store.remove(id);
  store.update(id, { attempts: 1 });
  assert.deepEqual(store.list(), []);
});

test('경로를 벗어나는 번호는 받지 않는다', () => {
  assert.throws(() => open().video('../../secret'));
  assert.throws(() => open().remove('..\\..\\secret'));
});

test('영상만 쓰고 꺼진 건은 다음에 켤 때 치운다', () => {
  open();
  fs.writeFileSync(path.join(dir, '11111111-1111-1111-1111-111111111111.video'), 'x');
  fs.writeFileSync(path.join(dir, '22222222-2222-2222-2222-222222222222.meta.tmp'), 'x');
  const id = open().add(info, Buffer.from('영상'));
  const store = open();
  assert.equal(store.list().length, 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), [`${id}.meta`, `${id}.video`, 'queue.key'].sort());
});

test('11/30 23:59:59에는 그대로이고 12/1 00:00:00부터 목록을 읽으면 전부 지운다', () => {
  open().add(info, Buffer.from('영상'));
  clock = CUTOFF - 1000;
  assert.equal(open().list().length, 1);
  clock = CUTOFF;
  assert.deepEqual(open().list(), []);
  assert.deepEqual(fs.readdirSync(dir), ['queue.key']);
});

test('삭제 기한이 서버의 자동 삭제 기한과 같다', () => {
  const functions = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'index.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const server = /CUTOFF_DATE = new Date\('([^']+)'\)/.exec(functions);
  const desktop = /MAIL_PURGE_AT = Date\.parse\('([^']+)'\)/.exec(main);
  assert.ok(server, 'functions/index.js에서 기한을 찾지 못함');
  assert.ok(desktop, 'desktop/main.js에서 기한을 찾지 못함');
  assert.equal(Date.parse(desktop[1]), Date.parse(server[1]));
});
