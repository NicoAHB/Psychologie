import { findSettings, settingsCards, settingsGroups, settingsGroupLabels, settingsGroupFor, type SettingsGroup, type SettingsCardId } from '../lib/settingsIndex';
import { StorageHealthCard } from '../components/StorageHealth';
import { PracticeCard } from '../components/PracticeCard';
import type { SettingsSection } from '../lib/practiceFlow';
import { MemoLabelsCard } from '../components/MemoLabelsCard';
import { parseMoney } from '../lib/dates';
import { feeText } from '../lib/records';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Cloud, FileText, Trash2 } from 'lucide-react';
import { uid } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { isValidZone } from '../lib/zones';
import type { VaultController } from '../lib/useVault';
import { Field, Notice, PageHeading } from '../components/ui';
import { CloudAuth } from '../components/CloudAuth';
import { SecurityCard } from '../components/security';
import { BackupCard, HistoryCard } from '../components/backup';
import type { AutoBackup } from '../lib/useAutoBackup';
import { ZoneSelect } from '../components/ZoneSelect';
import { AppearanceCard } from '../components/AppearanceCard';
import { SaveButton } from '../components/SaveButton';
import { useSaveStatus } from '../lib/useSaveStatus';
import { EmailSetupCard } from '../components/EmailSetupCard';
import { AppVersion } from '../components/AppVersion';

