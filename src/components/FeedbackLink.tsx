import { useEffect, useRef, useState } from 'react';
import { FEEDBACK_CLOSE_AT } from '../config';
import { FEEDBACK_NAME_MAX, FEEDBACK_TEXT_MAX, rememberName, rememberedName, sendFeedback, type FeedbackResult } from '../lib/feedback';

const PROBLEM: Record<Exclude<FeedbackResult, 'ok'>, string> = {
  offline: '인터넷 연결을 확인해 주세요.',
  busy: '잠시 뒤에 다시 보내 주세요.',
  closed: '의견은 이제 받지 않아요.',
  error: '지금은 보낼 수 없어요. 잠시 뒤에 다시 해 주세요.',
};

// 남은 시간이 길면 1분마다 다시 잰다 — 노트북이 잠들었다 깨면 타이머가 그만큼 늦기 때문이다. 1분 안으로 들어오면 그 순간에 맞춘다.
// 화면이 다시 보일 때도 잰다(잠든 탭은 타이머가 늦다 — Poster Studio와 같다).
const RECHECK_MS = 60000;

/** 닫힘 시각 전이면 참. 그 시각이 되면 새로 고치지 않아도 거짓이 된다. */
function useBeforeClose(): boolean {
  const [open, setOpen] = useState(() => Date.now() < FEEDBACK_CLOSE_AT);
  useEffect(() => {
    if (!open) return;
    let timer = 0;
    const check = () => {
      window.clearTimeout(timer);
      const left = FEEDBACK_CLOSE_AT - Date.now();
      if (left <= 0) setOpen(false);
      else timer = window.setTimeout(check, Math.min(left, RECHECK_MS));
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', check); };
  }, [open]);
  return open;
}

/**
 * 첫 화면 «의견 보내기»(2026-11-08 Bumm님 «Poster Studio와 똑같이» — 이름 · 의견 · 판 번호 · 화면 크기 · 기기 · 단계 여섯 칸, 창 문구 · 단추도 같다).
 * 개인정보처리방침과 같은 줄 맨 왼쪽에 둔다. 🟠 2026-11-14 00:00(한국 시간)에 링크와 창이 함께 사라진다 — 배포 없이(config.ts의 FEEDBACK_CLOSE_AT).
 */
export function FeedbackLink({ step }: { step: number }) {
  const before = useBeforeClose();
  const [open, setOpen] = useState(false);
  if (!before) return null;
  return (
    <>
      <button type="button" className="feedback-link" id="feedbackLink" onClick={() => setOpen(true)}>의견 보내기</button>
      {open && <FeedbackDialog step={step} onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackDialog({ step, onClose }: { step: number; onClose: () => void }) {
  const [name, setName] = useState(rememberedName);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // 이름을 기억하고 있으면 바로 의견 칸에서 시작한다
  const startWithText = useRef(name.trim() !== '');
  useEffect(() => {
    dialog.current?.showModal();
    (startWithText.current ? textInput : nameInput).current?.focus();
  }, []);
  useEffect(() => { if (sent) closeButton.current?.focus(); }, [sent]);

  const submit = async () => {
    const n = name.trim();
    const t = text.trim();
    if (!n) { setProblem('이름을 적어 주세요.'); nameInput.current?.focus(); return; }
    if (!t) { setProblem('의견을 적어 주세요.'); textInput.current?.focus(); return; }
    setSending(true);
    setProblem(null);
    const result = await sendFeedback(n, t, step);
    setSending(false);
    if (result === 'ok') { rememberName(n); setText(''); setSent(true); }
    else setProblem(PROBLEM[result]);
  };

  return (
    <dialog
      ref={dialog}
      className="feedback-dialog"
      id="feedbackDialog"
      aria-labelledby="feedbackTitle"
      onCancel={(e) => { if (sending) e.preventDefault(); }}
      onClose={onClose}
    >
      {sent ? (
        <>
          <h2 id="feedbackTitle">보냈어요</h2>
          <p className="feedback-sub">의견을 잘 받았어요. 고맙습니다.</p>
          <div className="feedback-actions">
            <button type="button" ref={closeButton} className="feedback-send" onClick={() => dialog.current?.close()}>닫기</button>
          </div>
        </>
      ) : (
        <>
          <h2 id="feedbackTitle">의견 보내기</h2>
          <p className="feedback-sub feedback-lead">테스트하면서 불편했던 점이나 고칠 점, 오류를 적어 주세요.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (!sending) void submit(); }}>
            <label htmlFor="feedbackName">이름 <span className="feedback-hint"><span className="feedback-dash">— </span>피드백을 살펴보고 추가로 문의드릴 것이 있을 때를 위해 적어 주세요.</span></label>
            <input
              id="feedbackName"
              ref={nameInput}
              type="text"
              autoComplete="off"
              maxLength={FEEDBACK_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={sending}
            />
            <div className="feedback-text-head">
              <label htmlFor="feedbackText">의견 <span className="feedback-hint"><span className="feedback-dash">— </span>어느 화면에서 어떤 문제가 있었는지 함께 적어 주세요.</span></label>
              <p id="feedbackCount" className="feedback-count">{[...text].length} / {FEEDBACK_TEXT_MAX}</p>
            </div>
            <textarea
              id="feedbackText"
              ref={textInput}
              maxLength={FEEDBACK_TEXT_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={sending}
              aria-describedby="feedbackCount"
            />
            <p className="feedback-auto"><span>함께 보내는 것: 판 번호 · 화면 크기 · 기기 · 단계</span> <span>보내지 않는 것: 녹음한 목소리 · 영화</span></p>
            <p className="feedback-problem" role="alert">{problem ?? ''}</p>
            <div className="feedback-actions">
              <button type="button" className="feedback-cancel" onClick={() => dialog.current?.close()} disabled={sending}>취소</button>
              <button type="submit" className="feedback-send" disabled={sending}>{sending ? '보내는 중…' : '보내기'}</button>
            </div>
          </form>
        </>
      )}
    </dialog>
  );
}
