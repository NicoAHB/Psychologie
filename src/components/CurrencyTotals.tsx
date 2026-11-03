import { useI18n } from '../lib/i18n';
import { money } from '../lib/dates';
import type { Currency } from '../lib/types';
export function CurrencyTotals({ values }: { values: Record<Currency, number> }) {
  const { language } = useI18n();
  return <span className="currency-totals">{(['EUR','UAH'] as const).map(currency => <span key={currency}><small>{currency}</small><strong>{money(values[currency], language, currency)}</strong></span>)}</span>;
}
