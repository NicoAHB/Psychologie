import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './lib/i18n';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><App/></I18nProvider></StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => { /* Local workflow also works without offline cache. */ }); });
