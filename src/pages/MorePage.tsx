import { ChevronRight } from 'lucide-react';
import { moreNavigation, moreNavigationGroups, type AppRoute } from '../lib/navigation';
import { useI18n } from '../lib/i18n';
import { PageHeading } from '../components/ui';
export function MorePage({ navigate }: { navigate: (route: AppRoute) => void }) {
  const { t } = useI18n();
  return <><PageHeading title={t('more')} subtitle={t('moreSubtitle')}/>
    <nav className="more-navigation" aria-label={t('more')}>{moreNavigationGroups.map(group => <section className="more-group" key={group.id} aria-labelledby={`more-group-${group.id}`}>
      <h2 id={`more-group-${group.id}`}>{t(group.title)}</h2><p className="hint">{t(group.hint)}</p>
      <div className="more-group-items">{moreNavigation.filter(item => item.group === group.id).map(item => <button type="button" key={item.id} className="card more-item" aria-label={t(item.id)} aria-describedby={`more-${item.id}-hint`} onClick={() => navigate(item.id)}><item.icon size={24}/><span><strong>{t(item.id)}</strong><small id={`more-${item.id}-hint`}>{t(item.description)}</small></span><ChevronRight size={20}/></button>)}</div>
    </section>)}</nav>
  </>;
}
