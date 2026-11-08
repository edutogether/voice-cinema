import { useEffect, useRef, useState } from 'react';
import type { Genre } from '../genres';
import { checkMail, MAIL_MAX, NAME_MAX, suggestDomain, withDomain, type MailProblem } from '../lib/mailAddress';
import { mailInBrowser, queueMail } from '../lib/mailDelivery';
import { ActionIcon } from './ActionIcon';

const MAIL_ERROR: Record<MailProblem, string> = {
  empty: '메일 주소를 적어 주세요.',
  notLatin: '메일 주소는 영문으로 적어 주세요. 한/영 키를 눌러 바꿔 주세요.',
  format: '메일 주소 형식이 맞지 않아요. teacher@school.kr처럼 적어 주세요.',
};

interface Props {
  genre: Genre;
  blob: Blob;
  onSaveHere: () => void;
  onHome: () => void;
}

/**
 * 영상을 올리지 못했을 때(설치판 · 웹 모두, 11/8) 교사 · 운영자가 이름(또는 별명)과 인솔 교사 메일을 적는다.
 * 🔴 적는 동안 값은 이 화면의 상태에만 있다 — 제출 양식(form) · 자동 완성을 쓰지 않아 다음 사람에게 이전 주소가 뜨지 않는다.
 * «맞아요, 보내 주세요»를 누른 뒤에만 보내기 대기열(설치판은 암호화 파일, 웹은 이 사이트의 IndexedDB)에 맡긴다.
 * 주소를 두 번 적게 하지 않고 다음 화면에서 다시 보여 고치게 한다(GOV.UK 메일 주소 패턴).
 * «메일 없이 이 기기에 저장»은 두지 않는다(11/8 Bumm님, 설치판과 같은 화면) — 대기열에 맡기지 못했을 때만 이 기기에 저장으로 간다.
 * 적는 칸과 확인은 옅은 판 하나에 모은다(11/8 Bumm님 «아래쪽이 너무 비어 보입니다 … 허술해 보이지 않게», src/styles/mail.css).
 */
