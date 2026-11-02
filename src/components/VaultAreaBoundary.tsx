import { Component, useState, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { flushBeforeLock, stopMemoMedia } from '../lib/autoLock';
import type { VaultController } from '../lib/useVault';
import { Notice } from './ui';

export class AreaBoundary extends Component<{ children: ReactNode; resetKey: string; fallback: (retry: () => void) => ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { stopMemoMedia(); }
  componentDidUpdate(previous: Readonly<typeof this.props>) { if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children; }
}
function RecoveryPanel({ vault, retry }: { vault: VaultController; retry: () => void }) {
  const { t } = useI18n(), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [saved, setSaved] = useState(false);
  const recover = async () => {
    if (busy) return; setBusy(true); setFailed(false); setSaved(false);
    try { await flushBeforeLock(); if (vault.writeConflict) await vault.mergeLocal(); else await vault.retry(); await vault.flush(); setSaved(true); retry(); }
    catch { setFailed(true); } finally { setBusy(false); }
  };
  return <section className="card area-recovery" aria-live="polite" aria-label={t('areaErrorTitle')}><h2>{t('areaErrorTitle')}</h2><p>{t('areaErrorText')}</p><p className="hint">{t('areaErrorSaveHint')}</p>{failed && <Notice error>{t(vault.writeConflict ? 'vaultChanged' : 'areaErrorUnsaved')}</Notice>}{saved && <p role="status">{t('saved')}</p>}<button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void recover()}>{t(busy ? 'saving' : 'areaErrorRetry')}</button></section>;
}
/** Lives below App/useVault: rendering failures cannot unmount its key or write queue. */
export function VaultAreaBoundary({ vault, resetKey, children }: { vault: VaultController; resetKey: string; children: ReactNode }) {
  return <AreaBoundary resetKey={resetKey} fallback={retry => <RecoveryPanel vault={vault} retry={retry}/>}>{children}</AreaBoundary>;
}
