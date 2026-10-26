import { lazy, Suspense, useState } from 'react';
import { Gift } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { Client } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import '../referrals.css';
const ReferralCardDialog = lazy(() => import('./ReferralCardDialog').then(m => ({ default: m.ReferralCardDialog })));
export function ReferralCardButton({ vault, client }: { vault: VaultController; client: Client }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(true)}><Gift size={16}/>{t('referralCard')}</button>{open && <Suspense fallback={<p role="status">{t('working')}</p>}><ReferralCardDialog vault={vault} client={client} onClose={() => setOpen(false)}/></Suspense>}</>;
}
