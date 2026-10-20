import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installSplash } from './lib/splash';
import { escapeKakaoInApp } from './lib/kakaoEscape';
import './styles/base.css';
import './styles/splash.css';
import './styles/home.css';
import './styles/studio.css';
import './styles/result.css';
import './styles/kakao.css';

escapeKakaoInApp();
installSplash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
