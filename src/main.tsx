import { StrictMode, lazy, Suspense, useEffect, useState } from 'react';
import { parseShareInvitation } from './lib/documentShareCrypto';
import { parseVideoInvitation } from './lib/videoRoom';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { registerServiceWorker } from './lib/updates';
import './styles.css';
import './appearance.css';
import './email-setup.css';
const MarketingUnsubscribePage = lazy(()=>import('./components/MarketingUnsubscribePage'));
const SharedDocumentPage = lazy(() => import('./components/SharedDocumentPage'));
const VideoGuestPage = lazy(() => import('./components/VideoConsultation').then(m => ({ default: m.VideoGuestPage })));
function Entry() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const change = () => setHash(location.hash); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  if(hash.startsWith('#marketing-unsubscribe='))return <Suspense fallback={<p role="status">…</p>}><MarketingUnsubscribePage key={hash} hash={hash}/></Suspense>;
  if (hash.startsWith('#document=')) return <Suspense fallback={<p role="status">…</p>}><SharedDocumentPage key={hash} invitation={parseShareInvitation(hash)}/></Suspense>;
  return hash.startsWith('#video=') ? <Suspense fallback={<p role="status">…</p>}><VideoGuestPage invitation={parseVideoInvitation(hash)}/></Suspense> : <App/>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><I18nProvider><ThemeProvider><Entry/></ThemeProvider></I18nProvider></ErrorBoundary></StrictMode>);
if (import.meta.env.PROD) window.addEventListener('load', () => registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`, import.meta.env.BASE_URL));
