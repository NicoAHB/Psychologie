import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { markBackupProof, readBackupProof, type BackupProof as Proof } from '../lib/setupProof';
import { Modal, Notice } from './ui';
export function BackupProof({ vaultId }: { vaultId?: string }) {
  const { t, language } = useI18n(), [proof, setProof] = useState<Proof>({}), [open, setOpen] = useState(false);
  useEffect(() => { let active = true; setProof({}); const refresh = () => { if (vaultId) void readBackupProof(vaultId).then(p => { if (active) setProof(p); }, () => {}); };
    refresh(); window.addEventListener('praxisraum-backup-proof', refresh); return () => { active = false; window.removeEventListener('praxisraum-backup-proof', refresh); }; }, [vaultId]);
  const at = (value?: number) => value ? <time dateTime={new Date(value).toISOString()}>{new Date(value).toLocaleString(language === 'de' ? 'de-DE' : 'uk-UA')}</time> : t('backupProofNever');
  return <div className="setup-proof backup-proof"><h3>{t('backupProofTitle')}</h3><dl><dt>{t('backupProofChecked')}</dt><dd>{at(proof.checkedAt)}</dd><dt>{t('backupProofRecovered')}</dt><dd>{at(proof.recoveryConfirmedAt)}</dd></dl><p className="hint">{t('backupProofHint')}</p>
    <button type="button" className="btn btn-secondary" disabled={!vaultId} onClick={() => setOpen(true)}>{t('backupRecoveryGuide')}</button>{open && vaultId && <RecoveryCheck vaultId={vaultId} onClose={() => setOpen(false)}/>}</div>;
}
function RecoveryCheck({ vaultId, onClose }: { vaultId: string; onClose: () => void }) {
  const { t } = useI18n(), [checks, setChecks] = useState([false, false, false]), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const confirm = async () => { if (!checks.every(Boolean) || busy) return; setBusy(true); setError(false);
    try { await markBackupProof(vaultId, 'recovery'); onClose(); } catch { setError(true); setBusy(false); } };
  return <Modal title={t('backupRecoveryGuide')} onClose={() => { if (!busy) onClose(); }}><p>{t('backupRecoveryIntro')}</p><ol className="backup-instructions">{(['backupRecoveryStep1','backupRecoveryStep2','backupRecoveryStep3','backupRecoveryStep4'] as const).map(key => <li key={key}>{t(key)}</li>)}</ol><Notice>{t('backupRecoverySafety')}</Notice>
    {(['backupRecoveryDevice','backupRecoveryImported','backupRecoveryFiles'] as const).map((key, index) => <label key={key} className="check-label"><input type="checkbox" checked={checks[index]} disabled={busy} onChange={e => { const checked = e.target.checked; setChecks(values => values.map((v, i) => i === index ? checked : v)); }}/><span>{t(key)}</span></label>)}
    {error && <Notice error>{t('storageError')}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button><button type="button" className="btn btn-primary" disabled={busy || !checks.every(Boolean)} onClick={() => void confirm()}>{t(busy ? 'saving' : 'backupRecoveryConfirm')}</button></div></Modal>;
}
