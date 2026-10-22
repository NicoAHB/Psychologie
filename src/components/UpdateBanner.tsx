import { useI18n } from '../lib/i18n';
import { usePendingUpdate } from '../lib/updates';
import { Notice } from './ui';

/** Offers a waiting service-worker build; `beforeApply` lets the open vault finish saving first. */
export function UpdateBanner({ beforeApply }: { beforeApply?: () => Promise<unknown> }) {
  const { t } = useI18n(); const update = usePendingUpdate();
  if (!update) return null;
  return <Notice><span>{t('updateAvailable')} <small>{t('updateHint')}</small></span><button className="text-link" onClick={() => { void (beforeApply?.() ?? Promise.resolve()).catch(() => {}).finally(() => update.apply()); }}>{t('updateApply')}</button></Notice>;
}
