import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { translate } from './i18n';
import { dateLabel } from './dates';
import { taxMoney, taxMonthLabel, type TaxReport } from './taxReport';
import type { Language } from './types';
/** Local, searchable summary. No client identifiers, clinical content or vault secrets. */
export async function taxPdf(report:TaxReport,language:Language,regularBytes:Uint8Array,boldBytes:Uint8Array):Promise<Uint8Array<ArrayBuffer>> {
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(regularBytes,{subset:true}),bold=await pdf.embedFont(boldBytes,{subset:true});
 const T=(key:Parameters<typeof translate>[1])=>translate(language,key); const ink=rgb(.12,.2,.28);let page:PDFPage,y=760;
 const wrap=(text:string,size:number,width:number,face:PDFFont=font)=>{const lines:string[]=[];let line='';for(const word of text.replace(/[\x00-\x1f]/g,' ').split(/\s+/)){for(const char of (line?' ':'')+word){if(face.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}line+=char;}}if(line)lines.push(line);return lines;};
 const draw=(text:string,x:number,at:number,size=10,face=font)=>page.drawText(text,{x,y:at,size,font:face,color:ink});
 const paragraph=(text:string,size=9)=>{for(const line of wrap(text,size,499)){draw(line,48,y,size);y-=size*1.5;}y-=8;};
 for(const currency of ['EUR','UAH'] as const){page=pdf.addPage([595.28,841.89]);y=778;draw(`${T('taxTitle')} · ${report.year}`,48,y,21,bold);y-=32;draw(currency,48,y,15,bold);y-=24;paragraph(`${T('taxAsOf')}: ${dateLabel(report.asOf,language,{dateStyle:'long'})}`);paragraph(T('taxDisclaimer'));paragraph(T('taxOpenHint'));
  const heads=['taxMonth','taxIncome','taxOpen','taxFeePaid','taxFeeOpen'] as const;const x=[48,153,255,357,455],width=[100,97,97,93,92];const labels=heads.map((key,i)=>wrap(T(key),8,width[i],bold));const height=Math.max(...labels.map(l=>l.length))*12+10;
  for(let i=0;i<heads.length;i++)labels[i].forEach((line,j)=>draw(line,x[i],y-j*12,8,bold));y-=height;
  for(const r of [...report.rows.filter(r=>r.currency===currency),{...report.totals.find(r=>r.currency===currency)!,month:0}]){const values=[r.month?taxMonthLabel(report.year,r.month,language):T('taxTotal'),...[r.incomeCents,r.openCents,r.cancellationPaidCents,r.cancellationOpenCents].map(value=>taxMoney(value,language,currency))];page.drawLine({start:{x:48,y:y+10},end:{x:547,y:y+10},thickness:.4,color:rgb(.8,.85,.88)});values.forEach((value,i)=>draw(value,x[i],y,8,r.month?font:bold));y-=24;}
  y-=16;paragraph(T('taxFeeHint'));paragraph(T('taxReversalHint'));draw(`${currency} · Praxisraum`,48,38,8);
 }
 pdf.setTitle(`${T('taxTitle')} ${report.year}`);pdf.setSubject(T('taxDisclaimer'));pdf.setProducer('Praxisraum – local browser export');return new Uint8Array(await pdf.save());
}
