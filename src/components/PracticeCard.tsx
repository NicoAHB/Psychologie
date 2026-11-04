import { useEffect, useRef, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import type { Currency, ExchangeRate, PracticeProfile } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Notice } from './ui';
import { ExchangeRateField } from './money';
import { SaveButton } from './SaveButton';
import { useSaveStatus } from '../lib/useSaveStatus';
import { InvoiceLogoFields } from './InvoiceLogoFields';
import { defaultInvoiceLogo, type PendingInvoiceLogo } from '../lib/invoiceLogo';

export function PracticeCard({ vault, focus, currency = 'EUR' }: { vault: VaultController; focus?: 'practice' | 'banks'; currency?: Currency }) {
  const { t } = useI18n(); const stored = vault.data!.settings.practice;
  const [draft, setDraft] = useState<PracticeProfile>(stored); const [rate, setRate] = useState<ExchangeRate | undefined>(vault.data!.settings.exchangeRate); const saveStatus = useSaveStatus();
  const [logo, setLogo] = useState(vault.data!.settings.invoiceLogo ?? defaultInvoiceLogo());
  const [pendingLogo, setPendingLogo] = useState<PendingInvoiceLogo>(); const [readingLogo, setReadingLogo] = useState(false);
  const logoEdited = useRef(false);
  useEffect(() => { if (!logoEdited.current) setLogo(vault.data!.settings.invoiceLogo ?? defaultInvoiceLogo()); }, [vault.data?.settings.invoiceLogo]);
  async function save() {
    const upload = pendingLogo, previousLogo = logo; let added: string | undefined;
    try {
      if (upload) added = await vault.addFile(upload.bytes);
      const nextLogo = upload && added ? { enabled: logo.enabled, source: 'custom' as const, file: { blobId: added, fileName: upload.fileName, mimeType: 'image/png', size: upload.bytes.byteLength } } : logo;
      await vault.update(d => { d.settings.practice = { ...draft, name: draft.name.trim(), iban: draft.iban.replace(/\s+/g, ' ').trim(), ibanUa: draft.ibanUa?.replace(/\s+/g, ' ').trim() }; d.settings.exchangeRate = rate; if (logoEdited.current) d.settings.invoiceLogo = nextLogo; });
      added = undefined; logoEdited.current = false; setPendingLogo(current => current === upload ? undefined : current); setLogo(current => current === previousLogo ? nextLogo : current);
    } catch (error) { if (added) await vault.purgeUnused([added]).catch(() => {}); throw error; }
  }
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => { if (focus) { const node = focus === 'banks' ? cardRef.current?.querySelector<HTMLElement>(currency === 'UAH' ? 'fieldset:nth-of-type(2)' : 'fieldset') : cardRef.current; node?.focus(); node?.scrollIntoView({ block: 'start' }); } }, [focus, currency]);
  const field = (key: keyof PracticeProfile, label: TextKey, props: { multiline?: boolean; hint?: TextKey; placeholder?: TextKey; max?: number } = {}) =>
    <Field label={t(label)} hint={props.hint && t(props.hint)}>{props.multiline
      ? <textarea rows={3} maxLength={props.max ?? 400} value={draft[key] ?? ''} placeholder={props.placeholder && t(props.placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); saveStatus.changed(); }}/>
      : <input maxLength={props.max ?? 120} value={draft[key] ?? ''} placeholder={props.placeholder && t(props.placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); saveStatus.changed(); }}/>}</Field>;
  return <section ref={cardRef} id="settings-practice" tabIndex={-1} className="card settings-card settings-wide"><span className="settings-icon tone-beige"><Briefcase size={24}/></span><h2>{t('practiceProfile')}</h2><p>{t('practiceDisclaimer')}</p>
    <div className="form-grid">{field('name', 'practiceName')}{field('taxId', 'practiceTaxId')}</div>
    {field('address', 'practiceAddress', { multiline: true })}
    <fieldset id="settings-banks" tabIndex={-1} className="bank-account"><legend>{t('bankGermany')}</legend><div className="form-grid">{field('accountHolder', 'accountHolder')}{field('bank', 'practiceBank')}</div><div className="form-grid">{field('iban', 'practiceIban', { max: 42 })}{field('bic', 'bankBic', { max: 11 })}</div></fieldset>
    <fieldset tabIndex={-1} className="bank-account"><legend>{t('bankUkraine')}</legend><div className="form-grid">{field('accountHolderUa', 'accountHolderUa')}{field('bankUa', 'practiceBankUa')}</div><div className="form-grid">{field('ibanUa', 'practiceIbanUa', { max: 42 })}{field('bicUa', 'bankBicUa', { max: 11 })}</div></fieldset>
    <div className="form-section"><h3>{t('exchangeRateTitle')}</h3><p className="hint">{t('exchangeRatePrivacy')}</p><ExchangeRateField value={rate} onChange={value => { setRate(value); saveStatus.changed(); }}/></div>
    <div className="form-grid">{field('serviceName', 'practiceService')}{field('invoicePrefix', 'practicePrefix', { max: 10 })}</div>
    {field('taxNote', 'practiceTaxNote', { multiline: true, placeholder: 'practiceTaxNotePlaceholder', max: 600 })}
    <InvoiceLogoFields vault={vault} value={logo} pending={pendingLogo} disabled={vault.demo || saveStatus.saving} onBusy={setReadingLogo} onChange={value => { logoEdited.current = true; setLogo(value); saveStatus.changed(); }} onUpload={value => { logoEdited.current = true; setPendingLogo(value); saveStatus.changed(); }}/>
    <div className="button-row"><SaveButton status={saveStatus} disabled={vault.demo || readingLogo} onClick={() => { void saveStatus.save(save).catch(() => {}); }}/></div>{saveStatus.failed && <Notice error>{t('storageError')}</Notice>}</section>;
}
