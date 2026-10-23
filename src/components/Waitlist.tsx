import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { freedSlots, saveWaitingEntry } from '../lib/waitlist';
import { appointmentStart } from '../lib/dates';
import { useI18n } from '../lib/i18n';
import { uid, type WaitlistEntry } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';
function FreeSlots({ vault }: { vault: VaultController }) {
  const {t,language}=useI18n(); const slots=freedSlots(vault.data!);
  return <><p>{t('waitlistFreeHint')}</p><ul>{slots.slice(0,3).map(s=><li key={s.id}><time dateTime={new Date(appointmentStart(s)).toISOString()}>{new Intl.DateTimeFormat(language==='de'?'de-DE':'uk-UA',{timeZone:vault.data!.settings.timeZone,dateStyle:'medium',timeStyle:'short'}).format(appointmentStart(s))}</time> · {s.duration} {t('minutes')}</li>)}</ul><p className="hint">{t('practiceTime')} · {vault.data!.settings.timeZone}</p></>;
}
export function WaitingNotice({vault,onOpen}:{vault:VaultController;onOpen:()=>void}) {
  const {t}=useI18n(); if(!vault.data!.waitlist.length || !freedSlots(vault.data!).length)return null;
  return <section className="card waiting-notice"><h2>{t('waitlistFreeTitle')}</h2><FreeSlots vault={vault}/><button type="button" className="btn btn-secondary" onClick={onOpen}>{t('waitlistOpen')}</button></section>;
}
export function WaitlistPanel({vault}:{vault:VaultController}) {
  const {t}=useI18n(); const data=vault.data!, [editing,setEditing]=useState<WaitlistEntry|'new'>(),[limit,setLimit]=useState(30),[error,setError]=useState(false);
  const slots=freedSlots(data); const list=[...data.waitlist].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  return <section id="waitlist-panel" tabIndex={-1} className="card waitlist-panel" aria-labelledby="waitlist-title"><div className="section-heading"><h2 id="waitlist-title">{t('waitlist')} ({list.length})</h2><button type="button" className="btn btn-secondary" onClick={()=>setEditing('new')}><Plus size={17}/>{t('waitlistAdd')}</button></div><p className="hint">{t('waitlistHint')}</p>
    {list.length>0 && slots.length>0 && <Notice><div><strong>{t('waitlistFreeTitle')}</strong><FreeSlots vault={vault}/></div></Notice>}
    {list.length ? <ul className="waiting-list">{list.slice(0,limit).map(w=><li key={w.id}><div><strong>{w.name}</strong><p>{w.preferredTimes}</p><p className="hint whitespace-pre-wrap">{w.note}</p></div><div className="button-row"><button type="button" className="icon-btn" aria-label={`${t('edit')}: ${w.name}`} onClick={()=>setEditing(w)}><Pencil size={18}/></button><button type="button" className="icon-btn danger" aria-label={`${t('delete')}: ${w.name}`} onClick={()=>{if(window.confirm(t('waitlistDeleteConfirm')))void vault.update(d=>{d.waitlist=d.waitlist.filter(x=>x.id!==w.id);}).catch(()=>setError(true));}}><Trash2 size={18}/></button></div></li>)}</ul> : <p className="hint">{t('waitlistEmpty')}</p>}
    {list.length>limit && <button type="button" className="btn btn-secondary" onClick={()=>setLimit(n=>n+30)}>{t('showMoreRows')}</button>}{error && <Notice error>{t('storageError')}</Notice>}
    {editing && <WaitingForm vault={vault} entry={editing==='new'?undefined:editing} onClose={()=>setEditing(undefined)}/>}
  </section>;
}
function WaitingForm({vault,entry,onClose}:{vault:VaultController;entry?:WaitlistEntry;onClose:()=>void}) {
  const {t}=useI18n();const [name,setName]=useState(entry?.name??''),[times,setTimes]=useState(entry?.preferredTimes??''),[note,setNote]=useState(entry?.note??''),[clientId,setClientId]=useState(entry?.clientId??''),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  return <Modal title={t(entry?'waitlistEdit':'waitlistAdd')} onClose={()=>{if(!busy)onClose();}}><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError(false);try{await vault.update(d=>saveWaitingEntry(d,{id:entry?.id??uid(),name,preferredTimes:times,note,createdAt:entry?.createdAt??new Date().toISOString(),...(clientId&&{clientId})}));onClose();}catch{setError(true);}finally{setBusy(false);}}}>
    <Field label={t('waitlistClient')} hint={t('waitlistClientHint')}><select value={clientId} onChange={e=>{setClientId(e.target.value);const c=vault.data!.clients.find(c=>c.id===e.target.value);if(c)setName(c.name);}}><option value="">{t('waitlistNoClient')}</option>{vault.data!.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <Field label={t('name')}><input autoFocus required value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></Field><Field label={t('waitlistTimes')}><input value={times} maxLength={500} placeholder={t('waitlistTimesPlaceholder')} onChange={e=>setTimes(e.target.value)}/></Field><Field label={t('waitlistNote')}><textarea rows={3} value={note} maxLength={2000} onChange={e=>setNote(e.target.value)}/></Field>
    {error&&<Notice error>{t('required')}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy||!name.trim()}>{t(busy?'working':'save')}</button></div>
  </form></Modal>;
}
