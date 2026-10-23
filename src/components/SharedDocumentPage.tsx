import { useEffect, useRef, useState } from 'react';
import { LanguageSwitch, useI18n } from '../lib/i18n';
import { ThemeToggle } from '../lib/theme';
import type { ShareInvitation } from '../lib/documentShareCrypto';
import { fetchSharedDocument } from '../lib/documentShares';
import { runSecureTask } from '../lib/workerTasks';
import { Field, Logo, Notice } from './ui';

export default function SharedDocumentPage({ invitation }: { invitation: ShareInvitation | null }) {
  const { t, setLanguage } = useI18n(); const [passphrase, setPassphrase] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<'shareUnavailable' | 'shareDecryptError'>(), [done, setDone] = useState(false);
  const alive = useRef(true), urls = useRef(new Set<string>());
  useEffect(() => { if (invitation) setLanguage(invitation.language); }, [invitation?.language, setLanguage]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); }; }, []);
  async function download() {
    if (!invitation) return; setBusy(true); setError(undefined); setDone(false);
    try {
      const share = await fetchSharedDocument(invitation.id, invitation.token); if (!alive.current) return;
      let opened; try { opened = await runSecureTask('openSharedDocument', { id: share.id, expiresAt: share.expires_at, secret: invitation.secret, passphrase, packet: share.payload }); } catch { throw new Error('shareDecryptError'); }
      if (!alive.current) { opened.bytes.fill(0); return; }
      const blob = new Blob([opened.bytes], { type: opened.mimeType }); opened.bytes.fill(0);
      const url = URL.createObjectURL(blob); urls.current.add(url); const anchor = document.createElement('a'); anchor.href = url; anchor.download = opened.fileName; anchor.click();
      setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 10000); setPassphrase(''); setDone(true);
    } catch (error) { if (alive.current) setError(error instanceof Error && error.message === 'shareDecryptError' ? 'shareDecryptError' : 'shareUnavailable'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <main className="share-guest"><header className="share-guest-header"><Logo/><div className="button-row"><ThemeToggle/><LanguageSwitch/></div></header><section className="card"><h1>{t('shareTitle')}</h1><p>{t('shareGuestHint')}</p>{!invitation ? <Notice error>{t('shareUnavailable')}</Notice> : <form onSubmit={e => { e.preventDefault(); void download(); }}><Field label={t('sharePassphrase')} hint={t('sharePassphraseHint')}><input type="password" autoComplete="off" value={passphrase} maxLength={256} disabled={busy} onChange={e => setPassphrase(e.target.value)}/></Field><button className="btn btn-primary" disabled={busy}>{t(busy ? 'working' : 'shareDownload')}</button></form>}{error && <Notice error>{t(error)}</Notice>}{done && <p role="status">{t('shareDownloaded')}</p>}<p className="hint">{t('shareLimitHint')}</p></section></main>;
}
