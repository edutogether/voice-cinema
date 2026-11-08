import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installSplash } from './lib/splash';
import { escapeKakaoInApp } from './lib/kakaoEscape';
import { startMailDelivery } from './lib/mailDelivery';
import './styles/base.css';
import './styles/splash.css';
import './styles/home.css';
import './styles/studio.css';
import './styles/result.css';
import './styles/mail.css';
import './styles/feedback.css';
import './styles/kakao.css';

function startApp() {
  installSplash();
  startMailDelivery();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

if (!escapeKakaoInApp(startApp)) startApp();
