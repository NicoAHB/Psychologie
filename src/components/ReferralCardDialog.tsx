import { useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { referralError, referralHasConflicts, referralTerms } from '../lib/referrals';
import { issueReferralCode, revokeReferralCode } from '../lib/referralCodes';
import { canvasPng, referralCardCanvas, referralExplanation } from '../lib/referralCard';
import type { Client, Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';
import '../referrals.css';

export function ReferralCardDialog({ vault, client, onClose }: { vault: VaultController; client: Client; onClose: () => void }) {
  const { t } = useI18n(); const [language,setLanguage] = useState<Language>(client.language);
  const [agreed,setAgreed] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState<TextKey>();
  const [image,setImage] = useState<{ url: string; code: string; blob: Blob }>();
  const code = vault.data!.referralCodes.find(c => c.clientId === client.id);
  const terms = referralTerms(vault.data!); const practice = vault.data!.settings.practice.name;
  const blocked = referralHasConflicts(vault.data!);
  useEffect(() => {
    let active = true, url = ''; setImage(undefined);
    if (code && !code.revokedAt && !blocked) {
      void Promise.resolve().then(() => canvasPng(referralCardCanvas(code.code,language,practice,terms))).then(blob => {
        if (!active) return; url = URL.createObjectURL(blob); setImage({ url, code: code.code, blob });
      }).catch(() => { if (active) setError('referralCardError'); });
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [code?.code, code?.revokedAt, language, practice, terms.rateBps, terms.months, blocked]);
  async function createCode() {
    if (!agreed || vault.demo || !vault.envelope || blocked) return;
    setBusy(true); setError(undefined); const key = vault.getKey();
    try {
      const issued = await issueReferralCode(vault.envelope.vaultId,client.id);
      if (!key || key !== vault.getKey()) return;
      await vault.update(data => {
        if (!data.clients.some(c => c.id === client.id) || referralHasConflicts(data)) throw new Error('referralConflict');
        if (!data.referralCodes.some(c => c.clientId === client.id)) data.referralCodes.push(issued);
      });
    } catch (e) { setError(referralError(e)); } finally { setBusy(false); }
  }
  async function revoke() {
    if (!code || !vault.envelope || !window.confirm(t('referralRevokeConfirm'))) return;
    setBusy(true); setError(undefined); const key = vault.getKey();
    try {
      await revokeReferralCode(vault.envelope.vaultId,code.id);
      if (key !== vault.getKey()) return;
      await vault.update(data => { const target = data.referralCodes.find(c => c.id === code.id); if (target) target.revokedAt = new Date().toISOString(); });
    } catch(e) { setError(referralError(e)); } finally { setBusy(false); }
  }
  return <Modal title={t('referralCard')} onClose={() => { if (!busy) onClose(); }} wide>
    <p className="referral-id">{t('referralClientId')}: {client.id}</p>
    {vault.demo && <Notice>{t('referralDemo')}</Notice>}
    {blocked && <Notice error>{t('referralConflict')}</Notice>}
    <Field label={t('referralCardLanguage')}><select value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="de">{t('referralLanguageDe')}</option><option value="uk">{t('referralLanguageUk')}</option></select></Field>
    <p className="pre-line mb-4" lang={language}>{referralExplanation(language,terms)}</p>
    {!code ? <><label className="check-label"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}/><span>{t('referralParticipate')}</span></label><button type="button" className="btn btn-primary mt-4" disabled={!agreed || busy || vault.demo || blocked} onClick={() => void createCode()}><Plus size={16}/>{t(busy ? 'working' : 'referralCreateCode')}</button><p className="hint mt-3">{t('referralSetup')}</p></> : code.revokedAt ? <Notice>{t('referralStatus_revoked')}</Notice> : <>
      <p className="referral-code">{code.code}</p>
      <p className="pre-line" lang={language}>{translate(language,'referralCardText').replace('[CODE]',code.code)}</p>
      {image && <img className="referral-card-image mt-4" src={image.url} alt={t('referralCard')}/>}
      <div className="button-row flex-wrap mt-4"><a className={`btn btn-primary ${!image ? 'is-disabled' : ''}`} href={image?.url} download={`Praxisraum-${code.code}-${language}.png`} aria-disabled={!image || undefined} onClick={e => { if (!image) e.preventDefault(); }}><Download size={16}/>{t('referralDownload')}</a><button type="button" className="btn btn-secondary" disabled={busy || vault.demo || blocked} onClick={() => void revoke()}>{t('referralRevoke')}</button></div>
      <p className="hint mt-3">{t('referralShareHint')}</p>
    </>}
    {error && <Notice error>{t(error)}</Notice>}
  </Modal>;
}
