import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, RefreshCw } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { dateLabel, money, parseMoney, today } from '../lib/dates';
import { billAmount, convertWhole, fetchNbuRate, parseRate, rateText, validRate } from '../lib/currency';
import type { Billing, Currency, ExchangeRate } from '../lib/types';
import { Field, Notice } from './ui';

export function ExchangeRateField({ value, onChange, auto = true }: { value?: ExchangeRate; onChange: (rate?: ExchangeRate) => void; auto?: boolean }) {
  const { t, language } = useI18n();
  const [text, setText] = useState(rateText(value)); const [date, setDate] = useState(value?.date ?? today());
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const callback = useRef(onChange); callback.current = onChange;
  const edits = useRef(0); const latest = useRef(value); latest.current = value;
  const load = async (active: () => boolean = () => true) => {
    const editVersion = edits.current;
    setBusy(true); setFailed(false);
    try {
      const rate = await fetchNbuRate();
      if (active() && edits.current === editVersion) { setText(rateText(rate)); setDate(rate.date); callback.current(rate); }
    } catch { if (active()) setFailed(true); }
    finally { if (active()) setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    if (auto && (!latest.current || latest.current.source === 'nbu' && latest.current.date !== today())) void load(() => active);
    return () => { active = false; };
  }, [auto]);
  function manual(nextText: string, nextDate: string) {
    edits.current++; setText(nextText); setDate(nextDate); setFailed(false);
    try { const rate: ExchangeRate = { micros: parseRate(nextText), date: nextDate, source: 'manual' }; callback.current(validRate(rate) ? rate : undefined); }
    catch { callback.current(undefined); }
  }
  return <div className="exchange-rate"><div className="form-grid"><Field label={t('exchangeRate')} hint={t('exchangeRateUnits')}><input inputMode="decimal" value={text} maxLength={14} placeholder="48,1234" onChange={e => manual(e.target.value, date)}/></Field><Field label={t('exchangeRateDate')}><input type="date" value={date} max={today()} onChange={e => manual(text, e.target.value)}/></Field></div>
    <div className="exchange-rate-source"><button className="text-link" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={14} className={busy ? 'spin' : ''}/>{t(busy ? 'rateLoading' : 'loadOfficialRate')}</button>{value && <span className="hint">{t(value.source === 'nbu' ? 'rateSourceNbu' : 'rateSourceManual')} · {dateLabel(value.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}</div>
    {text && !value && <p className="field-error" role="alert">{t('invalidRate')}</p>}
    {failed && <Notice>{t('rateLoadFailed')}</Notice>}
    {value && value.date !== today() && <p className="hint">{t('rateOlder')}</p>}
  </div>;
}
export function FeeInput({ value, onChange, inputCurrency, onCurrency, currency, rate, onRate, auto = true }: {
  value: string; onChange: (value: string) => void; inputCurrency: Currency; onCurrency: (currency: Currency) => void;
  currency: Currency; rate?: ExchangeRate; onRate: (rate?: ExchangeRate) => void; auto?: boolean;
}) {
  const { t, language } = useI18n(); let preview: { feeCents: number; billing: Billing } | undefined;
  try { preview = billAmount(parseMoney(value), inputCurrency, currency, rate); } catch { /* Show a preview only for complete, valid input. */ }
  return <div className="fee-input">
    {currency === 'UAH' && <Field label={t('amountEnteredIn')}><select value={inputCurrency} onChange={e => { const next = e.target.value as Currency; try { onChange(String(convertWhole(parseMoney(value), inputCurrency, next, rate) / 100)); } catch { onChange(''); } onCurrency(next); }}><option value="EUR">{t('currencyEur')}</option><option value="UAH">{t('currencyUah')}</option></select></Field>}
    <Field label={currency === 'EUR' || inputCurrency === 'EUR' ? t('fee') : t('feeUah')} hint={t('wholeAmountsHint')}><input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={value} onChange={e => onChange(e.target.value)}/></Field>
    {currency === 'UAH' && <><ExchangeRateField value={rate} onChange={onRate} auto={auto}/>{preview && <div className="currency-preview" aria-live="polite"><ArrowDownUp size={18}/><div><span>{t('payableAmount')}</span><strong>{money(preview.billing.amountCents, language, 'UAH')}</strong><small>≈ {money(preview.feeCents, language)} · {t('euroComparisonOnly')}</small></div></div>}<p className="hint">{t('rateFixedHint')}</p></>}
  </div>;
}
export function BillingMoney({ feeCents, billing }: { feeCents: number; billing?: Billing }) {
  const { language, t } = useI18n();
  return billing?.currency === 'UAH'
    ? <span className="billing-money"><strong>{money(billing.amountCents, language, 'UAH')}</strong><small title={t('euroComparisonOnly')}>≈ {money(feeCents, language)}</small></span>
    : <span>{money(feeCents, language)}</span>;
}
