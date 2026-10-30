import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ThemeModeProvider } from './themeMode';
import { BASE } from './api';
import { SessionProvider } from './session';

function Root() {
  return (
    <ThemeModeProvider>
      <BrowserRouter basename={BASE}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

// Installable PWA: caches the app shell; autoUpdate swaps in new versions on the next load.
registerSW({ immediate: true });
