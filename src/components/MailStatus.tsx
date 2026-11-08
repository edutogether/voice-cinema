import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { maskMail } from '../lib/mailAddress';
import { getMailState, removeMail, retryAll, retryMail, subscribeMail } from '../lib/mailDelivery';
import { batchStatus } from '../lib/mailQueue';

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => { window.removeEventListener('online', listener); window.removeEventListener('offline', listener); };
};
const readOnline = () => navigator.onLine;

/**
 * 설치판 시작 창(11/8 Bumm님 «설치판이 켜져 있으면 쌓인 게 몇 건 있다고 얘기해 줘야지 … 사람이 언제부터 언제까지 켜 놔야 될 줄 알고»).
 * 켤 때 보낼 메일이 남아 있거나 인터넷이 돌아왔을 때, 그때 남은 건을 한 묶음으로 잡아 «보낼 메일 N건» → 보내는 중 k / N건 → 끝을 알린다.
 * 🔴 첫 화면에서만 띄운다 — 녹음 · 저장 중에 인터넷이 돌아오면 끼어들지 않고 첫 화면으로 돌아왔을 때 띄운다(보내기는 뒤에서 그대로 돈다).
 * 목록 · 주소는 보이지 않는다(다음 사람이 볼 수 있는 화면이다 — 주소는 «메일 대기» 목록에서 가려서 본다).
 */
