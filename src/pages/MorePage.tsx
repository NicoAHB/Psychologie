import { ChevronRight } from 'lucide-react';
import { moreNavigation, type AppRoute } from '../lib/navigation';
import { useI18n } from '../lib/i18n';
import { PageHeading } from '../components/ui';
export function MorePage({ navigate }: { navigate: (route: AppRoute) => void }) {
  const { t } = useI18n();
  return <><PageHeading title={t('more')} subtitle={t('moreSubtitle')}/><nav className="more-navigation" aria-label={t('more')}>{moreNavigation.map(item => <button key={item.id} className="card more-item" aria-label={t(item.id)} aria-describedby={`more-${item.id}-hint`} onClick={() => navigate(item.id)}><item.icon size={24}/><span><strong>{t(item.id)}</strong><small id={`more-${item.id}-hint`}>{t(item.description)}</small></span><ChevronRight size={20}/></button>)}</nav></>;
}