function TemplatesCard({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const [name, setName] = useState(''); const [body, setBody] = useState(''); const list = vault.data!.templates;
  return <section className="card settings-card"><span className="settings-icon"><FileText size={24}/></span><h2>{t('templates')}</h2><p>{t('templatesText')}</p>
    {list.length > 0 && <ul className="passkey-list">{list.map(x => <li key={x.id}><span>{x.name}</span><button className="icon-btn danger" aria-label={`${t('templateDelete')}: ${x.name}`} title={t('templateDelete')} onClick={() => { void vault.update(d => { d.templates = d.templates.filter(y => y.id !== x.id); }).catch(() => {}); }}><Trash2 size={16}/></button></li>)}</ul>}
    <Field label={t('templateName')}><input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></Field>
    <Field label={t('templateBody')}><textarea rows={4} value={body} maxLength={4000} onChange={e => setBody(e.target.value)}/></Field>
    <button className="btn btn-secondary" disabled={vault.demo || !name.trim() || !body.trim()} onClick={() => { void vault.update(d => { d.templates.push({ id: uid(), name: name.trim(), body }); }).then(() => { setName(''); setBody(''); }).catch(() => {}); }}>{t('templateAdd')}</button></section>;
}


export function SettingsPage({ vault, auto, onSync, syncing, onRestore, focus, focusRequest = 0 }: { focusRequest?: number; focus?: SettingsSection; vault: VaultController; auto: AutoBackup; onSync: () => Promise<void>; syncing: boolean; onRestore: () => Promise<void> }) {
  const { t, language } = useI18n(); const settings = vault.data!.settings;
  const [group,setGroup] = useState<SettingsGroup>(focus?settingsGroupFor(focus):'practice'), [query,setQuery] = useState('');
  const pendingFocus = useRef<SettingsSection|undefined>(focus);
  useEffect(()=>{if(focus){pendingFocus.current=focus;setGroup(settingsGroupFor(focus));setQuery('');}},[focus,focusRequest]);
  useEffect(()=>{if(pendingFocus.current&&!query&&(group==='all'||group===settingsGroupFor(pendingFocus.current))){const node=document.getElementById(`settings-${pendingFocus.current}`);if(node){node.focus();node.scrollIntoView({block:'start'});pendingFocus.current=undefined;}}},[focus,focusRequest,group,query]);
  const [defaultFee, setDefaultFee] = useState(feeText(settings.defaultCancellationFeeCents ?? 0));
  const feeSaveStatus = useSaveStatus();
  const setting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => { void vault.update(d => { d.settings[key] = value; }).catch(() => {}); };
  const cards:Record<SettingsCardId,ReactNode> = {
    cloud: <section id="settings-cloud" tabIndex={-1} className="card settings-card"><span className="settings-icon tone-blue"><Cloud size={24}/></span><h2>{t('cloudTitle')}</h2><p>{t('cloudText')}</p>{vault.demo ? <Notice>{t('demoNotice')}</Notice> : <CloudAuth><label className="check-label"><input type="checkbox" checked={settings.autoSync} onChange={e => setting('autoSync', e.target.checked)}/><span>{t('autoSync')}</span></label><p className="hint">{t('autoSyncHint')}</p><div className="button-row"><button className="btn btn-primary" disabled={syncing} onClick={() => void onSync()}><Cloud size={17}/>{t(syncing ? 'syncing' : 'sync')}</button><button className="btn btn-secondary" disabled={syncing} onClick={() => void onRestore()}>{t('loadCloud')}</button></div><p className="hint">{t('cloudRestoreHint')}</p></CloudAuth>}<p className="hint">{t('freeTierNote')}</p></section>,
    reminders: <section id="settings-reminders" tabIndex={-1} className="card settings-card"><span className="settings-icon tone-beige"><CalendarDays size={24}/></span><h2>{t('remindersTitle')}</h2><p>{t('remindersText')}</p><label className="check-label"><input type="checkbox" checked={!!settings.autoEmailReminders} disabled={vault.demo} onChange={e => setting('autoEmailReminders',e.target.checked)}/><span>{t('autoEmailReminders')}</span></label><p className="hint">{t('autoEmailRemindersHint')}</p><label className="check-label"><input type="checkbox" disabled={vault.demo} checked={settings.remindersEnabled} onChange={e => setting('remindersEnabled', e.target.checked)}/><span>{t('enableReminders')}</span></label><p className="hint">{t('reminderNeedsSetup')}</p><Field label={t('advisorChatId')} hint={t('chatHelp')}><input value={settings.advisorChatId} inputMode="numeric" placeholder={t('chatPlaceholder')} onChange={e => { if (/^-?\d*$/.test(e.target.value)) setting('advisorChatId', e.target.value); }}/></Field><ZoneSelect label={t('timeZone')} hint={t('timeZoneHint')} value={settings.timeZone} onChange={zone => { if (isValidZone(zone)) setting('timeZone', zone); }}/><Notice>{t('telegramLimit')}</Notice></section>,
    fees: <section className="card settings-card"><h2>{t('cancellationFeeSettings')}</h2><Field label={t('defaultCancellationFee')} hint={t('defaultCancellationFeeHint')}><input inputMode="numeric" value={defaultFee} maxLength={6} onChange={e => { setDefaultFee(e.target.value); feeSaveStatus.changed(); }}/></Field><SaveButton secondary status={feeSaveStatus} disabled={vault.demo || !/^\d{1,6}$/.test(defaultFee)} onClick={() => { void feeSaveStatus.save(() => vault.update(d => { d.settings.defaultCancellationFeeCents = parseMoney(defaultFee); })).catch(() => {}); }}/>{feeSaveStatus.failed && <Notice error>{t('storageError')}</Notice>}</section>,
    appearance: <AppearanceCard/>,
    version: <AppVersion/>,
    email: <EmailSetupCard demo={vault.demo}/>,
    backup: <BackupCard vault={vault} auto={auto}/>,
    storage: <StorageHealthCard/>,
    security: <SecurityCard vault={vault}/>,
    history: <HistoryCard vault={vault}/>,
    templates: <TemplatesCard vault={vault}/>,
    memoLabels: <MemoLabelsCard vault={vault}/>,
    practice: <PracticeCard vault={vault}/>
  };
  const found=findSettings(query,language,group), ids=new Set(found.map(card=>card.id));
  const advanced=group==='data'&&!query.trim();
  const entry=(id:SettingsCardId)=> <div key={id} className="settings-entry" data-settings-card={id} hidden={!ids.has(id)}>{cards[id]}</div>;
  return <><PageHeading title={t('settingsTitle')} subtitle={t('settingsSubtitle')}/>
    <section className="card settings-navigation"><label className="field"><span>{t('settingsSearch')}</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('settingsSearchPlaceholder')}/></label>
      <nav className="settings-groups" aria-label={t('settingsGroups')}>{[...settingsGroups,'all' as const].map(value=><button type="button" key={value} className="btn btn-secondary" aria-pressed={group===value&&!query} onClick={()=>{pendingFocus.current=undefined;setGroup(value);setQuery('');}}>{t(settingsGroupLabels[value])}</button>)}</nav>
      {query&&<p role="status">{t('settingsResults').replace('{n}',String(found.length))}</p>}
    </section>
    {!found.length&&<p className="card">{t('noResults')}</p>}
    <div className="settings-grid">{settingsCards.filter(card=>!advanced||!['history','version'].includes(card.id)).map(card=>entry(card.id))}
      {advanced&&<details className="card calm-details settings-wide"><summary>{t('settingsAdvanced')}</summary><div className="settings-grid details-body">{entry('history')}{entry('version')}</div></details>}
    </div>
  </>;
}
