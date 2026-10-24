import { useI18n } from '../lib/i18n';
import { invoiceChecks, type InvoiceCheckSource } from '../lib/invoiceChecks';

export function InvoiceChecks({ source, issued = false, onFix }: {
  source: InvoiceCheckSource; issued?: boolean; onFix: (target: 'client' | 'practice' | 'banks') => void;
}) {
  const { t } = useI18n(), { issues, account, currency } = invoiceChecks(source);
  return <section className="invoice-preflight" aria-label={t('invoiceCheckTitle')}><h3>{t('invoiceCheckTitle')}</h3>
    <p>{t('invoiceCheckCurrency')}: <strong>{currency}</strong></p>
    <p>{t('invoiceCheckAccount')}: <strong>{account.bank || t(currency === 'UAH' ? 'bankUkraine' : 'bankGermany')}</strong>{account.iban && <span className="invoice-check-iban">{account.iban}</span>}{account.holder && <small>{account.holder}</small>}</p>
    {issues.length ? <><ul>{issues.map(issue => <li key={issue}>{t(`invoiceCheck_${issue}`)}</li>)}</ul><p className="hint">{t(issued ? 'invoiceCheckIssuedHint' : 'invoiceCheckHint')}</p>
      <div className="button-row">{issued ? <button type="button" className="btn btn-secondary" onClick={() => onFix('practice')}>{t('invoiceCheckCorrect')}</button> : <>
        {issues.some(i => i.startsWith('recipient')) && <button type="button" className="btn btn-secondary" onClick={() => onFix('client')}>{t('invoiceCheckEditClient')}</button>}
        {issues.some(i => i.startsWith('practice')) && <button type="button" className="btn btn-secondary" onClick={() => onFix('practice')}>{t('invoiceCheckEditPractice')}</button>}
        {issues.includes('bank') && <button type="button" className="btn btn-secondary" onClick={() => onFix('banks')}>{t('invoiceCheckEditBank')}</button>}
      </>}</div></> : <p className="hint">{t('invoiceCheckComplete')}</p>}
  </section>;
}
