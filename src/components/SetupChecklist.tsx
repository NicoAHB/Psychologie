import { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { setupItems, type SettingsSection } from '../lib/practiceFlow';
import type { BackupState } from '../lib/backupState';
import type { VaultController } from '../lib/useVault';
import { Notice } from './ui';
import { HelpButton } from './HelpButton';
const labels = { practice: 'setupPractice', banks: 'setupBanks', backup: 'setupBackup', cloud: 'setupCloud', reminders: 'setupReminders' } as const;
export function SetupChecklist({ vault, backup, onOpen }: { vault: VaultController; backup?: BackupState | null; onOpen: (section: SettingsSection) => void }) {
  const { t } = useI18n(); const [error, setError] = useState(false); const items = setupItems(vault.data!.settings, backup);
  if (vault.demo || items.every(item => item.done)) return null;
  return <section className="card setup-checklist" aria-labelledby="setup-checklist-title"><div className="section-heading"><div><h2 id="setup-checklist-title">{t('setupTitle')}</h2><p>{t('setupHint')}</p></div><HelpButton topic="setupTitle" text="helpSetup"/></div>
    <ul>{items.map(item => <li key={item.id}><button type="button" className="setup-item" onClick={() => onOpen(item.target)}>{item.done ? <CheckCircle2 size={22} aria-hidden="true"/> : <Circle size={22} aria-hidden="true"/>}<span>{t(labels[item.id])}{item.optional && <small>{t('setupOptional')}</small>}<span className="sr-only"> · {t(item.done ? 'setupDone' : 'setupPending')}</span></span><ArrowRight size={17} aria-hidden="true"/></button>{item.optional && !item.done && <button type="button" className="btn btn-ghost" aria-label={`${t('setupSkip')}: ${t(labels[item.id])}`} onClick={() => { void vault.update(d => { if (item.id === 'cloud') d.settings.skipCloudSetup = true; else d.settings.skipReminderSetup = true; }).catch(() => setError(true)); }}>{t('setupSkip')}</button>}</li>)}</ul>{error && <Notice error>{t('storageError')}</Notice>}
  </section>;
}
