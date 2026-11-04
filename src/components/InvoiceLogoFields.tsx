import { useEffect, useId, useRef, useState } from 'react';
import { useI18n, type TextKey } from '../lib/i18n';
import type { InvoiceLogo } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { readInvoicePng, type PendingInvoiceLogo } from '../lib/invoiceLogo';
import { useInvoiceLogo } from '../lib/useInvoiceLogo';
import { Field, Notice } from './ui';

export function InvoiceLogoFields({ vault, value, pending, disabled, onChange, onUpload, onBusy }: {
  vault: VaultController; value: InvoiceLogo; pending?: PendingInvoiceLogo; disabled: boolean;
  onChange: (value: InvoiceLogo) => void; onUpload: (value?: PendingInvoiceLogo) => void; onBusy: (value: boolean) => void;
}) {
  const { t } = useI18n(); const titleId = useId(); const image = useInvoiceLogo(vault, value, pending);
  const [error, setError] = useState<TextKey>(); const [reading, setReading] = useState(false);
  const generation = useRef(0); useEffect(() => () => { generation.current++; }, []);
  const custom = pending || value.source === 'custom';
  async function upload(file?: File) {
    if (!file || disabled || reading) return;
    const current = ++generation.current; setReading(true); onBusy(true); setError(undefined);
    try { const candidate = await readInvoicePng(file); if (current === generation.current) { onChange({ ...value, enabled: true }); onUpload(candidate); } }
    catch (e) { if (current === generation.current) setError(e instanceof Error && ['invoiceLogoInvalid','invoiceLogoTooLarge','invoiceLogoDimensions'].includes(e.message) ? e.message as TextKey : 'invoiceLogoInvalid'); }
    finally { if (current === generation.current) { setReading(false); onBusy(false); } }
  }
  return <div className="invoice-logo-settings form-section" role="group" aria-labelledby={titleId}>
    <h3 id={titleId}>{t('invoiceLogoTitle')}</h3><p className="hint">{t('invoiceLogoHint')}</p>
    <label className="check-label"><input type="checkbox" checked={value.enabled} disabled={disabled || reading} onChange={e => onChange({ ...value, enabled: e.target.checked })}/><span>{t('invoiceLogoEnabled')}</span></label>
    <p className="hint" role="status">{t(custom ? 'invoiceLogoCustom' : 'invoiceLogoDefault')}{custom && ` · ${pending?.fileName ?? (value.source === 'custom' ? value.file.fileName : '')}`}</p>
    {value.enabled && image.url && <div className={`invoice-logo-display ${custom ? 'invoice-logo-custom' : 'invoice-logo-nadiia'}`}><img src={image.url} alt={t('invoiceLogoPreview')}/></div>}
    {image.loading && <p role="status" className="hint">{t('imageLoading')}</p>}
    {image.error && <Notice error>{t('invoiceLogoReadError')}</Notice>}
    <Field label={t('invoiceLogoUpload')} hint={t('invoiceLogoUploadHint')}><input type="file" accept="image/png,.png" disabled={disabled || reading} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }}/></Field>
    {reading && <p role="status">{t('working')}</p>}
    {custom && <button type="button" className="btn btn-secondary" disabled={disabled || reading} onClick={() => { onUpload(undefined); onChange({ enabled: value.enabled, source: 'nadiia' }); setError(undefined); }}>{t('invoiceLogoReset')}</button>}
    {error && <Notice error>{t(error)}</Notice>}
  </div>;
}
