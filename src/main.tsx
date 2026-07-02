import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// SW güncelleme kontrolü: uygulama öne geldiğinde ve saatte bir.
// iOS PWA'da eski sürüm önbellekte takılı kalabiliyor — sadece sayfa
// yüklenirken yapılan varsayılan kontrol yeni deploy'u geç yakalıyor.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => { registration.update().catch(() => {}); }, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
