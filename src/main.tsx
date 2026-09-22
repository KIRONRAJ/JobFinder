import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted: this is an offline-first local tool, so first paint must not
// depend on fonts.googleapis.com being reachable.
import '@fontsource-variable/outfit';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
// Registers GSAP's plugins once, app-wide, before any component mounts —
// see gsapSetup.ts. framer-motion -> GSAP migration, 30 Aug 2026: there is
// no GSAP equivalent of the old <MotionConfig reducedMotion="user"> wrapper
// that used to sit here — each animation site now checks
// prefersReducedMotion() (also from gsapSetup.ts) itself.
import './lib/gsapSetup';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
