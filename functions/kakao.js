// 의견 알림 — 카카오톡 «나에게 보내기»(2026-11-08 Bumm님 «Poster Studio와 똑같이», 팀장 전달 — Poster Studio 422f9b8의 구조를 그대로 옮겼다).
// 카카오 앱 키 두 개(KAKAO_REST_API_KEY · KAKAO_CLIENT_SECRET)는 Secret Manager에만 있고 함수가 돌 때 환경 변수로 들어온다(index.js의 secrets).
// 토큰은 서버 전용 문서 kakaoAuth/owner에만 둔다 — firestore.rules가 화면의 모든 읽기 · 쓰기를 막고 서버(Admin SDK)만 쓴다.
// 🔴 토큰 · 키 · 이름 · 의견 글을 로그에 남기지 않는다 — 카카오 오류는 상태와 오류 코드만 남긴다.
import crypto from 'node:crypto';

export const KAKAO_REDIRECT_URI = 'https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/kakao/callback';
// 메시지 템플릿의 링크 — 카카오 앱 [제품 링크 관리] › 웹 도메인에 등록한 주소여야 한다
export const KAKAO_LINK_URL = 'https://voice.edutogether.kr';
// 텍스트 템플릿 글자 상한(카카오 문서) — 넘치면 줄여 보낸다(저장은 원문 그대로)
export const KAKAO_MEMO_MAX = 200;
export const KAKAO_TIMEOUT_MS = 8000;
export const KAKAO_STATE_TTL_MS = 10 * 60 * 1000;
export const KAKAO_COLLECTION = 'kakaoAuth';

const charCount = (s) => [...s].length;
const sha256Hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 카카오 응답의 오류는 상태 · 오류 코드만 남긴다(본문에 토큰이 실릴 수 있어 통째로 남기지 않는다)
function kakaoError(where, status, json) {
  const code = json?.error_code ?? json?.code ?? json?.error ?? '';
  return Object.assign(new Error(`카카오 ${where} 실패: HTTP ${status}${code === '' ? '' : ` · ${code}`}`), { status, kakaoCode: code });
}

// 토큰 응답을 저장할 모양으로 — 리프레시 토큰은 남은 기간이 1개월 이하일 때만 새로 온다(카카오 문서). 안 오면 예전 값을 그대로 둔다
function tokenFields(json, now) {
  const fields = { accessToken: json.access_token, accessExpiresAt: now + (Number(json.expires_in) || 0) * 1000 };
  if (json.refresh_token) {
    fields.refreshToken = json.refresh_token;
    fields.refreshExpiresAt = now + (Number(json.refresh_token_expires_in) || 0) * 1000;
  }
  return fields;
}

function kakaoKeys() {
  const clientId = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('카카오 앱 키(Secret Manager)가 비어 있습니다');
  return { clientId, clientSecret };
}

