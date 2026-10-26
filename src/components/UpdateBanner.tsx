import { useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { usePendingUpdate } from '../lib/updates';
import { UpdateGuard } from '../lib/updateGuard';
import { Notice } from './ui';

/** Offers a waiting service-worker build; `beforeApply` lets the open vault finish saving first. */
export function UpdateBanner({ beforeApply }: { beforeApply?: () => Promise<unknown> }) {
  const { t } = useI18n(); const update = usePendingUpdate();
  const guard = useMemo(() => new UpdateGuard(), [update]);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  if (!update) return null;
  const apply = async () => {
    setBusy(true); setFailed(false);
    try { await guard.run(beforeApply ?? (() => Promise.resolve()), update.apply); }
    catch { setFailed(true); setBusy(false); }
  };
  return <><Notice><span>{t('updateAvailable')} <small>{t('updateHint')}</small></span><button type="button" className="text-link" disabled={busy} onClick={() => void apply()}>{t(busy ? 'updateSaving' : 'updateApply')}</button><span className="sr-only" role="status">{busy ? t('updateSaving') : ''}</span></Notice>{failed && <Notice error>{t('updateSaveFailed')}</Notice>}</>;
}
