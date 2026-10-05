/** 행사 공통 표기와 Voice Cinema의 현재 체험 단계를 분리한다. */
export function FestivalHeader({ step = 1 }: { step?: 1 | 2 | 3 }) {
  return (
    <header className="festival-header">
      <button type="button" className="festival-partners festival-restart" aria-label="CGV와 인천광역시교육청 — 처음부터 시작" onClick={() => window.location.reload()}>
        <img className="partner-cgv" src="/brands/cgv.svg" alt="CGV" width="68" height="32" />
        <span aria-hidden="true">×</span>
        <img className="partner-education" src="/brands/education.png" alt="인천광역시교육청" width="199" height="52" />
      </button>
      <ol className="festival-steps" aria-label="더빙 이용 순서">
        {['장면 선택', '목소리 녹음', '영화 저장'].map((label, index) => (
          <li key={label} aria-current={index + 1 === step ? 'step' : undefined}>
            <span>{index + 1}</span><b>{label}</b>
          </li>
        ))}
      </ol>
      <button type="button" className="festival-signature festival-restart" aria-label="InKY Film Festival — 처음부터 시작" onClick={() => window.location.reload()}>
        {/* 공식 조합형 파일의 카메라 영역을 표시한다. 원본 파일은 변형하지 않는다. */}
        <span className="festival-symbol" aria-hidden="true"><img src="/brands/inky.png" alt="" /></span>
        <span><strong>InKY</strong> <span className="festival-english">Film Festival</span></span>
      </button>
      <a className="privacylink" href="./privacy.html" target="_blank" rel="noopener" aria-label="개인정보처리방침 (새 탭)">개인정보처리방침</a>
    </header>
  );
}
