import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { taxReport, taxCsv, taxMoney, taxMonthLabel } from '../lib/taxReport';
import { downloadText } from '../lib/files';
import { downloadDocument } from '../lib/documents';
import { runSecureTask } from '../lib/workerTasks';
import type { VaultController } from '../lib/useVault';
import { Notice } from './ui';
export function TaxOverview({vault,year}:{vault:VaultController;year:number}) {
 const {t,language}=useI18n(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<TextKey>();
 const result=useMemo(()=>{if(!open)return{};try{return{report:taxReport(vault.data!,year)};}catch(error){return{error:(error as Error).message==='invoiceWorkflowConflict'?'invoiceWorkflowConflict' as const:'invalidAmount' as const};}},[open,vault.data,year]);const report=result.report;
 const pdf=async()=>{if(!report)return;const key=vault.getKey();setBusy(true);setError(undefined);try{const bytes=await runSecureTask('taxPdf',{report,language});if(vault.getKey()===key && vault.getData())downloadDocument(new Blob([bytes],{type:'application/pdf'}),`Praxisraum-${year}.pdf`);}catch{setError('invoicePdfError');}finally{setBusy(false);}};
 return <details className="card tax-overview" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t('taxTitle')} · {year}</summary>{open&&<div><p>{t('taxDisclaimer')}</p><p className="hint">{t('taxOpenHint')}</p><p className="hint">{t('taxFeeHint')}</p><p className="hint">{t('taxReversalHint')}</p>{(error||result.error)&&<Notice error>{t(error??result.error!)}</Notice>}{report&&<><div className="button-row"><button type="button" className="btn btn-secondary" onClick={()=>downloadText(`Praxisraum-${year}.csv`,taxCsv(report,language),'text/csv;charset=utf-8')}><Download size={17}/>{t('taxExportCsv')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void pdf()}><FileText size={17}/>{t(busy?'working':'taxExportPdf')}</button></div>
 {(['EUR','UAH'] as const).map(currency=><section key={currency} className="tax-currency"><h3>{currency}</h3><div className="table-scroll" tabIndex={0} role="region" aria-label={`${t('taxTitle')} ${year} · ${currency}`}><table><caption className="sr-only">{t('taxTitle')} {year} · {currency}</caption><thead><tr>{(['taxMonth','taxIncome','taxOpen','taxFeePaid','taxFeeOpen'] as const).map(key=><th scope="col" key={key}>{t(key)}</th>)}</tr></thead><tbody>{report.rows.filter(r=>r.currency===currency).map(r=><tr key={r.month}><th scope="row">{taxMonthLabel(year,r.month,language)}</th>{[r.incomeCents,r.openCents,r.cancellationPaidCents,r.cancellationOpenCents].map((n,i)=><td key={i}>{taxMoney(n,language,currency)}</td>)}</tr>)}</tbody><tfoot><tr><th scope="row">{t('taxTotal')}</th>{(()=>{const r=report.totals.find(r=>r.currency===currency)!;return[r.incomeCents,r.openCents,r.cancellationPaidCents,r.cancellationOpenCents].map((n,i)=><td key={i}>{taxMoney(n,language,currency)}</td>);})()}</tr></tfoot></table></div></section>)}</>}</div>}</details>;
}
