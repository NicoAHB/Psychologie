import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, Gift, Plus } from 'lucide-react';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { addDays, dateLabel, today } from '../lib/dates';
import { lastCompletedQuarter, referralError, payoutId, recordReferralPayout, referralEndInclusive, referralHasConflicts, referralMoney, referralRate, referralRows, referralTerms, reverseReferralPayout, type ReferralRow } from '../lib/referrals';
import { issueReferralCode, revokeReferralCode } from '../lib/referralCodes';
import { canvasPng, referralCardCanvas, referralExplanation } from '../lib/referralCard';
import type { Client, Currency, Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Empty, Field, Modal, Notice, PageHeading } from './ui';
import '../referrals.css';

export function ReferralCardButton({ vault, client }: { vault: VaultController; client: Client }) {
  const { t } = useI18n(); const [open,setOpen] = useState(false);
  return <><button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(true)}><Gift size={16}/>{t('referralCard')}</button>{open && <ReferralCardDialog vault={vault} client={client} onClose={() => setOpen(false)}/>}</>;
}
function ReferralCardDialog({ vault, client, onClose }: { vault: VaultController; client: Client; onClose: () => void }) {
  const { t } = useI18n(); const [language,setLanguage] = useState<Language>(client.language);
  const [agreed,setAgreed] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState<TextKey>();
  const [image,setImage] = useState<{ url: string; code: string; blob: Blob }>();
  const code = vault.data!.referralCodes.find(c => c.clientId === client.id);
  const terms = referralTerms(vault.data!); const practice = vault.data!.settings.practice.name;
  const blocked = referralHasConflicts(vault.data!);
  useEffect(() => {
    let active = true, url = ''; setImage(undefined);
    if (code && !code.revokedAt && !blocked) {
      void Promise.resolve().then(() => canvasPng(referralCardCanvas(code.code,language,practice,terms))).then(blob => {
        if (!active) return; url = URL.createObjectURL(blob); setImage({ url, code: code.code, blob });
      }).catch(() => { if (active) setError('referralCardError'); });
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [code?.code, code?.revokedAt, language, practice, terms.rateBps, terms.months, blocked]);
  async function createCode() {
    if (!agreed || vault.demo || !vault.envelope || blocked) return;
    setBusy(true); setError(undefined); const key = vault.getKey();
    try {
      const issued = await issueReferralCode(vault.envelope.vaultId,client.id);
      if (!key || key !== vault.getKey()) return;
      await vault.update(data => {
        if (!data.clients.some(c => c.id === client.id) || referralHasConflicts(data)) throw new Error('referralConflict');
        if (!data.referralCodes.some(c => c.clientId === client.id)) data.referralCodes.push(issued);
      });
    } catch (e) { setError(referralError(e)); } finally { setBusy(false); }
  }
  async function revoke() {
    if (!code || !vault.envelope || !window.confirm(t('referralRevokeConfirm'))) return;
    setBusy(true); setError(undefined); const key = vault.getKey();
    try {
      await revokeReferralCode(vault.envelope.vaultId,code.id);
      if (key !== vault.getKey()) return;
      await vault.update(data => { const target = data.referralCodes.find(c => c.id === code.id); if (target) target.revokedAt = new Date().toISOString(); });
    } catch(e) { setError(referralError(e)); } finally { setBusy(false); }
  }
  return <Modal title={t('referralCard')} onClose={() => { if (!busy) onClose(); }} wide>
    <p className="referral-id">{t('referralClientId')}: {client.id}</p>
    {vault.demo && <Notice>{t('referralDemo')}</Notice>}
    {blocked && <Notice error>{t('referralConflict')}</Notice>}
    <Field label={t('referralCardLanguage')}><select value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="de">{t('referralLanguageDe')}</option><option value="uk">{t('referralLanguageUk')}</option></select></Field>
    <p className="pre-line mb-4" lang={language}>{referralExplanation(language,terms)}</p>
    {!code ? <><label className="check-label"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}/><span>{t('referralParticipate')}</span></label><button type="button" className="btn btn-primary mt-4" disabled={!agreed || busy || vault.demo || blocked} onClick={() => void createCode()}><Plus size={16}/>{t(busy ? 'working' : 'referralCreateCode')}</button><p className="hint mt-3">{t('referralSetup')}</p></> : code.revokedAt ? <Notice>{t('referralStatus_revoked')}</Notice> : <>
      <p className="referral-code">{code.code}</p>
      <p className="pre-line" lang={language}>{translate(language,'referralCardText').replace('[CODE]',code.code)}</p>
      {image && <img className="referral-card-image mt-4" src={image.url} alt={t('referralCard')}/>}
      <div className="button-row flex-wrap mt-4"><a className={`btn btn-primary ${!image ? 'is-disabled' : ''}`} href={image?.url} download={`Praxisraum-${code.code}-${language}.png`} aria-disabled={!image || undefined} onClick={e => { if (!image) e.preventDefault(); }}><Download size={16}/>{t('referralDownload')}</a><button type="button" className="btn btn-secondary" disabled={busy || vault.demo || blocked} onClick={() => void revoke()}>{t('referralRevoke')}</button></div>
      <p className="hint mt-3">{t('referralShareHint')}</p>
    </>}
    {error && <Notice error>{t(error)}</Notice>}
  </Modal>;
}
export function Referrals({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const data = vault.data!;
  const [tab,setTab] = useState<'codes'|'ledger'|'settings'>('codes'), [selected,setSelected] = useState(data.clients[0]?.id ?? ''), [card,setCard] = useState<string>();
  const [limit,setLimit] = useState(30);
  return <div className="referrals-page space-y-6">
    <PageHeading title={t('referrals')} subtitle={t('referralSubtitle')}/>
    <Notice>{t('referralPrivacy')}</Notice>
    <div className="segmented-tabs referral-tabs" role="group" aria-label={t('referrals')}>{(['codes','ledger','settings'] as const).map(value => <button type="button" key={value} aria-pressed={tab===value} className={tab===value?'active':''} onClick={() => setTab(value)}>{t(value==='codes'?'referralCodesTab':value==='ledger'?'referralLedgerTab':'referralSettingsTab')}</button>)}</div>
    {tab==='codes' && <>
      <section className="card"><h2>{t('referralCard')}</h2><div className="referral-form-grid mt-4"><Field label={t('referralSelectClient')}><select value={selected} onChange={e => setSelected(e.target.value)}><option value="">—</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select></Field><button type="button" className="btn btn-primary" disabled={!data.clients.some(c => c.id===selected)} onClick={() => setCard(selected)}><Gift size={17}/>{t('referralCard')}</button></div></section>
      <section className="card"><h2>{t('referralCodesTab')}</h2>{!data.referralCodes.length ? <Empty icon={<Gift size={28}/>} title={t('referralNoCodes')} text={t('referralNoneHint')}/> : <ul className="referral-code-list">{data.referralCodes.slice(0,limit).map(c => <li key={c.id}><div><strong className="referral-id">{c.clientId}</strong><p>{c.code} {c.revokedAt && `· ${t('referralStatus_revoked')}`}</p></div><button type="button" className="btn btn-secondary" onClick={() => setCard(c.clientId)}>{t('referralCard')}</button></li>)}</ul>}{data.referralCodes.length>limit && <button type="button" className="text-link" onClick={() => setLimit(n=>n+30)}>{t('showMoreRows')}</button>}</section>
    </>}
    {tab==='ledger' && <ReferralLedger vault={vault}/>}
    {tab==='settings' && <ReferralSettings vault={vault}/>}
    {card && data.clients.find(c=>c.id===card) && <ReferralCardDialog key={card} vault={vault} client={data.clients.find(c=>c.id===card)!} onClose={()=>setCard(undefined)}/>}
  </div>;
}
function ReferralSettings({ vault }: { vault: VaultController }) {
  const { t } = useI18n(); const terms=referralTerms(vault.data!);
  const [rate,setRate]=useState(String(terms.rateBps/100)), [months,setMonths]=useState(String(terms.months)), [busy,setBusy]=useState(false), [error,setError]=useState<TextKey>(), [saved,setSaved]=useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(undefined); setSaved(false); setBusy(true);
    try { const number=Number(rate.replace(',','.'))*100, rateBps=Math.round(number), duration=Number(months);
      if (!rate.trim() || Math.abs(rateBps-number)>0.000001) throw new Error('referralInvalidTerms');
      await vault.update(d=>{d.settings.referralProgram={rateBps,months:duration};referralTerms(d);}); setSaved(true);
    } catch(e){setError(referralError(e));} finally{setBusy(false);}
  }
  return <section className="card"><h2>{t('referralSettingsTab')}</h2><p className="hint mt-2">{t('referralTermsHint')}</p><form onSubmit={e=>void submit(e)} className="mt-5"><div className="referral-form-grid"><Field label={t('referralRate')}><input type="text" inputMode="decimal" required maxLength={6} value={rate} onChange={e=>{setRate(e.target.value);setSaved(false);}}/></Field><Field label={t('referralMonths')}><input type="number" required min={1} max={60} step={1} value={months} onChange={e=>{setMonths(e.target.value);setSaved(false);}}/></Field></div><button className="btn btn-primary" disabled={busy}>{t(busy?'working':'save')}</button>{error&&<Notice error>{t(error)}</Notice>}{saved&&<Notice>{t('referralSaved')}</Notice>}</form></section>;
}
function ReferralLedger({ vault }: { vault: VaultController }) {
  const { t,language }=useI18n(); const data=vault.data!;
  const [status,setStatus]=useState('all'), [currency,setCurrency]=useState('all'), [referrer,setReferrer]=useState('all'), [limit,setLimit]=useState(30), [payout,setPayout]=useState<{id:string;currency:Currency}>(), [error,setError]=useState<TextKey>();
  const rows=useMemo(()=>referralRows(data),[data]);
  const eligible=useMemo(()=>referralRows(data,lastCompletedQuarter()),[data]);
  const totals=useMemo(()=>{const groups=new Map<string,{id:string;currency:Currency;open:number;available:number}>();for(const r of rows){const key=`${r.referral.referrerId}:${r.currency}`;const group=groups.get(key)??{id:r.referral.referrerId,currency:r.currency,open:0,available:0};group.open+=r.openCents;groups.set(key,group);}for(const r of eligible){const group=groups.get(`${r.referral.referrerId}:${r.currency}`);if(group)group.available+=r.openCents;}return [...groups.values()];},[rows,eligible]);
  const visible=rows.filter(r=>(status==='all'||r.status===status)&&(currency==='all'||r.currency===currency)&&(referrer==='all'||r.referral.referrerId===referrer));
  const blocked=referralHasConflicts(data); const through=lastCompletedQuarter();
  const displayDate=(day?:string)=>day?dateLabel(day,language,{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
  const changeFilter=(fn:()=>void)=>{fn();setLimit(30);};
  async function reverse(id:string){if(!window.confirm(t('referralReverseConfirm')))return;setError(undefined);try{await vault.update(d=>reverseReferralPayout(d,id));}catch(e){setError(referralError(e));}}
  return <>
    {blocked&&<Notice error>{t('referralConflict')}</Notice>}
    <section className="card"><h2>{t('referralLedgerTab')}</h2><p className="hint mt-2 mb-5">{t('referralSnapshotNote')}</p><div className="referral-filters">
      <Field label={t('referralStatusFilter')}><select value={status} onChange={e=>changeFilter(()=>setStatus(e.target.value))}><option value="all">{t('all')}</option>{(['waiting','active','expired']as const).map(s=><option key={s} value={s}>{t(`referralStatus_${s}`)}</option>)}</select></Field>
      <Field label={t('referralCurrencyFilter')}><select value={currency} onChange={e=>changeFilter(()=>setCurrency(e.target.value))}><option value="all">{t('all')}</option><option value="EUR">EUR</option><option value="UAH">UAH</option></select></Field>
      <Field label={t('referralReferrerFilter')}><select value={referrer} onChange={e=>changeFilter(()=>setReferrer(e.target.value))}><option value="all">{t('all')}</option>{[...new Set(data.referrals.map(r=>r.referrerId))].map(id=><option key={id} value={id}>{id}</option>)}</select></Field>
    </div>
    {!visible.length?<Empty icon={<Gift size={28}/>} title={t('referralNone')} text={t('referralNoneHint')}/>:<div className="referral-records">{visible.slice(0,limit).map(r=><ReferralRecord key={`${r.referral.id}:${r.currency}`} row={r}/>)}</div>}
    {visible.length>limit&&<button type="button" className="text-link" onClick={()=>setLimit(n=>n+30)}>{t('showMoreRows')}</button>}</section>
    <section className="card"><h2>{t('referralQuarterly')}</h2><p className="hint mt-2">{t('referralPayoutHint')}</p><p className="hint mt-2">{t('referralThrough')}: {displayDate(through)}</p><ul className="referral-code-list">{totals.filter(group=>(referrer==='all'||group.id===referrer)&&(currency==='all'||group.currency===currency)).slice(0,limit).map(group=><li key={`${group.id}:${group.currency}`}><div className="min-w-0"><strong className="referral-id">{group.id}</strong><p>{t('referralOpen')}: <strong>{referralMoney(group.open,language,group.currency)}</strong></p><p className="hint">{t('referralThrough')} {displayDate(through)}: {referralMoney(group.available,language,group.currency)}</p></div><button type="button" className="btn btn-primary" disabled={blocked||group.available<=0||data.referralPayouts.some(p=>p.id===payoutId(group.id,group.currency,through))} onClick={()=>setPayout({id:group.id,currency:group.currency})}>{t('referralPayout')}</button></li>)}</ul></section>
    <section className="card"><h2>{t('referralPayoutHistory')}</h2><ul className="referral-code-list">{[...data.referralPayouts].sort((a,b)=>b.paidOn.localeCompare(a.paidOn)||a.id.localeCompare(b.id)).filter(p=>(referrer==='all'||p.referrerId===referrer)&&(currency==='all'||p.currency===currency)).slice(0,limit).map(p=><li key={p.id}><div><strong className="referral-id">{p.referrerId}</strong><p>{displayDate(p.paidOn)} · {referralMoney(p.amountCents,language,p.currency)}</p><p className="hint">{t('referralThrough')}: {displayDate(p.through)}{p.reverses?` · ${t('referralReversal')}`:data.referralPayouts.some(r=>r.reverses===p.id)?` · ${t('referralReversed')}`:''}</p></div>{!p.reverses&&!data.referralPayouts.some(r=>r.reverses===p.id)&&<button type="button" className="btn btn-secondary" disabled={blocked} onClick={()=>void reverse(p.id)}>{t('referralReverse')}</button>}</li>)}</ul>{data.referralPayouts.length>limit&&<button type="button" className="text-link" onClick={()=>setLimit(n=>n+30)}>{t('showMoreRows')}</button>}</section>
    {error&&<Notice error>{t(error)}</Notice>}
    {payout&&<PayoutDialog vault={vault} referrerId={payout.id} currency={payout.currency} onClose={()=>setPayout(undefined)}/>}
  </>;
}
function ReferralRecord({row:r}:{row:ReferralRow}){
  const {t,language}=useI18n(); const date=(s?:string)=>s?dateLabel(s,language,{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
  return <article className="referral-record"><h3 className="referral-id">{t('referralReferred')}: {r.referral.referredId}</h3><dl>
    {[[t('referralReferrer'),r.referral.referrerId],[t('referralRegistered'),date(r.referral.registeredOn)],[t('referralFirstPayment'),date(r.referral.firstPaidOn)],[t('referralEnd'),date(referralEndInclusive(r.referral))],[t('paymentStatus'),t(`referralStatus_${r.status}`)],[t('referralRevenue'),referralMoney(r.revenueCents,language,r.currency)],[`${t('referralReward')} · ${referralRate(r.referral.rateBps,language)}`,referralMoney(r.rewardCents,language,r.currency)],[t('referralPaid'),referralMoney(r.paidCents,language,r.currency)],[t('referralOpen'),referralMoney(r.openCents,language,r.currency)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl></article>;
}
function PayoutDialog({vault,referrerId,currency,onClose}:{vault:VaultController;referrerId:string;currency:Currency;onClose:()=>void}){
  const {t,language}=useI18n(); const [date,setDate]=useState(today()),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<TextKey>();
  const through=lastCompletedQuarter(),amount=referralRows(vault.data!,through).filter(r=>r.referral.referrerId===referrerId&&r.currency===currency).reduce((sum,r)=>sum+r.openCents,0);
  async function submit(e:FormEvent){e.preventDefault();if(!confirmed)return;setBusy(true);setError(undefined);try{await vault.update(d=>{const paid=recordReferralPayout(d,referrerId,currency,date);if(paid.amountCents!==amount)throw new Error('referralPayoutBlocked');});onClose();}catch(e){setError(referralError(e));setBusy(false);}}
  return <Modal title={t('referralPayout')} onClose={()=>{if(!busy)onClose();}}><form onSubmit={e=>void submit(e)}><p className="referral-id">{t('referralReferrer')}: {referrerId}</p><p className="referral-code">{referralMoney(amount,language,currency)}</p><p className="hint mb-4">{t('referralPayoutHint')}</p><Field label={t('paymentDate')}><input type="date" required min={addDays(through,1)} max={today()} value={date} onChange={e=>setDate(e.target.value)}/></Field><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{t('referralPayoutConfirm')}</span></label>{error&&<Notice error>{t(error)}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy||!confirmed||amount<=0}>{t(busy?'working':'referralPayout')}</button></div></form></Modal>;
}
