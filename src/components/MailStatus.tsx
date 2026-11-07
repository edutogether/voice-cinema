import { useRef, useState, useSyncExternalStore } from 'react';
import { maskMail } from '../lib/mailAddress';
import { dismissTrialSent, getMailState, removeMail, retryMail, setTrialOffline, subscribeMail, type MailActivity } from '../lib/mailDelivery';

const ACTIVITY: Record<MailActivity, string> = {
  upload: '영화를 올리고 있어요',
  send: '메일을 보내는 것으로 처리하고 있어요',
  delete: '기기에서 지우고 있어요',
};

/** 모든 화면 위에 뜨는 시험판 표시 · 메일 대기 목록 · «보낸 것으로 처리» 안내. 목록에는 주소를 가려서 보이고 이름은 보이지 않는다 — 다음 사람이 볼 수 있는 화면이다. */
export function MailStatus() {
  const { items, activity, trialOffline, trialSent } = useSyncExternalStore(subscribeMail, getMailState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const failed = items.filter((item) => item.failed).length;
  const waiting = items.length - failed;

  return (
    <>
      <div className="mail-bar" id="mailBar">
        <div className="mail-bar-row">
          <strong>메일 시험판</strong>
          <span>실제 메일을 보내지 않습니다</span>
          <label className="mail-offline"><input type="checkbox" id="mailOfflineToggle" checked={trialOffline} onChange={(e) => setTrialOffline(e.target.checked)} /> 인터넷 끊김 시험</label>
        </div>
        {(activity || items.length > 0) && (
          <div className="mail-bar-row">
            {activity && <span id="mailActivity" role="status">{ACTIVITY[activity]}</span>}
            {items.length > 0 && (
              <button type="button" className="mail-queue-chip" id="mailQueueChip" onClick={() => dialogRef.current?.showModal()}>
                {[waiting > 0 && `메일 대기 ${waiting}건`, failed > 0 && `보내지 못함 ${failed}건`].filter(Boolean).join(' · ')}
              </button>
            )}
          </div>
        )}
      </div>

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

      {trialSent.map(({ key, mail, count, left }) => (
        <section className="mail-sent" key={key} aria-label="보낸 것으로 처리한 메일">
          <h2>보낸 것으로 처리했어요</h2>
          <p className="mail-sent-note">시험판이라 실제 메일은 가지 않았어요. 실제로는 아래 내용이 인솔 선생님께 갑니다. 영화는 실제로 올라갔고 링크로 열 수 있어요.</p>
          <dl>
            <dt>받는 사람</dt><dd>{mail.to}</dd>
            <dt>제목</dt><dd>{mail.subject}</dd>
            <dt>내용</dt>
            <dd className="mail-sent-body">{mail.body.split(/(https:\/\/\S+)/).map((part, i) => (i % 2 ? <a key={i} href={part} target="_blank" rel="noopener">{part}</a> : part))}</dd>
          </dl>
          <p className="mail-sent-done">영화 {count}편을 이 기기에서 지웠어요. 남은 대기 {left}건</p>
          <button type="button" onClick={() => dismissTrialSent(key)}>닫기</button>
        </section>
      ))}
    </>
  );
}