function kakaoPage(res, status, title, lines) {
  res
    .status(status)
    .set('cache-control', 'no-store')
    .type('html')
    .send(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>` +
        `<body style="font-family:sans-serif;max-width:560px;margin:48px auto;padding:0 20px;line-height:1.6"><h1 style="font-size:22px">${escapeHtml(title)}</h1>` +
        lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') +
        '</body></html>'
    );
}

/**
 * db: Firestore를 돌려주는 함수(함수가 처음 불릴 때 연결한다). 시험은 firebase-admin/firestore를 가짜로 바꿔 끼운다.
 * 카카오 요청은 전역 fetch로 보낸다(시험은 fetch를 가짜로 바꾼다).
 */
export function createKakao(db) {
  const ownerRef = () => db().collection(KAKAO_COLLECTION).doc('owner');
  const pendingRef = () => db().collection(KAKAO_COLLECTION).doc('pending');

  // deadline(시각, ms)이 있으면 한 번의 상한은 «8초와 남은 시간 중 짧은 것»이고, 남은 시간이 없으면 부르지 않는다
  async function call(url, { where, form, token, deadline = Infinity } = {}) {
    const left = Math.min(KAKAO_TIMEOUT_MS, deadline - Date.now());
    if (!(left > 0)) throw Object.assign(new Error(`카카오 ${where}: 의견 응답 시간이 다 돼 부르지 않음`), { status: 0 });
    const headers = {};
    if (form) headers['content-type'] = 'application/x-www-form-urlencoded;charset=utf-8';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method: form ? 'POST' : 'GET',
      headers,
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(left),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw kakaoError(where, res.status, json);
    return json || {};
  }

  /** 연결 전이면 null. 매일 04시 정리 작업도 부른다 — 매일 갱신하면 리프레시 토큰이 만료 1개월 안에 들어서는 날 새것을 받아 다시 동의할 일이 없다 */
  async function refreshToken(now = Date.now(), deadline = Infinity) {
    const snap = await ownerRef().get();
    if (!snap.exists) return null;
    const owner = snap.data();
    const { clientId, clientSecret } = kakaoKeys();
    const json = await call('https://kauth.kakao.com/oauth/token', {
      where: '토큰 갱신',
      form: { grant_type: 'refresh_token', client_id: clientId, refresh_token: owner.refreshToken, client_secret: clientSecret },
      deadline,
    });
    const fields = { ...tokenFields(json, now), refreshedAt: new Date(now) };
    await ownerRef().set(fields, { merge: true });
    return { ...owner, ...fields };
  }

  /** 보냈으면 true, 아직 연결 전이면 false(저장만 한다). 실패하면 던진다 */
  async function sendMemo(text, now = Date.now(), deadline = Infinity) {
    const snap = await ownerRef().get();
    if (!snap.exists) return false;
    let owner = snap.data();
    if (!owner.accessToken || !(owner.accessExpiresAt > now + 60_000)) owner = await refreshToken(now, deadline);
    const send = (token) =>
      call('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
        where: '나에게 보내기',
        token,
        deadline,
        form: {
          template_object: JSON.stringify({
            object_type: 'text',
            text: charCount(text) > KAKAO_MEMO_MAX ? `${[...text].slice(0, KAKAO_MEMO_MAX - 1).join('')}…` : text,
            link: { web_url: KAKAO_LINK_URL, mobile_web_url: KAKAO_LINK_URL },
          }),
        },
      });
    try {
      await send(owner.accessToken);
    } catch (err) {
      if (err.status !== 401) throw err;
      owner = await refreshToken(now, deadline); // 저장한 만료 시각보다 먼저 끊긴 토큰 — 한 번만 새로 받아 다시 보낸다
      await send(owner.accessToken);
    }
    return true;
  }

  /* 연결(처음 한 번 — Bumm님이 /kakao/start를 열어 로그인 · «카카오톡 메시지 전송» 동의).
     state는 한 번만 쓰고(받으면 바로 지움) 10분 뒤 만료된다. 처음 연결한 카카오 계정 하나에 묶는다 —
     다른 계정이 연결을 시도하면 덮어쓰지 않는다(바꾸려면 Firestore 콘솔에서 kakaoAuth/owner를 지운다). */
  async function start(req, res) {
    let clientId;
    try {
      ({ clientId } = kakaoKeys());
    } catch {
      return kakaoPage(res, 503, '카카오 앱 키가 아직 없어요', ['Secret Manager에 두 키를 넣은 뒤 다시 열어 주세요.']);
    }
    const state = crypto.randomBytes(16).toString('hex');
    try {
      await pendingRef().set({ stateHash: sha256Hex(state), expiresAt: Date.now() + KAKAO_STATE_TTL_MS });
    } catch (err) {
      console.error('[kakao] 연결 준비 실패:', err?.message || err);
      return kakaoPage(res, 503, '지금은 연결할 수 없어요', ['잠시 뒤에 다시 열어 주세요.']);
    }
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: KAKAO_REDIRECT_URI, response_type: 'code', scope: 'talk_message', state });
    res.set('cache-control', 'no-store').redirect(302, `https://kauth.kakao.com/oauth/authorize?${q}`);
  }

  async function callback(req, res) {
    const { code, state, error } = req.query;
    if (error) return kakaoPage(res, 400, '연결하지 않았어요', ['카카오 로그인 · 동의를 마치지 않았습니다. 처음부터 다시 열어 주세요.']);
    if (typeof code !== 'string' || typeof state !== 'string' || !/^[0-9a-f]{32}$/.test(state)) {
      return kakaoPage(res, 400, '연결할 수 없어요', ['주소가 올바르지 않습니다. 처음부터 다시 열어 주세요.']);
    }
    try {
      // state는 한 번만 — 맞든 틀리든 읽은 뒤 지운다(같은 주소를 다시 열어도 통하지 않게)
      const pending = await db().runTransaction(async (tx) => {
        const snap = await tx.get(pendingRef());
        if (snap.exists) tx.delete(pendingRef());
        return snap.exists ? snap.data() : null;
      });
      const expected = Buffer.from(String(pending?.stateHash || ''), 'hex');
      const ok =
        pending &&
        pending.expiresAt > Date.now() &&
        expected.length === 32 &&
        crypto.timingSafeEqual(Buffer.from(sha256Hex(state), 'hex'), expected);
      if (!ok) return kakaoPage(res, 400, '연결 시간이 지났어요', ['10분 안에 마치지 못했거나 이미 쓴 주소입니다. 처음부터 다시 열어 주세요.']);

      const now = Date.now();
      const { clientId, clientSecret } = kakaoKeys();
      const token = await call('https://kauth.kakao.com/oauth/token', {
        where: '토큰 받기',
        form: { grant_type: 'authorization_code', client_id: clientId, redirect_uri: KAKAO_REDIRECT_URI, code, client_secret: clientSecret },
      });
      const me = await call('https://kapi.kakao.com/v2/user/me', { where: '사용자 확인', token: token.access_token });
      const userId = String(me.id ?? '');
      if (!userId) throw new Error('카카오 사용자 번호가 비어 있습니다');
      const ownerSnap = await ownerRef().get();
      if (ownerSnap.exists && ownerSnap.data().userId !== userId) {
        return kakaoPage(res, 403, '이미 다른 카카오 계정이 연결돼 있어요', ['처음 연결한 계정만 알림을 받습니다. 바꾸려면 운영자에게 알려 주세요.']);
      }
      await ownerRef().set({ userId, ...tokenFields(token, now), connectedAt: new Date(now) });
      let sent = false;
      try {
        sent = await sendMemo('Voice Cinema 의견 알림이 연결됐어요. 앞으로 «의견 보내기»로 들어온 의견이 여기로 옵니다.', now);
      } catch (err) {
        console.error('[kakao] 시험 메시지 실패:', err?.message || err);
      }
      console.log(`[kakao] 연결 완료 · 시험 메시지 ${sent ? '보냄' : '못 보냄'}`);
      return kakaoPage(
        res,
        200,
        '카카오톡 알림 연결 완료',
        sent ? ['카카오톡 «나와의 채팅»에 시험 메시지를 보냈습니다. 이 창은 닫아도 됩니다.'] : ['연결은 저장했지만 시험 메시지를 보내지 못했습니다. 팀장에게 알려 주세요.']
      );
    } catch (err) {
      console.error('[kakao] 연결 실패:', err?.message || err);
      return kakaoPage(res, 502, '연결하지 못했어요', ['잠시 뒤에 처음부터 다시 열어 주세요.']);
    }
  }

  return { refreshToken, sendMemo, start, callback };
}