export function MailHandoff({ genre, blob, onSaveHere, onHome }: Props) {
  const [step, setStep] = useState<'entry' | 'confirm' | 'queued'>('entry');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nameError, setNameError] = useState(false);
  const [mailProblem, setMailProblem] = useState<MailProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const fixingRef = useRef(false);

  useEffect(() => {
    if (fixingRef.current) {
      fixingRef.current = false;
      emailRef.current?.focus();
      return;
    }
    rootRef.current?.querySelector('h2')?.focus({ preventScroll: true });
  }, [step]);

  const next = () => {
    const problem = checkMail(email);
    const noName = !name.trim();
    setNameError(noName);
    setMailProblem(problem);
    if (noName) nameRef.current?.focus();
    else if (problem) emailRef.current?.focus();
    else {
      setName(name.trim());
      setEmail(email.trim());
      setStep('confirm');
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) next();
  };

  const send = async () => {
    setBusy(true);
    try {
      await queueMail({ name, email, genreId: genre.id, genreName: genre.name }, blob);
      setName('');
      setEmail('');
      setStep('queued');
    } catch (e) {
      console.error('[메일 대기열] 보관하지 못함', e instanceof Error ? e.message : '');
      onSaveHere();
    }
  };

  const betterDomain = suggestDomain(email);

  return (
    <div id="mailHandoff" ref={rootRef}>
      {step === 'entry' && (
        <>
          <h2 tabIndex={-1}>인터넷이 끊겨 QR을 만들지 못했어요</h2>
          <p id="doneMsg">인터넷이 돌아오면 인솔 선생님 메일로 영화 링크를 보내요.</p>
          <div className="mail-form">
            <div className="mail-field mail-field-name">
              <label htmlFor="mailName">이름 또는 별명</label>
              <input
                id="mailName" ref={nameRef} type="text" value={name} maxLength={NAME_MAX} autoComplete="off" spellCheck={false}
                aria-invalid={nameError} aria-describedby={nameError ? 'mailNameError' : undefined}
                onChange={(e) => { setName(e.target.value); setNameError(false); }} onKeyDown={onEnter}
              />
              {nameError && <p className="mail-error" id="mailNameError">이름 또는 별명을 적어 주세요.</p>}
            </div>
            <div className="mail-field mail-field-address">
              <label htmlFor="mailAddress">인솔 선생님 메일 주소</label>
              <input
                id="mailAddress" ref={emailRef} type="email" inputMode="email" value={email} maxLength={MAIL_MAX} autoComplete="off" autoCapitalize="off" spellCheck={false}
                aria-invalid={mailProblem !== null} aria-describedby={mailProblem ? 'mailAddressError' : undefined}
                onChange={(e) => { setEmail(e.target.value); setMailProblem(null); }} onKeyDown={onEnter}
              />
              {mailProblem && <p className="mail-error" id="mailAddressError">{MAIL_ERROR[mailProblem]}</p>}
            </div>
            <div className="row mail-actions">
              <button type="button" className="btn btn-lg btn-save" id="mailNextBtn" onClick={next}>다음 <ActionIcon name="arrow" /></button>
            </div>
          </div>
        </>
      )}

      {step === 'confirm' && (
        <>
          <h2 tabIndex={-1}>이 주소가 맞나요 ?</h2>
          <p id="doneMsg">이 주소로 영화 링크를 보내요. 주소가 틀리면 다른 사람에게 갈 수 있어요.</p>
          <div className="mail-form">
            <p className="mail-address" id="mailAddressShown">{email}</p>
            <p className="mail-name-shown">이름 또는 별명: <b id="mailNameShown">{name}</b></p>
            {betterDomain && (
              <p className="mail-typo" id="mailTypo">
                혹시 {betterDomain} 주소인가요 ?
                <button type="button" className="mail-typo-fix" id="mailTypoFixBtn" onClick={() => setEmail(withDomain(email, betterDomain))}>{betterDomain} 주소로 고치기</button>
              </p>
            )}
            <div className="row mail-actions">
              <button type="button" className="btn btn-lg btn-save" id="mailSendBtn" disabled={busy} onClick={() => { void send(); }}><ActionIcon name="check" /> 맞아요, 보내 주세요</button>
              <button type="button" className="btn btn-lg btn-ghost" id="mailFixBtn" disabled={busy} onClick={() => { fixingRef.current = true; setStep('entry'); }}><ActionIcon name="back" /> 고치기</button>
            </div>
          </div>
        </>
      )}

      {step === 'queued' && (
        <>
          <span className="result-symbol"><ActionIcon name="check" /></span>
          <h2 tabIndex={-1}>인터넷이 돌아오면 보내 드릴게요</h2>
          {mailInBrowser ? (
            <>
              <p id="doneMsg">이 브라우저에 잠시 보관했다가 인터넷이 돌아오면 보내고 바로 지워요.</p>
              {/* 웹 보관의 조건 두 가지(11/8 Bumm님 지시 — 짧게). 창을 닫으면 다시 열 때 이어서 보낸다 */}
              <ul className="mail-conditions" id="mailConditions">
                <li>인터넷이 돌아올 때 이 창이 열려 있어야 보내져요.</li>
                <li>크롬 기록(사이트 데이터)을 지우면 보내기 전 영화도 지워져요.</li>
              </ul>
            </>
          ) : (
            <p id="doneMsg">이 기기에 잠시 보관했다가 인터넷이 돌아오면 보내고 바로 지워요. 프로그램을 껐다면 다시 켜야 이어서 보내요.</p>
          )}
          <div className="row result-actions mail-actions">
            <button type="button" className="btn btn-lg btn-ghost" id="doneHomeBtn" onClick={onHome}><ActionIcon name="clapperboard" /> 다른 더빙 하기</button>
          </div>
        </>
      )}
    </div>
  );
}
