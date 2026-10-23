import type { PaymentMethod } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { Field } from './ui';
export function PaymentMethodField({ value, onChange, quick = false }: { value?: PaymentMethod; onChange: (value: PaymentMethod | undefined) => void; quick?: boolean }) {
  const { t } = useI18n();
  return <Field label={t(quick ? 'quickPaymentMethod' : 'paymentMethod')} hint={quick ? t('quickPaymentHint') : undefined}><select value={value ?? ''} onChange={e => onChange(e.target.value === 'cash' || e.target.value === 'transfer' ? e.target.value : undefined)}>
    {!quick && <option value="">{t('paymentUnspecified')}</option>}<option value="cash">{t('paymentCash')}</option><option value="transfer">{t('paymentTransfer')}</option>
  </select></Field>;
}
