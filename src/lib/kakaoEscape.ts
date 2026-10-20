import { isKakaoInApp, kakaoExternalUrl, kakaoMenuHint } from '../logic';

// 카카오톡 안 브라우저로 열리면 바깥 브라우저(아이폰 사파리·갤럭시 기본 브라우저)로 넘긴다(10/20 대표님) —
// 카카오톡 안에서는 녹음 마이크와 영상 저장이 막힐 수 있다. 리액트보다 먼저 돌아 스플래시 위에 덮는다.
//
// 카카오톡 안에서는 앱을 띄우지 않는다 — 곧 떠날 탭에서 엔진 31MB·장면 영상·reCAPTCHA를 받지 않게, «여기서 계속하기»를
// 누를 때만 띄운다. 이동은 이 페이지가 다 뜬 뒤(load)에 한다 — load 전에 이동하면 E2E 도구가 페이지의 load를 끝내 못 받아
// 1분 시간 초과로 떨어졌다(10/20). 이동이 받던 요청을 끊지는 않는다(10/20 실측: 느린 fetch·그림 모두 끝까지 받음).
//
// 자동 이동은 이 탭에서 한 번만 한다. 이동한 뒤에도 카카오톡 안 화면은 그대로 남으므로(바깥 브라우저가 따로 열린다)
// 다시 열리거나 새로고침돼도 같은 이동을 되풀이하지 않고, 손으로 여는 길만 안내한다.
const TRIED_KEY = 'vc-kakao-external-tried';
// «브라우저로 여는 중…»을 보여 준 뒤 이동한다
const NOTICE_MS = 500;
// 이동하고도 이 화면이 남아 있으면 손으로 여는 길을 보여 준다
const HELP_MS = 1500;

function alreadyTried(): boolean {
  try {
    return sessionStorage.getItem(TRIED_KEY) === '1';
  } catch {
    return false;
  }
}

function markTried(): void {
  try {
    sessionStorage.setItem(TRIED_KEY, '1');
  } catch {}
}

/** 카카오톡 안이면 안내를 띄우고 true — 앱은 «여기서 계속하기»를 누를 때 `startApp`으로 띄운다. 아니면 false. */
export function escapeKakaoInApp(startApp: () => void): boolean {
  const ua = navigator.userAgent;
  if (!isKakaoInApp(ua)) return false;
  const target = kakaoExternalUrl(location.href);

  const box = document.createElement('div');
  box.id = 'kakao-escape';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'kakao-escape-title');
  const card = document.createElement('div');
  card.className = 'kakao-escape-card';
  const title = document.createElement('h2');
  title.id = 'kakao-escape-title';
  title.textContent = '브라우저로 여는 중…';
  const why = document.createElement('p');
  why.className = 'kakao-escape-why';
  why.textContent = '카카오톡 안에서는 녹음과 영상 저장이 안 될 수 있어서, 바깥 브라우저로 엽니다.';
  const help = document.createElement('div');
  help.className = 'kakao-escape-help';
  help.hidden = true;
  const hint = document.createElement('p');
  hint.className = 'kakao-escape-hint';
  hint.textContent = `열리지 않으면 ${kakaoMenuHint(ua)}`;
  // 손으로 누르는 다시 시도 — 자동 이동은 사용자 동작 없이 막히는 경우가 있다고 알려져 있다
  const open = document.createElement('a');
  open.className = 'kakao-escape-open';
  open.href = target;
  open.textContent = '바깥 브라우저로 열기';
  const stay = document.createElement('button');
  stay.type = 'button';
  stay.className = 'kakao-escape-stay';
  stay.textContent = '여기서 계속하기';
  stay.addEventListener('click', () => {
    box.remove();
    startApp();
  });
  help.append(hint, open, stay);
  card.append(title, why, help);
  box.append(card);
  document.body.append(box);

  const showHelp = () => {
    title.textContent = '바깥 브라우저에서 열어 주세요';
    help.hidden = false;
    open.focus();
  };
  if (alreadyTried()) {
    showHelp();
    return true;
  }
  markTried();
  const loaded = new Promise<void>((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });
  const noticed = new Promise<void>((resolve) => window.setTimeout(resolve, NOTICE_MS));
  void Promise.all([loaded, noticed]).then(() => {
    location.href = target;
    window.setTimeout(showHelp, HELP_MS);
  });
  return true;
}
