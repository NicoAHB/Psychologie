import { useI18n } from '../lib/i18n';
import type { SaveStatus } from '../lib/useSaveStatus';

export function SaveButton({ status, disabled, secondary, onClick }: {
  status: SaveStatus;
  disabled?: boolean;
  secondary?: boolean;
  onClick?: () => void;
}) {
  const { t, language } = useI18n();
  const saved = status.savedAt !== undefined;
  const label = saved
    ? t('savedAtTime').replace('{time}', new Date(status.savedAt!).toLocaleTimeString(
      language === 'de' ? 'de-DE' : 'uk-UA', { hour: '2-digit', minute: '2-digit' }))
    : t(status.saving ? 'saving' : 'save');
  return <><button type={onClick ? 'button' : 'submit'}
    className={`btn ${secondary ? 'btn-secondary' : 'btn-primary'}${saved ? ' btn-save-saved' : ''}`}
    disabled={disabled || status.saving || saved} onClick={onClick}>{label}</button>
    <span className="sr-only" role="status" aria-live="polite">{saved || status.saving ? label : ''}</span></>;
}