export function MailStartup({ atHome }: { atHome: boolean }) {
  const { items, loaded } = useSyncExternalStore(subscribeMail, getMailState);
  const online = useSyncExternalStore(subscribeOnline, readOnline);
  const [batch, setBatch] = useState<string[] | null>(null);
  const startTaken = useRef(false);
  const onlineSeen = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 켤 때: 처음 읽은 목록에 남은 건이 있으면 그것이 묶음이다
  useEffect(() => {
    if (!loaded || startTaken.current) return;
    startTaken.current = true;
    if (items.length) setBatch(items.map((item) => item.id));
  }, [loaded, items]);

  // 인터넷이 돌아오면: 그때 남은 건을 묶음에 더한다(창이 이미 떠 있으면 그 창이 보내는 중으로 바뀐다)
  useEffect(() => {
    const onOnline = () => { onlineSeen.current = true; };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  useEffect(() => {
    if (!online || !onlineSeen.current || !loaded) return;
    onlineSeen.current = false;
    if (items.length) setBatch((prev) => [...new Set([...(prev ?? []), ...items.map((item) => item.id)])]);
  }, [online, loaded, items]);

  // 스플래시가 걷힌 뒤에 띄운다 — 창은 맨 위 층이라 스플래시 위에 먼저 뜬다
  const [splashGone, setSplashGone] = useState(() => !document.getElementById('splash'));
  useEffect(() => {
    if (splashGone) return;
    const observer = new MutationObserver(() => {
      if (!document.getElementById('splash')) setSplashGone(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [splashGone]);

  const show = batch !== null && atHome && splashGone;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (show && !dialog.open) dialog.showModal();
    if (!show && dialog.open) dialog.close();
  }, [show]);

  const status = batch ? batchStatus(batch, items) : null;
  const phase = !status ? null
    : status.pending > 0 ? (online ? 'sending' : 'offline')
      : status.failed > 0 ? 'partial' : 'done';
  const close = () => dialogRef.current?.close();
  const percent = status && status.total ? Math.round((100 * (status.sent * 2 + status.uploaded)) / (status.total * 2)) : 0;

  return (
    <dialog
      className="mail-queue mail-startup" id="mailStartup" ref={dialogRef} aria-labelledby="mailStartupTitle" data-phase={phase ?? undefined}
      // 보내는 동안에는 Esc로 닫지 않는다 — 끝날 때까지 이 창으로 진행을 본다(닫아도 보내기는 뒤에서 돈다)
      onCancel={(e) => { if (phase === 'sending') e.preventDefault(); }}
      onClose={() => setBatch(null)}
    >
      {status && phase === 'offline' && (
        <>
          <h2 id="mailStartupTitle">보낼 메일 {status.total}건이 있어요</h2>
          <p>인터넷에 연결되면 바로 보내요. 이 창을 켜 둔 채 인터넷을 연결해 주세요.</p>
          <div className="mail-startup-buttons"><button type="button" id="mailStartupLater" onClick={close}>나중에</button></div>
        </>
      )}
      {status && phase === 'sending' && (
        <>
          <h2 id="mailStartupTitle">보낼 메일 {status.total}건이 있어요</h2>
          <p role="status">메일 보내는 중 {status.sent} / {status.total}건 — 끝날 때까지 프로그램을 끄지 마세요</p>
          <div className="mail-startup-bar" role="progressbar" aria-label="메일 보내기 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <i style={{ width: `${percent}%` }} />
          </div>
        </>
      )}
      {status && phase === 'done' && (
        <>
          <h2 id="mailStartupTitle">{status.total}건 모두 보냈어요. 이제 꺼도 돼요.</h2>
          <div className="mail-startup-buttons"><button type="button" className="primary" id="mailStartupDone" onClick={close}>완료</button></div>
        </>
      )}
      {status && phase === 'partial' && (
        <>
          <h2 id="mailStartupTitle">{status.sent > 0 ? `${status.sent}건 보냈고 ${status.failed}건은 못 보냈어요` : `${status.failed}건을 못 보냈어요`}</h2>
          <div className="mail-startup-buttons">
            <button type="button" id="mailStartupLater" onClick={close}>나중에</button>
            <button type="button" className="primary" id="mailStartupRetry" onClick={() => { void retryAll(); }}>다시 보내기</button>
          </div>
        </>
      )}
    </dialog>
  );
}

/**
 * 첫 화면 노란 «인터넷 없이 쓰는 설치판» 표시 옆의 «메일 대기 N건» 단추와 그 목록(11/8 — 화면 위에 늘 떠 있던 시험판 표시줄을 없애며 옮겼다).
 * 기다리는 메일이 있을 때만 보인다. 목록에는 주소를 가려서 보이고 이름은 보이지 않는다 — 다음 사람이 볼 수 있는 화면이다.
 */
export function MailQueueChip() {
  const { items, activity } = useSyncExternalStore(subscribeMail, getMailState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const failed = items.filter((item) => item.failed).length;
  const waiting = items.length - failed;

  return (
    <>
      {items.length > 0 && (
        <button type="button" className="mail-queue-chip" id="mailQueueChip" onClick={() => dialogRef.current?.showModal()}>
          {[waiting > 0 && `메일 대기 ${waiting}건`, failed > 0 && `보내지 못함 ${failed}건`].filter(Boolean).join(' · ')}
        </button>
      )}
      <dialog className="mail-queue" id="mailQueue" ref={dialogRef} aria-labelledby="mailQueueTitle">
        <h2 id="mailQueueTitle">기다리는 메일</h2>
        {items.length === 0 && <p>기다리는 메일이 없어요.</p>}
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span className="mail-queue-to">{maskMail(item.email)}</span>
              <span className="mail-queue-state">{item.failed ? '보내지 못했어요' : '보내기를 기다리고 있어요'}</span>
              <span className="mail-queue-buttons">
                {item.failed && <button type="button" onClick={() => { void retryMail(item.id); }}>다시 보내기</button>}
                <button
                  type="button" disabled={activity !== null} onBlur={() => setAskDelete(null)}
                  onClick={() => {
                    if (askDelete === item.id) { setAskDelete(null); void removeMail(item.id); }
                    else setAskDelete(item.id);
                  }}
                >{askDelete === item.id ? '영화도 함께 지워져요. 지울까요 ?' : '지우기'}</button>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="mail-queue-close" onClick={() => dialogRef.current?.close()}>닫기</button>
      </dialog>
    </>
  );
}
