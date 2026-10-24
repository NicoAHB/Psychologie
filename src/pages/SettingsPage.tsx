import type { SettingsSection } from '../lib/practiceFlow';
import { MemoLabelsCard } from '../components/MemoLabelsCard';
import { parseMoney } from '../lib/dates';
import { feeText } from '../lib/records';
import { useEffect, useState } from 'react';
import { Briefcase, CalendarDays, Cloud, FileText, Leaf, Trash2 } from 'lucide-react';
import { uid } from '../lib/types';
import { useI18n, type TextKey } from '../lib/i18n';
import { isValidZone } from '../lib/zones';
import { ExchangeRateField } from '../components/money';
import type { ExchangeRate, PracticeProfile } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Notice, PageHeading } from '../components/ui';
import { CloudAuth } from '../components/CloudAuth';
import { SecurityCard } from '../components/security';
import { BackupCard, HistoryCard } from '../components/backup';
import type { AutoBackup } from '../lib/useAutoBackup';
import { ZoneSelect } from '../components/ZoneSelect';
import { AppearanceCard } from '../components/AppearanceCard';

function TemplatesCard({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const [name, setName] = useState(''); const [body, setBody] = useState(''); const list = vault.data!.templates;
  return <section className="card settings-card"><span className="settings-icon"><FileText size={24}/></span><h2>{t('templates')}</h2><p>{t('templatesText')}</p>
    {list.length > 0 && <ul className="passkey-list">{list.map(x => <li key={x.id}><span>{x.name}</span><button className="icon-btn danger" aria-label={`${t('templateDelete')}: ${x.name}`} title={t('templateDelete')} onClick={() => { void vault.update(d => { d.templates = d.templates.filter(y => y.id !== x.id); }).catch(() => {}); }}><Trash2 size={16}/></button></li>)}</ul>}
    <Field label={t('templateName')}><input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></Field>
    <Field label={t('templateBody')}><textarea rows={4} value={body} maxLength={4000} onChange={e => setBody(e.target.value)}/></Field>
    <button className="btn btn-secondary" disabled={vault.demo || !name.trim() || !body.trim()} onClick={() => { void vault.update(d => { d.templates.push({ id: uid(), name: name.trim(), body }); }).then(() => { setName(''); setBody(''); }).catch(() => {}); }}>{t('templateAdd')}</button></section>;
}
function PracticeCard({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const stored = vault.data!.settings.practice;
  const [draft, setDraft] = useState<PracticeProfile>(stored); const [rate, setRate] = useState<ExchangeRate | undefined>(vault.data!.settings.exchangeRate); const [saved, setSaved] = useState(false);
  const field = (key: keyof PracticeProfile, label: TextKey, props: { multiline?: boolean; hint?: TextKey; placeholder?: TextKey; max?: number } = {}) =>
    <Field label={t(label)} hint={props.hint && t(props.hint)}>{props.multiline
      ? <textarea rows={3} maxLength={props.max ?? 400} value={draft[key] ?? ''} placeholder={props.placeholder && t(props.placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/>
      : <input maxLength={props.max ?? 120} value={draft[key] ?? ''} placeholder={props.placeholder && t(props.placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/>}</Field>;
  return <section id="settings-practice" tabIndex={-1} className="card settings-card settings-wide"><span className="settings-icon tone-beige"><Briefcase size={24}/></span><h2>{t('practiceProfile')}</h2><p>{t('practiceDisclaimer')}</p>
    <div className="form-grid">{field('name', 'practiceName')}{field('taxId', 'practiceTaxId')}</div>
    {field('address', 'practiceAddress', { multiline: true })}
    <fieldset id="settings-banks" tabIndex={-1} className="bank-account"><legend>{t('bankGermany')}</legend><div className="form-grid">{field('accountHolder', 'accountHolder')}{field('bank', 'practiceBank')}</div><div className="form-grid">{field('iban', 'practiceIban', { max: 42 })}{field('bic', 'bankBic', { max: 11 })}</div></fieldset>
    <fieldset className="bank-account"><legend>{t('bankUkraine')}</legend><div className="form-grid">{field('accountHolderUa', 'accountHolderUa')}{field('bankUa', 'practiceBankUa')}</div><div className="form-grid">{field('ibanUa', 'practiceIbanUa', { max: 42 })}{field('bicUa', 'bankBicUa', { max: 11 })}</div></fieldset>
    <div className="form-section"><h3>{t('exchangeRateTitle')}</h3><p className="hint">{t('exchangeRatePrivacy')}</p><ExchangeRateField value={rate} onChange={value => { setRate(value); setSaved(false); }}/></div>
    <div className="form-grid">{field('serviceName', 'practiceService')}{field('invoicePrefix', 'practicePrefix', { max: 10 })}</div>
    {field('taxNote', 'practiceTaxNote', { multiline: true, placeholder: 'practiceTaxNotePlaceholder', max: 600 })}
    <div className="button-row"><button className="btn btn-primary" disabled={vault.demo} onClick={() => { void vault.update(d => { d.settings.practice = { ...draft, name: draft.name.trim(), iban: draft.iban.replace(/\s+/g, ' ').trim(), ibanUa: draft.ibanUa?.replace(/\s+/g, ' ').trim() }; d.settings.exchangeRate = rate; }).then(() => setSaved(true)).catch(() => {}); }}>{t('practiceSave')}</button>{saved && <span className="hint" role="status">{t('practiceSaved')}</span>}</div></section>;
}

export function SettingsPage({ vault, auto, onSync, syncing, onRestore, focus }: { focus?: SettingsSection; vault: VaultController; auto: AutoBackup; onSync: () => Promise<void>; syncing: boolean; onRestore: () => Promise<void> }) {
  const { t } = useI18n(); const [message, setMessage] = useState<TextKey>(); const settings = vault.data!.settings;
  useEffect(() => { if (focus) { const node = document.getElementById(`settings-${focus}`); node?.focus(); node?.scrollIntoView({ block: 'start' }); } }, [focus]);
  const [defaultFee, setDefaultFee] = useState(feeText(settings.defaultCancellationFeeCents ?? 0));
  const setting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => { void vault.update(d => { d.settings[key] = value; }).catch(() => {}); };
  return <><PageHeading title={t('settingsTitle')} subtitle={t('settingsSubtitle')}/><div className="settings-grid">
    <AppearanceCard/>
    <BackupCard vault={vault} auto={auto}/>
    <section id="settings-cloud" tabIndex={-1} className="card settings-card"><span className="settings-icon tone-blue"><Cloud size={24}/></span><h2>{t('cloudTitle')}</h2><p>{t('cloudText')}</p>{vault.demo ? <Notice>{t('demoNotice')}</Notice> : <CloudAuth><label className="check-label"><input type="checkbox" checked={settings.autoSync} onChange={e => setting('autoSync', e.target.checked)}/><span>{t('autoSync')}</span></label><p className="hint">{t('autoSyncHint')}</p><div className="button-row"><button className="btn btn-primary" disabled={syncing} onClick={() => void onSync()}><Cloud size={17}/>{t(syncing ? 'syncing' : 'sync')}</button><button className="btn btn-secondary" disabled={syncing} onClick={() => void onRestore()}>{t('loadCloud')}</button></div><p className="hint">{t('cloudRestoreHint')}</p></CloudAuth>}<p className="hint">{t('freeTierNote')}</p></section>
    <section id="settings-reminders" tabIndex={-1} className="card settings-card"><span className="settings-icon tone-beige"><CalendarDays size={24}/></span><h2>{t('remindersTitle')}</h2><p>{t('remindersText')}</p><label className="check-label"><input type="checkbox" checked={!!settings.autoEmailReminders} disabled={vault.demo} onChange={e => setting('autoEmailReminders',e.target.checked)}/><span>{t('autoEmailReminders')}</span></label><p className="hint">{t('autoEmailRemindersHint')}</p><label className="check-label"><input type="checkbox" disabled={vault.demo} checked={settings.remindersEnabled} onChange={e => setting('remindersEnabled', e.target.checked)}/><span>{t('enableReminders')}</span></label><p className="hint">{t('reminderNeedsSetup')}</p><Field label={t('advisorChatId')} hint={t('chatHelp')}><input value={settings.advisorChatId} inputMode="numeric" placeholder={t('chatPlaceholder')} onChange={e => { if (/^-?\d*$/.test(e.target.value)) setting('advisorChatId', e.target.value); }}/></Field><ZoneSelect label={t('timeZone')} hint={t('timeZoneHint')} value={settings.timeZone} onChange={zone => { if (isValidZone(zone)) setting('timeZone', zone); }}/><Notice>{t('telegramLimit')}</Notice></section>
    <section className="card settings-card"><span className="settings-icon"><Leaf size={24}/></span><h2>{t('deviceTitle')}</h2><p>{t('installHint')}</p><p>{t('storageHint')}</p><button className="btn btn-secondary" onClick={async () => { try { setMessage(await navigator.storage?.persist?.() ? 'storageGranted' : 'storageDenied'); } catch { setMessage('storageDenied'); } }}>{t('storagePersist')}</button>{message && <Notice>{t(message)}</Notice>}</section>
    <section className="card settings-card"><h2>{t('cancellationFeeSettings')}</h2><Field label={t('defaultCancellationFee')} hint={t('defaultCancellationFeeHint')}><input inputMode="numeric" value={defaultFee} maxLength={6} onChange={e => setDefaultFee(e.target.value)}/></Field><button className="btn btn-secondary" disabled={vault.demo || !/^\d{1,6}$/.test(defaultFee)} onClick={() => { setting('defaultCancellationFeeCents',parseMoney(defaultFee)); }}>{t('save')}</button></section>
    <SecurityCard vault={vault}/>
    <HistoryCard vault={vault}/>
    <TemplatesCard vault={vault}/>
    <MemoLabelsCard vault={vault}/>
    <PracticeCard vault={vault}/>
  </div></>;
}
