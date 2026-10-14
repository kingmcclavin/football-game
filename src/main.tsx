import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

// Block pinch-zoom / double-tap zoom gestures on iOS Safari during play.
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && (e.target as HTMLElement)?.closest?.('.gamewrap')) e.preventDefault();
  lastTouch = now;
}, { passive: false });

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
