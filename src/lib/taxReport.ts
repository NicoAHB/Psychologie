import { isIsoDay, localeFor, today } from './dates';
import { isSessionVoided, billingConflicts } from './invoice';
import { syncConflicts } from './crdt';
import { translate } from './i18n';
import type { Currency, Language, VaultData } from './types';
export interface TaxMonth { month: number; currency: Currency; incomeCents: number; openCents: number; cancellationPaidCents: number; cancellationOpenCents: number }
export interface TaxReport { year: number; asOf: string; rows: TaxMonth[]; totals: Omit<TaxMonth,'month'>[]; paidVoidedCount: number }
const columns = ['incomeCents','openCents','cancellationPaidCents','cancellationOpenCents'] as const;
export const taxMoney = (cents: number, language: Language, currency: Currency) => new Intl.NumberFormat(localeFor(language),{style:'currency',currency,minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);
/** Receipt-date overview, native currencies only. Open charges are a CURRENT balance by appointment month. */
export function taxReport(data: VaultData, year: number, asOf = today()): TaxReport {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !isIsoDay(asOf)) throw new Error('required');
  if (billingConflicts(data).length || syncConflicts(data).some(c=>c.collection==='sessions' && ['$amount','paidAt','invoiceId','date','$exists'].includes(c.field) || c.collection==='invoices')) throw new Error('invoiceWorkflowConflict');
  const rows:TaxMonth[] = (['EUR','UAH'] as const).flatMap(currency=>Array.from({length:12},(_,i)=>({month:i+1,currency,incomeCents:0,openCents:0,cancellationPaidCents:0,cancellationOpenCents:0})));
  let paidVoidedCount=0;
  for(const s of data.sessions) {
    const currency = s.billing?.currency ?? 'EUR', amount = s.billing?.amountCents ?? s.feeCents;
    if(!['EUR','UAH'].includes(currency) || !Number.isSafeInteger(amount) || amount<0) throw new Error('invalidAmount');
    const receipt = !!s.paidAt && s.paidAt <= asOf && s.paidAt.startsWith(`${year}-`);
    const open = !s.paidAt && s.date.startsWith(`${year}-`) && !isSessionVoided(data,s);
    if(!receipt && !open)continue;
    const day=receipt?s.paidAt!:s.date;if(!isIsoDay(day))throw new Error('required');
    const row=rows.find(r=>r.currency===currency && r.month===Number(day.slice(5,7)))!;
    if(receipt) { row.incomeCents+=amount; if(s.kind==='cancellationFee')row.cancellationPaidCents+=amount; if(isSessionVoided(data,s))paidVoidedCount++; }
    if(open) { row.openCents+=amount; if(s.kind==='cancellationFee')row.cancellationOpenCents+=amount; }
  }
  const totals = (['EUR','UAH'] as const).map(currency=>({ currency,...Object.fromEntries(columns.map(key=>[key,rows.filter(r=>r.currency===currency).reduce((n,r)=>n+r[key],0)])) } as Omit<TaxMonth,'month'>));
  if([...rows,...totals].some(row=>columns.some(key=>!Number.isSafeInteger(row[key]))))throw new Error('invalidAmount');
  return {year,asOf,rows,totals,paidVoidedCount};
}
export function taxMonthLabel(year:number,month:number,language:Language) { return new Intl.DateTimeFormat(localeFor(language),{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1))); }
const cell=(value:string)=>`"${(/^[=+\-@\t\r]/.test(value)?"'":'')+value.replaceAll('"','""')}"`;
export function taxCsv(report:TaxReport,language:Language) {
 const T=(key:Parameters<typeof translate>[1])=>translate(language,key);
 const heads=['taxYear','taxMonth','taxCurrency','taxIncome','taxOpen','taxFeePaid','taxFeeOpen'] as const;
 const amount=(value:number)=> (value/100).toFixed(2).replace('.',',');
 const rows=[heads.map(T),...report.rows.map(r=>[String(report.year),taxMonthLabel(report.year,r.month,language),r.currency,...columns.map(k=>amount(r[k]))]),...report.totals.map(r=>[String(report.year),T('taxTotal'),r.currency,...columns.map(k=>amount(r[k]))]),[T('taxAsOf'),report.asOf],[T('taxDisclaimer')],[T('taxOpenHint')],[T('taxReversalHint')]];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
}
