import { useRef, useState, useSyncExternalStore } from 'react';
import { maskMail } from '../lib/mailAddress';
import { getMailState, removeMail, retryMail, subscribeMail } from '../lib/mailDelivery';

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
