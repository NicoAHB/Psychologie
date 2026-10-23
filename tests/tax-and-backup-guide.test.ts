import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { taxReport, taxCsv } from '../src/lib/taxReport';
import { taxPdf } from '../src/lib/taxPdf';
import { backupSecretsConfirmed, backupGuideReady } from '../src/lib/backupGuide';
import { emptyVault, type Session } from '../src/lib/types';
import { stampChanges, mergeVaults } from '../src/lib/merge';
function sample(){const data=emptyVault();const row=(id:string,date:string,paidAt:string|null,amount:number,currency:'EUR'|'UAH'='EUR',fee=false):Session=>({id,clientId:'c',date,time:'14:00',paidAt,feeCents:currency==='EUR'?amount:8500,billing:{currency,amountCents:amount},...(fee&&{kind:'cancellationFee'}),notes:'SECRET-NOTES',tags:[]});
 data.sessions.push(row('old','2025-12-01','2026-01-02',8500),row('uah','2026-02-01','2026-02-02',408000,'UAH'),row('fee','2026-02-02','2026-03-01',3000,'EUR',true),row('fee-open','2026-05-01',null,120000,'UAH',true),row('open','2026-07-01',null,8500),row('later','2026-10-01','2027-01-02',9000));return data;}
test('tax overview uses receipt dates, separate native currency totals and fee subsets without double counting',()=>{
 const report=taxReport(sample(),2026,'2026-12-31');const eur=report.totals.find(r=>r.currency==='EUR')!,uah=report.totals.find(r=>r.currency==='UAH')!;assert.equal(eur.incomeCents,11500);assert.equal(uah.incomeCents,408000);assert.equal(eur.cancellationPaidCents,3000);assert.equal(eur.openCents,8500);assert.equal(uah.openCents,120000);assert.equal(uah.cancellationOpenCents,120000);assert.equal(report.rows.find(r=>r.currency==='EUR'&&r.month===1)!.incomeCents,8500);assert.equal(report.rows.find(r=>r.currency==='EUR'&&r.month===12)!.incomeCents,0);
});
test('tax overview excludes cancelled unpaid charges but a paid invoice cancellation never invents a cash refund',()=>{
 const data=sample();data.sessions[0].invoiceId='original';data.sessions[4].invoiceId='original';data.invoices.push({id:'void',kind:'cancellation',number:'VOID',clientId:'c',issuedAt:'2026-08-01',cancels:{id:'original',number:'OLD',issuedAt:'2026-01-01'},lines:[],totalCents:0,recipient:{name:'',address:''},sender:data.settings.practice,language:'de'});
 const report=taxReport(data,2026,'2026-12-31');assert.equal(report.paidVoidedCount,1);assert.equal(report.totals[0].incomeCents,11500);assert.equal(report.totals[0].openCents,0);
});
test('financial conflicts and invalid amounts cannot yield a seemingly reliable tax export',()=>{
 const data=sample();stampChanges(emptyVault(),data,1,'base');const a=structuredClone(data),b=structuredClone(data);a.sessions[0].feeCents=9000;b.sessions[0].feeCents=9500;stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');assert.throws(()=>taxReport(mergeVaults(a,b),2026),/invoiceWorkflowConflict/);assert.throws(()=>taxReport(data,2026.5));data.sessions[0].billing!.amountCents=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>taxReport(data,2026),/invalidAmount/);
});
test('readable CSV and embedded Cyrillic PDF contain aggregates and translated notices, without clinical content',async()=>{
 const report=taxReport(sample(),2026,'2026-12-31');const fonts=await Promise.all([readFile('src/assets/DejaVuSans-Base.ttf'),readFile('src/assets/DejaVuSans-Bold-Base.ttf')]);
 for(const language of ['de','uk'] as const){const csv=taxCsv(report,language);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('EUR'));assert.ok(csv.includes('UAH'));assert.ok(!csv.includes('SECRET-NOTES'));assert.ok(!csv.includes('clientId'));assert.match(csv,/4080,00/);const bytes=await taxPdf(report,language,...fonts);const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),2);assert.match(pdf.getTitle()!,language==='de'?/Jahresübersicht/:/річний огляд/);}
});
test('backup assistant cannot advance without both explicit secret confirmations and an existing recovery key',()=>{
 for(const hasKey of [false,true])for(const pass of [false,true])for(const recovery of [false,true])assert.equal(backupSecretsConfirmed(hasKey,pass,recovery),hasKey&&pass&&recovery);
 assert.equal(backupGuideReady(true,true,false),false);assert.equal(backupGuideReady(false,true,true),false);assert.equal(backupGuideReady(true,false,true),false);assert.equal(backupGuideReady(true,true,true),true);
});
