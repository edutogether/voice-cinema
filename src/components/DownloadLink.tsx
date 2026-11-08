import { SETUP_DOWNLOAD } from '../config';
import { IN_INSTALLER } from '../lib/installer';
import { mailEnabled } from '../lib/mailDelivery';
import { MailQueueChip } from './MailStatus';

// 설치판 안에서는 이미 설치한 것을 또 받을 까닭이 없다.

/**
 * 첫 화면 오른쪽 위 설치 파일 아이콘(2026-11-07 Bumm님, Poster Studio와 같은 모양 — 글자 없이 Lucide «download» 하나, 방침 링크 바로 왼쪽).
 * 받는 이름은 Storage 객체의 Content-Disposition이 정한다(리디렉션으로 다른 주소로 넘어가면 download 속성의 이름이 듣지 않는다).
 * 🔴 누르기 전에는 설치 파일을 받지 않는다 — 평범한 링크다. prefetch · preload · 서비스워커 미리 받기에 넣지 않는다.
 * 설치판 안에서는 같은 자리에 노란 «인터넷 없이 쓰는 설치판» 표시 하나만 둔다(11/8 Bumm님 — Poster Studio 설치판의 표시와 같은 모양).
 * 첫 화면에만 보인다(머리글이 첫 단계에서만 이 자리를 그린다) — 녹음 · 미리보기 · 저장 화면에는 없다.
 * 그 옆에 기다리는 메일이 있을 때만 «메일 대기 N건» 단추를 둔다(설치판 · 웹 모두, 운영자가 목록을 보고 다시 보내거나 지운다).
 * 설치 파일 아이콘이 숨는 휴대폰에서도 이 단추는 보인다.
 */
export function DownloadLink() {
  if (IN_INSTALLER) return <><span className="installer-badge">인터넷 없이 쓰는 설치판</span>{mailEnabled && <MailQueueChip />}</>;
  return (
    <>
      {mailEnabled && <MailQueueChip />}
      <a className="download-link" href={SETUP_DOWNLOAD.href} download={SETUP_DOWNLOAD.file} aria-label="Voice Cinema 설치 파일 다운로드">
        {/* Lucide «download» 그대로(lucide-static 0.460.0, ISC) */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />
        </svg>
      </a>
    </>
  );
}
