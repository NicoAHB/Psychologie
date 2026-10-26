import { Info } from 'lucide-react';
import { appBuild } from '../lib/buildInfo';
import { useI18n } from '../lib/i18n';
export function AppVersion() {
  const { t, language } = useI18n();
  const date = Number.isFinite(Date.parse(appBuild.sourceDate)) ? new Date(appBuild.sourceDate) : undefined;
  return <section className="card settings-card app-version" aria-label={t('appVersionTitle')}><span className="settings-icon"><Info size={24}/></span><h2>{t('appVersionTitle')}</h2>
    <dl><dt>{t('appVersionNumber')}</dt><dd>{appBuild.version}</dd><dt>{t('appVersionRevision')}</dt><dd><code>{appBuild.revision.slice(0, 12) || t('appVersionUnknown')}</code></dd>
      {date && <><dt>{t('appVersionSourceDate')}</dt><dd><time dateTime={appBuild.sourceDate}>{date.toLocaleString(language === 'de' ? 'de-DE' : 'uk-UA')}</time></dd></>}</dl>
    <p className="hint">{t(appBuild.modified ? 'appVersionLocal' : 'appVersionHint')}</p></section>;
}
