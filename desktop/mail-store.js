'use strict';
// 인터넷이 끊겼을 때 영화와 메일 주소를 잠시 보관하는 곳. 건마다 영상 파일(<id>.video)과 정보 파일(<id>.meta)을 AES-256-GCM으로 암호화해 쓰고,
// 키(queue.key)는 Windows 사용자 계정으로 보호한다(main.js가 safeStorage를 넘긴다). 같은 Windows 계정의 다른 앱까지 막지는 못한다.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const IV_BYTES = 12;
const TAG_BYTES = 16;
const ID = /^[0-9a-f-]{36}$/;

/** purgeAt 이후에 목록을 읽으면 전부 지운다 — 링크도 그때 사라져 보낼 까닭이 없고, 개인정보처리방침의 보관 기한과 같다. */
function createMailStore({ dir, seal, unseal, purgeAt, now = Date.now }) {
  fs.mkdirSync(dir, { recursive: true });
  const keyFile = path.join(dir, 'queue.key');
  let key;
  if (fs.existsSync(keyFile)) {
    key = Buffer.from(unseal(fs.readFileSync(keyFile)), 'base64');
  } else {
    key = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, seal(key.toString('base64')));
  }

  const encrypt = (plain) => {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  };
  const decrypt = (sealed) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, sealed.subarray(0, IV_BYTES));
    decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
  };
  const file = (id, kind) => {
    if (!ID.test(id)) throw new Error('잘못된 대기열 번호');
    return path.join(dir, `${id}.${kind}`);
  };
  // 도중에 꺼져도 반쪽 파일이 남지 않게 임시 이름으로 쓴 뒤 바꾼다
  const write = (target, plain) => {
    fs.writeFileSync(`${target}.tmp`, encrypt(plain));
    fs.renameSync(`${target}.tmp`, target);
  };
  const readMeta = (id) => JSON.parse(decrypt(fs.readFileSync(file(id, 'meta'))).toString('utf8'));
  const ids = () => fs.readdirSync(dir).filter((name) => name.endsWith('.meta')).map((name) => name.slice(0, -'.meta'.length));
  const remove = (id) => {
    fs.rmSync(file(id, 'meta'), { force: true });
    fs.rmSync(file(id, 'video'), { force: true });
  };

  // 영상을 쓴 뒤 정보 파일을 쓰기 전에 꺼진 건은 대기열에 오른 적이 없다 — 켤 때 치운다
  const known = new Set(ids());
  for (const name of fs.readdirSync(dir)) {
    if (name === 'queue.key' || name.endsWith('.meta')) continue;
    if (!name.endsWith('.video') || !known.has(name.slice(0, -'.video'.length))) fs.rmSync(path.join(dir, name), { force: true });
  }

  return {
    add(info, bytes) {
      const id = crypto.randomUUID();
      write(file(id, 'video'), bytes);
      write(file(id, 'meta'), Buffer.from(JSON.stringify({ ...info, id, createdAt: now(), attempts: 0, nextAt: 0, failed: false }), 'utf8'));
      return id;
    },
    list() {
      if (now() >= purgeAt) ids().forEach(remove);
      return ids().map(readMeta).sort((a, b) => a.createdAt - b.createdAt);
    },
    video(id) {
      return decrypt(fs.readFileSync(file(id, 'video')));
    },
    update(id, patch) {
      if (!fs.existsSync(file(id, 'meta'))) return; // 그사이 운영자가 지운 건
      write(file(id, 'meta'), Buffer.from(JSON.stringify({ ...readMeta(id), ...patch, id }), 'utf8'));
    },
    remove,
  };
}

module.exports = { createMailStore };
