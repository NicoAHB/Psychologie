import { useState } from 'react';
import { useI18n, type TextKey } from '../lib/i18n';
import { backupSecretsConfirmed, backupGuideReady } from '../lib/backupGuide';
import { saveBackupCopy, BackupVerifyDialog } from './backup';
import { SecurityDialog } from './security';
import type { VaultController } from '../lib/useVault';
import { Modal, Notice } from './ui';
/** Uses existing encrypted export/recovery/verification paths; never writes a plaintext copy or passphrase. */
export function BackupAssistant({vault,onClose}:{vault:VaultController;onClose:()=>void}) {
 const {t}=useI18n();const [step,setStep]=useState(0),[passphrase,setPassphrase]=useState(false),[recovery,setRecovery]=useState(false),[copy,setCopy]=useState(false),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[subview,setSubview]=useState<'recovery'|'verify'>(),[error,setError]=useState<TextKey>();
 const hasRecovery=!!vault.envelope?.wraps?.recovery;
 const acknowledged=backupSecretsConfirmed(hasRecovery,passphrase,recovery);
 const canShare=typeof navigator.canShare==='function';
 if(subview==='recovery')return <SecurityDialog vault={vault} mode="recovery" onClose={()=>{setSubview(undefined);setRecovery(false);}}/>;
 if(subview==='verify')return <BackupVerifyDialog expectedVaultId={vault.envelope?.vaultId} onClose={()=>setSubview(undefined)} onVerified={()=>{setVerified(true);}}/>;
 const save=async(share:boolean)=>{setBusy(true);setError(undefined);try{const result=await saveBackupCopy(vault,share);if(result){setCopy(true);setVerified(false);setStep(2);}}catch(err){if((err as Error).name!=='AbortError')setError('backupGuideSaveError');}finally{setBusy(false);}};
 const next=async()=>{if(!acknowledged)return;setBusy(true);try{await vault.update(d=>{d.settings.backupSafetyConfirmedAt=new Date().toISOString();});setStep(1);}catch{setError('storageError');}finally{setBusy(false);}};
 return <Modal title={t('backupAssistant')} onClose={()=>{if(!busy)onClose();}}><p className="hint" aria-live="polite">{t('backupGuideStep').replace('{n}',String(step+1))}</p>
 {step===0&&<><h3>{t('backupGuideSecrets')}</h3><p>{t('backupGuideSecretsHint')}</p>{!hasRecovery&&<Notice>{t('backupGuideMissingKey')}<button type="button" className="btn btn-secondary" onClick={()=>setSubview('recovery')}>{t('recoveryCreate')}</button></Notice>}
 <label className="check-label"><input type="checkbox" checked={passphrase} onChange={e=>setPassphrase(e.target.checked)}/><span>{t('backupGuidePassphraseWritten')}</span></label><label className="check-label"><input type="checkbox" checked={recovery} disabled={!hasRecovery} onChange={e=>setRecovery(e.target.checked)}/><span>{t('backupGuideRecoveryWritten')}</span></label>
 <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button><button type="button" className="btn btn-primary" disabled={!acknowledged||busy} onClick={()=>void next()}>{t('backupGuideNext')}</button></div></>}
 {step===1&&<><h3>{t('backupGuideCopy')}</h3><ol className="backup-instructions"><li>{t('backupGuideIpadShare')}</li><li>{t('backupGuideIpadFiles')}</li><li>{t('backupGuideIpadLocation')}</li></ol><p>{t('backupGuideShareFallback')}</p><p className="hint">{t('backupGuideExternal')}</p><div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>setStep(0)}>{t('backupGuideBack')}</button>{canShare&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void save(false)}>{t('exportBackup')}</button>}<button type="button" className="btn btn-primary" disabled={busy||vault.demo} onClick={()=>void save(canShare)}>{t(busy?'working':canShare?'shareBackup':'exportBackup')}</button></div></>}
 {step===2&&<><h3>{t('backupGuideTest')}</h3><p>{t('backupGuideTestHint')}</p><p className="hint">{t('backupGuideVerifyExternal')}</p>{verified&&<Notice>{t('backupGuideTested')}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" onClick={()=>setStep(1)}>{t('backupGuideBack')}</button><button type="button" className="btn btn-secondary" onClick={()=>setSubview('verify')}>{t('backupVerify')}</button><button type="button" className="btn btn-primary" disabled={!backupGuideReady(acknowledged,copy,verified)} onClick={()=>setStep(3)}>{t('backupGuideFinish')}</button></div></>}
 {step===3&&<><h3>{t('backupGuideDone')}</h3><p>{t('backupGuideRepeat')}</p><div className="form-actions"><button type="button" className="btn btn-primary" onClick={onClose}>{t('close')}</button></div></>}
 {error&&<Notice error>{t(error)}</Notice>}
 </Modal>;
}
