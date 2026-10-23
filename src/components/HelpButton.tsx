import { useState } from 'react';
import { Info } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { Modal } from './ui';

/** Native button + existing modal: usable by touch, keyboard and screen reader. */
export function HelpButton({ topic, text }: { topic: TextKey; text: TextKey }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false);
  const title = t('helpAbout').replace('{topic}', t(topic));
  return <><button type="button" className="icon-btn help-button" aria-label={title} title={title} onClick={() => setOpen(true)}><Info size={18} aria-hidden="true"/></button>{open && <Modal title={title} onClose={() => setOpen(false)}><p className="plain-help">{t(text)}</p><div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>{t('close')}</button></div></Modal>}</>;
}
