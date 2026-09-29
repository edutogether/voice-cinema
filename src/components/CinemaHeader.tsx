interface Props { step: 1 | 2 | 3 }

export function CinemaHeader({ step }: Props) {
  return (
    <header className="cinema-header desktop-home">
      <div className="cinema-wordmark">
        <img src="/icons/studio-microphone.png" width="40" height="40" alt="" />
        <span>Voice <strong>Cinema</strong></span>
      </div>
      <ol className="cinema-steps" aria-label="더빙 이용 순서">
        {['장면 선택', '목소리 녹음', '영화 저장'].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>
            <span>{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      <span className="cinema-festival">InKY 놀이터</span>
    </header>
  );
}
