import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { randomShareSecret, shareFragment, shareTokenHash } from '../lib/documentShareCrypto';
import { documentSharesConfigured, publishDocumentShare, queueShareRevocations, revokeDocumentShare } from '../lib/documentShares';
import { runSecureTask } from '../lib/workerTasks';
import { uid, type Client, type ClientDocument } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';

export function DocumentShareDialog({ vault, client, documentId, onClose }: { vault: VaultController; client: Client; documentId: string; onClose: () => void }) {
  const { t } = useI18n(); const [days, setDays] = useState(3), [passphrase, setPassphrase] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false), [link, setLink] = useState(''), [copied, setCopied] = useState(false);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function create() {
    setBusy(true); setError(false); const id = uid(), vaultId = vault.envelope?.vaultId; let attempted = false;
    try {
      if (vault.demo || !vaultId) throw new Error();
      const doc = vault.data!.documents.find(d => d.id === documentId); if (!doc) throw new Error();
      const secret = randomShareSecret(), token = randomShareSecret(), expiresAt = new Date(Date.now() + days * 864e5).toISOString();
      const bytes = new Uint8Array(await (await vault.file(doc.file.blobId, doc.file.mimeType)).arrayBuffer());
      let packet;
      try { packet = await runSecureTask('sealSharedDocument', { id, expiresAt, secret, passphrase, bytes, fileName: doc.file.fileName, mimeType: doc.file.mimeType }); } finally { bytes.fill(0); }
      if (!alive.current) return;
      attempted = true; await publishDocumentShare(id, await shareTokenHash(token), expiresAt, packet);
      if (!alive.current) throw new Error();
      const url = new URL(import.meta.env.BASE_URL, location.origin); url.hash = shareFragment({ id, secret, token, language: client.language });
      await vault.update(data => { const current = data.documents.find(d => d.id === documentId); if (!current) throw new Error(); (current.shares ??= []).push({ id, createdAt: new Date().toISOString(), expiresAt, link: url.href }); });
      if (alive.current) { setLink(url.href); setPassphrase(''); }
    } catch {
      if (attempted && vaultId) { await queueShareRevocations(vaultId, [id]); await revokeDocumentShare(id).catch(() => {}); }
      if (alive.current) setError(true);
    } finally { if (alive.current) setBusy(false); }
  }
  return <Modal title={t('shareTitle')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={e => { e.preventDefault(); void create(); }}><p>{t('shareHint')}</p>
    {!link ? <><Field label={t('shareDays')}><select value={days} disabled={busy} onChange={e => setDays(Number(e.target.value))}><option value="1">{t('shareOneDay')}</option><option value="3">{t('shareThreeDays')}</option><option value="7">{t('shareSevenDays')}</option></select></Field><Field label={t('sharePassphrase')} hint={t('sharePassphraseHint')}><input type="password" autoComplete="new-password" value={passphrase} minLength={12} maxLength={256} disabled={busy} onChange={e => setPassphrase(e.target.value)}/></Field></>
      : <><Field label={t('shareLink')}><textarea readOnly rows={4} value={link}/></Field><button className="btn btn-secondary" type="button" onClick={() => { void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setError(true)); }}>{t('shareCopy')}</button>{copied && <p role="status">{t('shareCopied')}</p>}</>}
    {(!documentSharesConfigured || vault.demo) && <Notice>{t('shareNoConfig')}</Notice>}{error && <Notice error>{t('shareError')}</Notice>}<p className="hint">{t('shareLimitHint')}</p><div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button>{!link && <button className="btn btn-primary" disabled={busy || !documentSharesConfigured || vault.demo || !!passphrase && passphrase.length < 12}>{t(busy ? 'working' : 'shareCreate')}</button>}</div></form></Modal>;
}

export function DocumentShareHistory({ vault, document }: { vault: VaultController; document: ClientDocument }) {
  const { t, language } = useI18n(); const [limit, setLimit] = useState(5), [busy, setBusy] = useState(false), [error, setError] = useState(false), [copied, setCopied] = useState(false);
  const shares = [...document.shares ?? []].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!shares.length) return null;
  async function revoke(id: string) { setBusy(true); setError(false); try { await revokeDocumentShare(id); await vault.update(data => { const share = data.documents.find(d => d.id === document.id)?.shares?.find(s => s.id === id); if (share) { share.revokedAt = new Date().toISOString(); share.link = ''; } }); } catch { setError(true); } finally { setBusy(false); } }
  return <section className="share-history" aria-label={t('shareHistory')}><h4>{t('shareHistory')}</h4><ul className="document-history">{shares.slice(0, limit).map(share => { const active = !share.revokedAt && Date.parse(share.expiresAt) > Date.now(); return <li key={share.id}><div><span>{t(share.revokedAt ? 'shareRevoked' : 'shareExpires')} · <time dateTime={share.revokedAt ?? share.expiresAt}>{new Date(share.revokedAt ?? share.expiresAt).toLocaleString(language === 'de' ? 'de-DE' : 'uk-UA')}</time></span>{active && <div className="button-row"><button className="btn btn-secondary btn-small" disabled={busy} onClick={() => { void navigator.clipboard.writeText(share.link).then(() => setCopied(true)).catch(() => setError(true)); }}>{t('shareCopy')}</button><button className="btn btn-ghost btn-small" disabled={busy} onClick={() => void revoke(share.id)}>{t('shareRevoke')}</button></div>}</div></li>; })}</ul>{shares.length > limit && <button className="text-link" onClick={() => setLimit(n => n + 10)}>{t('followUpShowMore')}</button>}{copied && <p role="status">{t('shareCopied')}</p>}{error && <Notice error>{t('shareError')}</Notice>}</section>;
}
