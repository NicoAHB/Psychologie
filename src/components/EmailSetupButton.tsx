import { lazy, Suspense, useState } from 'react';
import { Mail } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { Modal } from './ui';
const EmailSetupCard = lazy(() => import('./EmailSetupCard').then(m => ({ default: m.EmailSetupCard })));
export function EmailSetupButton({ demo = false }: { demo?: boolean }) {
  const { t } = useI18n(), [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}><Mail size={17}/>{t('emailSetupOpen')}</button>{open && <Modal title={t('emailSetupTitle')} onClose={() => setOpen(false)}><Suspense fallback={<p role="status">{t('working')}</p>}><EmailSetupCard demo={demo} embedded/></Suspense></Modal>}</>;
}
