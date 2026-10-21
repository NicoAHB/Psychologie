import { useState } from 'react';
import { Briefcase, CalendarDays, Cloud, Download, Leaf, ShieldCheck } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { today } from '../lib/dates';
import { downloadText } from '../lib/files';
import { isValidZone } from '../lib/zones';
import type { PracticeProfile } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Notice, PageHeading } from './ui';
import { CloudAuth } from './CloudAuth';
import { ZoneSelect } from './ZoneSelect';

function PracticeCard({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const stored = vault.data!.settings.practice;
  const [draft, setDraft] = useState<PracticeProfile>(stored); const [saved, setSaved] = useState(false);
  const field = (key: keyof PracticeProfile, label: TextKey, props: { multiline?: boolean; hint?: TextKey; placeholder?: TextKey; max?: number } = {}) =>
    <Field label={t(label)} hint={props.hint && t(props.hint)}>{props.multiline
      ? <textarea rows={3} maxLength={props.max ?? 400} value={draft[key]} placeholder={props.placeholder && t(props.placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/>
      : <input maxLength={props.max ?? 120} value={draft[key]} placeholder={props.placeholder && t(props.placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/>}</Field>;
  return <section className="card settings-card settings-wide"><span className="settings-icon tone-beige"><Briefcase size={24}/></span><h2>{t('practiceProfile')}</h2><p>{t('practiceDisclaimer')}</p>
    <div className="form-grid">{field('name', 'practiceName')}{field('taxId', 'practiceTaxId')}</div>
    {field('address', 'practiceAddress', { multiline: true })}
    <div className="form-grid">{field('iban', 'practiceIban', { max: 42 })}{field('bank', 'practiceBank')}</div>
    <div className="form-grid">{field('serviceName', 'practiceService')}{field('invoicePrefix', 'practicePrefix', { max: 10 })}</div>
    {field('taxNote', 'practiceTaxNote', { multiline: true, placeholder: 'practiceTaxNotePlaceholder', max: 600 })}
    <div className="button-row"><button className="btn btn-primary" disabled={vault.demo} onClick={() => { void vault.update(d => { d.settings.practice = { ...draft, name: draft.name.trim(), iban: draft.iban.replace(/\s+/g, ' ').trim() }; }).then(() => setSaved(true)).catch(() => {}); }}>{t('practiceSave')}</button>{saved && <span className="hint" role="status">{t('practiceSaved')}</span>}</div></section>;
}

export function SettingsPage({ vault, onSync, syncing, onRestore }: { vault: VaultController; onSync: () => Promise<void>; syncing: boolean; onRestore: () => Promise<void> }) {
  const { t } = useI18n(); const [message, setMessage] = useState<TextKey>(); const [busy, setBusy] = useState(false); const settings = vault.data!.settings;
  async function backup() {
    setBusy(true); setMessage(undefined);
    try { const backup = await vault.exportBackup(); if (!backup) return; downloadText(`praxisraum-${today()}.encrypted.json`, JSON.stringify(backup), 'application/json'); setMessage('backupSuccess'); }
    catch { setMessage('imageError'); } finally { setBusy(false); }
  }
  const setting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => { void vault.update(d => { d.settings[key] = value; }).catch(() => {}); };
  return <><PageHeading title={t('settingsTitle')} subtitle={t('settingsSubtitle')}/><div className="settings-grid">
    <section className="card settings-card"><span className="settings-icon"><ShieldCheck size={24}/></span><h2>{t('securityTitle')}</h2><p>{t('securityText')}</p><button className="btn btn-secondary" disabled={busy || vault.demo} onClick={() => void backup()}><Download size={17}/>{t(busy ? 'working' : 'exportBackup')}</button><p className="hint">{t('backupHelp')}</p>{message && <Notice>{t(message)}</Notice>}</section>
    <section className="card settings-card"><span className="settings-icon tone-blue"><Cloud size={24}/></span><h2>{t('cloudTitle')}</h2><p>{t('cloudText')}</p>{vault.demo ? <Notice>{t('demoNotice')}</Notice> : <CloudAuth><label className="check-label"><input type="checkbox" checked={settings.autoSync} onChange={e => setting('autoSync', e.target.checked)}/><span>{t('autoSync')}</span></label><p className="hint">{t('autoSyncHint')}</p><div className="button-row"><button className="btn btn-primary" disabled={syncing} onClick={() => void onSync()}><Cloud size={17}/>{t(syncing ? 'syncing' : 'sync')}</button><button className="btn btn-secondary" disabled={syncing} onClick={() => void onRestore()}>{t('loadCloud')}</button></div><p className="hint">{t('cloudRestoreHint')}</p></CloudAuth>}<p className="hint">{t('freeTierNote')}</p></section>
    <section className="card settings-card"><span className="settings-icon tone-beige"><CalendarDays size={24}/></span><h2>{t('remindersTitle')}</h2><p>{t('remindersText')}</p><label className="check-label"><input type="checkbox" disabled={vault.demo} checked={settings.remindersEnabled} onChange={e => setting('remindersEnabled', e.target.checked)}/><span>{t('enableReminders')}</span></label><p className="hint">{t('reminderNeedsSetup')}</p><Field label={t('advisorChatId')} hint={t('chatHelp')}><input value={settings.advisorChatId} inputMode="numeric" placeholder={t('chatPlaceholder')} onChange={e => { if (/^-?\d*$/.test(e.target.value)) setting('advisorChatId', e.target.value); }}/></Field><ZoneSelect label={t('timeZone')} hint={t('timeZoneHint')} value={settings.timeZone} onChange={zone => { if (isValidZone(zone)) setting('timeZone', zone); }}/><Notice>{t('telegramLimit')}</Notice></section>
    <section className="card settings-card"><span className="settings-icon"><Leaf size={24}/></span><h2>{t('deviceTitle')}</h2><p>{t('installHint')}</p><p>{t('storageHint')}</p><button className="btn btn-secondary" onClick={async () => { try { setMessage(await navigator.storage?.persist?.() ? 'storageGranted' : 'storageDenied'); } catch { setMessage('storageDenied'); } }}>{t('storagePersist')}</button></section>
    <PracticeCard vault={vault}/>
  </div></>;
}
