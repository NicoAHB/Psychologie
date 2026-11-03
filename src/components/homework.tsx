import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Copy, Plus, Star } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { dateLabel } from '../lib/dates';
import { practiceToday } from '../lib/followUp';
import { fold } from '../lib/search';
import { copyText } from '../lib/files';
import { homeworkMessage, overviewOf } from '../lib/discussion';
import { homeworkCatalog, type HomeworkChoice } from '../lib/homeworkCatalog';
import { assignHomework, clientHomework, homeworkPlainText, homeworkReceipts, homeworkReturns, recordHomeworkHandover, saveHomeworkTemplate, updateHomework } from '../lib/homework';
import { HOMEWORK_CATEGORIES, validHomeworkContent, type HomeworkAssignment, type HomeworkCategory, type HomeworkContent, type HomeworkHandover, type HomeworkSelection, type HomeworkStatus, type HomeworkTemplate } from '../lib/homeworkTypes';
import { uid, type Client, type Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { useSaveStatus } from '../lib/useSaveStatus';
import { SaveButton } from './SaveButton';
import { Field, Modal, Notice } from './ui';

const EMPTY_SELECTIONS:HomeworkSelection[]=[];
const blankContent=():HomeworkContent=>({title:'',goal:'',steps:'',rhythm:'',questions:[]});
const cleanContent=(c:HomeworkContent):HomeworkContent=>({...c,title:c.title.trim(),goal:c.goal.trim(),steps:c.steps.trim(),rhythm:c.rhythm.trim(),questions:c.questions.map(q=>q.trim()).filter(Boolean)});
const errorKey=(e:unknown):TextKey=>e instanceof Error&&['hwRepeatRequired','hwInvalid'].includes(e.message)?e.message as TextKey:'storageError';
function useHomeworkTime(vault:VaultController){const {language,t}=useI18n();return (iso?:string)=>iso?new Intl.DateTimeFormat(language==='uk'?'uk-UA':'de-DE',{timeZone:vault.data!.settings.timeZone,dateStyle:'short',timeStyle:'short'}).format(new Date(iso)):t('hwDateUnknown');}
function ContentFields({value,onChange,language}:{value:HomeworkContent;onChange:(value:HomeworkContent)=>void;language:Language}){
  const {t}=useI18n();return <div className="hw-content-fields">
    <Field label={t('hwTitle')}><input lang={language} maxLength={160} value={value.title} onChange={e=>onChange({...value,title:e.target.value})}/></Field>
    <Field label={t('hwGoal')}><textarea lang={language} rows={2} maxLength={2000} value={value.goal} onChange={e=>onChange({...value,goal:e.target.value})}/></Field>
    <Field label={t('hwSteps')}><textarea lang={language} rows={5} maxLength={8000} value={value.steps} onChange={e=>onChange({...value,steps:e.target.value})}/></Field>
    <Field label={t('hwRhythm')}><input lang={language} maxLength={1000} value={value.rhythm} onChange={e=>onChange({...value,rhythm:e.target.value})}/></Field>
    <Field label={t('hwQuestions')} hint={t('hwQuestionsHint')}><textarea lang={language} rows={4} maxLength={2400} value={value.questions.join('\n')} onChange={e=>onChange({...value,questions:e.target.value.split('\n')})}/></Field>
  </div>;
}
export function HomeworkSheet({assignment}:{assignment:HomeworkAssignment}){
  const {t}=useI18n(),c=assignment.snapshot.content;return <article className="hw-sheet" lang={assignment.snapshot.language}><h3>{c.title}</h3>{c.goal&&<p>{c.goal}</p>}<p className="pre-line">{c.steps}</p>{c.rhythm&&<p className="hint">{c.rhythm}</p>}{c.questions.length>0&&<><h4>{t('hwQuestions')}</h4><ol>{c.questions.map((q,i)=><li key={i}>{q}</li>)}</ol></>}</article>;
}
function HomeworkTemplateDialog({vault,template,onClose}:{vault:VaultController;template?:HomeworkTemplate;onClose:()=>void}){
  const {t,language}=useI18n();const [contentLanguage,setContentLanguage]=useState<Language>(language);
  const [contents,setContents]=useState<Partial<Record<Language,HomeworkContent>>>(()=>structuredClone(template?.snapshot.content??{}));
  const [category,setCategory]=useState<HomeworkCategory>(template?.snapshot.category??'feelings'),[error,setError]=useState<TextKey>();const save=useSaveStatus();
  const normalized=Object.fromEntries(Object.entries(contents).map(([lang,c])=>[lang,cleanContent(c!)]));
  const valid=Object.values(normalized).length>0&&Object.values(normalized).every(validHomeworkContent);
  async function submit(e:FormEvent){e.preventDefault();if(!valid)return;setError(undefined);try{await save.save(()=>vault.update(data=>saveHomeworkTemplate(data,{id:template?.id??uid(),createdAt:template?.createdAt??new Date().toISOString(),archived:template?.archived,snapshot:{version:uid(),category,content:normalized}})));onClose();}catch(e){setError(errorKey(e));}}
  return <Modal title={t(template?'hwEditTemplate':'hwNewTemplate')} onClose={()=>{if(!save.saving)onClose();}} wide><form onSubmit={submit}><p className="hint">{t('hwTemplateHint')}</p>
    <Field label={t('hwCategory')}><select value={category} onChange={e=>{setCategory(e.target.value as HomeworkCategory);save.changed();}}>{HOMEWORK_CATEGORIES.map(c=><option key={c} value={c}>{t(`hwCategory_${c}`)}</option>)}</select></Field>
    <Field label={t('hwTemplateLanguage')}><select value={contentLanguage} onChange={e=>setContentLanguage(e.target.value as Language)}><option value="de">Deutsch</option><option value="uk">Українська</option></select></Field>
    <ContentFields value={contents[contentLanguage]??blankContent()} language={contentLanguage} onChange={value=>{setContents(old=>({...old,[contentLanguage]:value}));save.changed();}}/>
    {contents[contentLanguage]&&<button type="button" className="btn btn-ghost" disabled={save.saving} onClick={()=>{setContents(old=>{const next={...old};delete next[contentLanguage];return next;});save.changed();}}>{t('hwRemoveTranslation')}</button>}
    {error&&<Notice error>{t(error)}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={save.saving} onClick={onClose}>{t('cancel')}</button><SaveButton status={save} disabled={!valid}/></div></form></Modal>;
}
function PriorHomework({vault,rows,onClose}:{vault:VaultController;rows:HomeworkAssignment[];onClose:()=>void}){
  const {t}=useI18n(),when=useHomeworkTime(vault);const [limit,setLimit]=useState(10);return <Modal title={t('hwPriorTitle')} onClose={onClose} wide><div className="hw-prior-list">{rows.slice(0,limit).map(a=><details key={a.id} className="hw-prior"><summary>{a.snapshot.content.title} · {when(a.assignedAt)} · {t(`hwState_${a.state.value}`)}</summary><HomeworkSheet assignment={a}/><DeliveryHistory vault={vault} assignment={a}/>{a.feedback&&<p className="pre-line">{a.feedback}</p>}</details>)}</div>{rows.length>limit&&<button className="btn btn-secondary" onClick={()=>setLimit(n=>n+10)}>{t('showMoreRows')}</button>}</Modal>;
}
/** One picker is shared by immediate assignment and the encrypted session draft. */
export function HomeworkPicker({vault,client,onSelected,onClose,staged=EMPTY_SELECTIONS}:{vault:VaultController;client:Client;onSelected:(selection:HomeworkSelection)=>Promise<void>|void;onClose:()=>void;staged?:HomeworkSelection[]}){
  const {t,language}=useI18n(),data=vault.data!;const [query,setQuery]=useState(''),deferred=useDeferredValue(query),[category,setCategory]=useState('all'),[favoritesOnly,setFavoritesOnly]=useState(false),[archived,setArchived]=useState(false),[limit,setLimit]=useState(12);
  const [choice,setChoice]=useState<HomeworkChoice>(),[editing,setEditing]=useState<HomeworkTemplate|'new'>(),[prior,setPrior]=useState<HomeworkAssignment[]>(),[error,setError]=useState<TextKey>();
  const formatTime=useHomeworkTime(vault);
  const choices=useMemo(()=>homeworkCatalog(data,language,archived),[data.homeworkTemplates,language,archived]);
  const history=useMemo(()=>{
    const view={...data,homeworkAssignments:[...data.homeworkAssignments,...staged.map(s=>({id:s.id,clientId:client.id,snapshot:s.snapshot,returnExpected:s.returnExpected,state:{value:'open' as const},feedback:'',handovers:[]}))]};
    const rows=clientHomework(view,client.id),byId=new Map<string,HomeworkAssignment[]>(),legacyText=new Map<string,HomeworkAssignment[]>();
    const normalized=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
    for(const row of rows){const id=row.snapshot.templateId;byId.set(id,[...(byId.get(id)??[]),row]);if(row.snapshot.legacySessionId){const key=normalized(row.snapshot.content.steps);legacyText.set(key,[...(legacyText.get(key)??[]),row]);}}
    const actual=new Map(homeworkCatalog(data,client.language,true).map(c=>[c.id,c.snapshot]));
    return new Map(choices.map(c=>{const snapshot=actual.get(c.id)??c.snapshot,found=[...(byId.get(c.id)??[]),...(legacyText.get(normalized(snapshot.content.steps))??[]),...(legacyText.get(normalized(snapshot.content.title))??[])];return[c.id,[...new Map(found.map(a=>[a.id,a])).values()]];}));
  },[data,client.id,client.language,choices,staged]);
  const favorites=new Set(data.settings.homeworkFavorites??[]),words=fold(deferred).folded.split(/\s+/).filter(Boolean);
  const indexed=useMemo(()=>choices.map(choice=>({choice,haystack:fold(`${choice.snapshot.content.title} ${choice.snapshot.content.goal}`).folded})),[choices]);
  const filtered=indexed.filter(({choice:c,haystack})=>(category==='all'||c.snapshot.category===category)&&(!favoritesOnly||favorites.has(c.id))&&words.every(word=>haystack.includes(word))).map(entry=>entry.choice).sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id)));
  async function favorite(id:string){try{await vault.update(d=>{const set=new Set(d.settings.homeworkFavorites??[]);if(set.has(id))set.delete(id);else set.add(id);d.settings.homeworkFavorites=[...set];});}catch(e){setError(errorKey(e));}}
  async function archive(item:HomeworkTemplate){try{await vault.update(d=>{const row=d.homeworkTemplates.find(t=>t.id===item.id);if(row)row.archived=!row.archived;});}catch(e){setError(errorKey(e));}}
  function choose(item:HomeworkChoice){const actual=homeworkCatalog(data,client.language,true).find(c=>c.id===item.id);if(actual)setChoice(actual);}
  return <Modal title={t(choice?'hwAssign':'hwChoose')} onClose={onClose} wide>
    {choice?<AssignmentForm key={choice.id} vault={vault} client={client} choice={choice} prior={history.get(choice.id)??[]} onPrior={()=>setPrior(history.get(choice.id)??[])} onBack={()=>setChoice(undefined)} onSelected={onSelected}/>:<>
      <p className="hint">{t('hwLibraryHint')}</p><div className="hw-library-controls"><Field label={t('hwSearch')}><input type="search" value={query} placeholder={t('hwSearchPlaceholder')} onChange={e=>{setQuery(e.target.value);setLimit(12);}}/></Field><Field label={t('hwCategory')}><select value={category} onChange={e=>{setCategory(e.target.value);setLimit(12);}}><option value="all">{t('all')}</option>{HOMEWORK_CATEGORIES.map(c=><option key={c} value={c}>{t(`hwCategory_${c}`)}</option>)}</select></Field></div>
      <div className="button-row"><label className="check-label"><input type="checkbox" checked={favoritesOnly} onChange={e=>{setFavoritesOnly(e.target.checked);setLimit(12);}}/><span>{t('hwFavoritesOnly')}</span></label><button type="button" className="btn btn-secondary" onClick={()=>setEditing('new')}><Plus size={16}/>{t('hwNewTemplate')}</button></div>
      <label className="check-label"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/><span>{t('hwIncludeArchived')}</span></label>
      {clientHomework(data,client.id).some(a=>a.snapshot.legacySessionId)&&<p className="hint">{t('hwLegacyHint')}</p>}
      <div className="hw-catalog" role="list" aria-label={t('hwLibrary')}>{filtered.slice(0,limit).map(item=>{const previous=history.get(item.id)??[],own=data.homeworkTemplates.find(x=>x.id===item.id);return <article role="listitem" className="hw-choice" key={item.id}><div className="hw-choice-head"><button type="button" className="hw-choice-open" disabled={item.archived} onClick={()=>choose(item)}><strong>{item.snapshot.content.title}</strong><span>{t(`hwCategory_${item.snapshot.category}`)}{item.own?` · ${t('hwOwn')}`:''}</span></button><button type="button" className="icon-btn" aria-label={`${t(favorites.has(item.id)?'hwFavoriteRemove':'hwFavoriteAdd')}: ${item.snapshot.content.title}`} aria-pressed={favorites.has(item.id)} onClick={()=>void favorite(item.id)}><Star size={20} fill={favorites.has(item.id)?'currentColor':'none'}/></button></div><p>{item.snapshot.content.goal}</p>{!item.requestedLanguage&&<p className="hint">{t('hwMissingTranslation')}</p>}
        {previous.length>0&&<div><button className="text-link hw-previous" type="button" onClick={()=>setPrior(previous)}>{t('hwPreviously').replace('{n}',String(previous.length))} · {t('hwHistoryOpen')}</button><p className="hint">{t('hwAssignedOn')}: {formatTime(previous[0].assignedAt)}</p><DeliverySummary vault={vault} assignment={previous[0]}/></div>}
        {own&&<div className="button-row"><button type="button" className="btn btn-ghost" onClick={()=>setEditing(own)}>{t('edit')}</button><button type="button" className="btn btn-ghost" onClick={()=>void archive(own)}>{t(own.archived?'hwRestoreTemplate':'hwArchiveTemplate')}</button></div>}
      </article>;})}</div>{!filtered.length&&<p>{t('noResults')}</p>}{filtered.length>limit&&<button type="button" className="btn btn-secondary" onClick={()=>setLimit(n=>n+12)}>{t('showMoreRows')}</button>}
    </>}
    {error&&<Notice error>{t(error)}</Notice>}{editing&&<HomeworkTemplateDialog vault={vault} template={editing==='new'?undefined:editing} onClose={()=>setEditing(undefined)}/>}{prior&&<PriorHomework vault={vault} rows={prior} onClose={()=>setPrior(undefined)}/>}
  </Modal>;
}
function AssignmentForm({vault,client,choice,prior,onPrior,onBack,onSelected}:{vault:VaultController;client:Client;choice:HomeworkChoice;prior:HomeworkAssignment[];onPrior:()=>void;onBack:()=>void;onSelected:(s:HomeworkSelection)=>Promise<void>|void}){
  const {t}=useI18n(),data=vault.data!;const [snapshot,setSnapshot]=useState(()=>structuredClone(choice.snapshot)),[due,setDue]=useState(''),[expected,setExpected]=useState(false),[includeName,setIncludeName]=useState(false),[repeat,setRepeat]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<TextKey>();const [id]=useState(uid);const dirty=useRef(false);
  const priorIdentity=prior.map(a=>a.id).sort().join('|');
  useEffect(()=>setRepeat(false),[priorIdentity]);
  const valid=validHomeworkContent(cleanContent(snapshot.content));
  function language(value:Language){if(value===snapshot.language)return;const translated=homeworkCatalog(data,value,true).find(t=>t.id===choice.id);if(translated?.requestedLanguage){if(dirty.current&&!window.confirm(t('hwLanguageConfirm')))return;setSnapshot(structuredClone(translated.snapshot));dirty.current=false;}else setSnapshot(old=>({...old,language:value}));}
  async function submit(e:FormEvent){e.preventDefault();if(busy||!valid)return;setBusy(true);setError(undefined);try{await onSelected({id,snapshot:{...snapshot,content:cleanContent(snapshot.content),...includeName&&{pdfClientName:client.name}},returnExpected:expected,...due&&{dueOn:due},...repeat&&{repeatConfirmed:true,acknowledgedAssignmentIds:prior.map(a=>a.id)}});}catch(e){setError(errorKey(e));}finally{setBusy(false);}}
  return <form onSubmit={submit}><p className="hint">{t('hwIndividualHint')}</p><Field label={t('hwDocumentLanguage')}><select value={snapshot.language} disabled={busy} onChange={e=>language(e.target.value as Language)}><option value="de">Deutsch</option><option value="uk">Українська</option></select></Field>
    {!choice.own?null:<p className="hint">{t('hwManualTranslationHint')}</p>}
    <ContentFields value={snapshot.content} language={snapshot.language} onChange={content=>{dirty.current=true;setSnapshot(old=>({...old,content}));}}/>
    <Field label={t('hwDueOn')}><input type="date" value={due} onChange={e=>setDue(e.target.value)}/></Field><label className="check-label"><input type="checkbox" checked={expected} onChange={e=>setExpected(e.target.checked)}/><span>{t('hwExpectReturn')}</span></label><label className="check-label"><input type="checkbox" checked={includeName} onChange={e=>setIncludeName(e.target.checked)}/><span>{t('hwIncludeName')}</span></label><p className="hint">{t('hwIncludeNameHint')}</p>
    {prior.length>0&&<div className="hw-repeat"><Notice>{t('hwRepeatRequired')} <button type="button" className="text-link" onClick={onPrior}>{t('hwHistoryOpen')}</button></Notice><label className="check-label"><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/><span>{t('hwRepeatConfirm')}</span></label></div>}
    {error&&<Notice error>{t(error)}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onBack}>{t('back')}</button><button className="btn btn-primary" disabled={busy||!valid||!!prior.length&&!repeat}>{t(busy?'saving':'hwAssign')}</button></div></form>;
}
function DeliverySummary({vault,assignment}:{vault:VaultController;assignment:HomeworkAssignment}){
  const {t,language}=useI18n(),when=useHomeworkTime(vault),receipts=homeworkReceipts(vault.data!,assignment),sent=receipts.find(e=>e.confirmed),manual=[...assignment.handovers].sort((a,b)=>b.on.localeCompare(a.on))[0];
  if(manual&&(!sent||manual.on>=sent.at.slice(0,10)))return <span className="hw-delivery-summary">{t(`hwHandover_${manual.channel}`)} · {dateLabel(manual.on,language,{day:'2-digit',month:'2-digit',year:'numeric'})}</span>;
  return <span className="hw-delivery-summary">{sent?`${t('hwSentOn')}: ${when(sent.at)}`:t(receipts.length?'hwUnconfirmed':'hwNotSent')}</span>;
}
export function DeliveryHistory({vault,assignment}:{vault:VaultController;assignment:HomeworkAssignment}){
  const {t,language}=useI18n(),when=useHomeworkTime(vault);const receipts=homeworkReceipts(vault.data!,assignment),returns=homeworkReturns(vault.data!,assignment),[limit,setLimit]=useState(20);
  return <div className="hw-delivery-history"><p>{t('hwAssignedOn')}: <strong>{when(assignment.assignedAt)}</strong></p>{assignment.state.at&&assignment.state.value!=='open'&&<p>{t(`hwStateDate_${assignment.state.value}`)}: {when(assignment.state.at)}</p>}{assignment.recordedAt&&!assignment.assignedAt&&<p className="hint">{t('hwRecordedOn')}: {when(assignment.recordedAt)}</p>}
    {!receipts.length&&!assignment.handovers.length&&<p className="hint">{t('hwNotSent')}</p>}
    <ul>{receipts.slice(0,limit).map(event=><li key={event.id}><span>{t(event.confirmed?'hwSentOn':'hwUnconfirmed')} · {event.channel==='email'?t('email'):t('contactChannel_telegram')} · {when(event.at)}</span></li>)}{assignment.handovers.slice(-limit).reverse().map(event=><li key={event.id}>{t(`hwHandover_${event.channel}`)} · {dateLabel(event.on,language,{day:'2-digit',month:'2-digit',year:'numeric'})}<small>{t('hwHandoverRecorded')} · {when(event.recordedAt)}</small></li>)}{returns.slice(0,limit).map(item=><li key={item.id}>{t('hwReturnReceived')} {dateLabel(item.receivedOn,language,{day:'2-digit',month:'2-digit',year:'numeric'})}</li>)}</ul>
    {Math.max(receipts.length,returns.length,assignment.handovers.length)>limit&&<button className="btn btn-secondary" onClick={()=>setLimit(n=>n+20)}>{t('showMoreRows')}</button>}<p className="hint">{t('hwDeliveryHint')}</p></div>;
}
function HandoverDialog({vault,assignment,onClose}:{vault:VaultController;assignment:HomeworkAssignment;onClose:()=>void}){
  const {t}=useI18n(),[on,setOn]=useState(practiceToday(vault.data!.settings)),[channel,setChannel]=useState<HomeworkHandover['channel']>('personal'),[error,setError]=useState<TextKey>();const save=useSaveStatus();
  async function submit(e:FormEvent){e.preventDefault();setError(undefined);try{await save.save(()=>vault.update(d=>recordHomeworkHandover(d,assignment.id,on,channel,practiceToday(d.settings))));onClose();}catch(e){setError(errorKey(e));}}
  return <Modal title={t('hwHandover')} onClose={()=>{if(!save.saving)onClose();}}><form onSubmit={submit}><p className="hint">{t('hwHandoverHint')}</p><Field label={t('hwHandoverOn')}><input type="date" value={on} max={practiceToday(vault.data!.settings)} onChange={e=>{setOn(e.target.value);save.changed();}}/></Field><Field label={t('hwHandoverChannel')}><select value={channel} onChange={e=>{setChannel(e.target.value as HomeworkHandover['channel']);save.changed();}}>{(['personal','externalEmail','externalTelegram','other'] as const).map(value=><option key={value} value={value}>{t(`hwHandover_${value}`)}</option>)}</select></Field>{error&&<Notice error>{t(error)}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={save.saving} onClick={onClose}>{t('cancel')}</button><SaveButton status={save} disabled={!on}/></div></form></Modal>;
}
export function HomeworkDetail({vault,assignment,onClose,onDocument}:{vault:VaultController;assignment:HomeworkAssignment;onClose:()=>void;onDocument:(id:string)=>void}){
  const {t}=useI18n();const [status,setStatus]=useState(assignment.state.value),[feedback,setFeedback]=useState(assignment.feedback),[due,setDue]=useState(assignment.dueOn??''),[handover,setHandover]=useState(false),[error,setError]=useState<TextKey>();const base=useRef({status:assignment.state.value,feedback:assignment.feedback,due:assignment.dueOn??''}),dirty=useRef(false),save=useSaveStatus();
  useEffect(()=>{if(!dirty.current){base.current={status:assignment.state.value,feedback:assignment.feedback,due:assignment.dueOn??''};setStatus(base.current.status);setFeedback(base.current.feedback);setDue(base.current.due);}},[assignment.state.value,assignment.feedback,assignment.dueOn]);
  const changed=()=>{dirty.current=true;save.changed();};
  async function submit(e:FormEvent){e.preventDefault();setError(undefined);try{await save.save(()=>vault.update(d=>{const current=clientHomework(d,assignment.clientId).find(a=>a.id===assignment.id);if(!current)throw new Error('hwInvalid');updateHomework(d,assignment.id,status!==base.current.status?status:current.state.value,feedback!==base.current.feedback?feedback:current.feedback,due!==base.current.due?due:current.dueOn??'');}));dirty.current=false;const current=clientHomework(vault.getData()!,assignment.clientId).find(a=>a.id===assignment.id);if(current){base.current={status:current.state.value,feedback:current.feedback,due:current.dueOn??''};setStatus(base.current.status);setFeedback(base.current.feedback);setDue(base.current.due);}}catch(e){setError(errorKey(e));}}
  return <Modal title={t('hwDetails')} onClose={()=>{if(!save.saving)onClose();}} wide><h3>{assignment.snapshot.content.title}</h3><p className="workflow-chip">{t(`hwState_${assignment.state.value}`)}</p><DeliveryHistory vault={vault} assignment={assignment}/><div className="button-row"><button type="button" className="btn btn-secondary" onClick={()=>setHandover(true)}>{t('hwHandover')}</button>{vault.data!.documents.filter(d=>d.homeworkAssignmentId===assignment.id&&d.clientId===assignment.clientId).map(d=><button key={d.id} className="btn btn-secondary" onClick={()=>onDocument(d.id)}>{t('hwOpenDocuments')}</button>)}</div>
    <details className="hw-original"><summary>{t('hwSnapshot')}</summary><HomeworkSheet assignment={assignment}/></details>
    <form className="hw-review-form" onSubmit={submit}><Field label={t('hwStatus')}><select value={status} onChange={e=>{setStatus(e.target.value as HomeworkStatus);changed();}}>{(['open','deferred','discussed','ended'] as const).map(value=><option value={value} key={value}>{t(`hwState_${value}`)}</option>)}</select></Field><Field label={t('hwDueOn')}><input type="date" value={due} onChange={e=>{setDue(e.target.value);changed();}}/></Field><Field label={t('hwFeedback')} hint={t('hwFeedbackHint')}><textarea rows={4} maxLength={4000} value={feedback} onChange={e=>{setFeedback(e.target.value);changed();}}/></Field>{error&&<Notice error>{t(error)}</Notice>}<div className="form-actions"><SaveButton status={save}/></div></form>
    {handover&&<HandoverDialog vault={vault} assignment={assignment} onClose={()=>setHandover(false)}/>}
  </Modal>;
}
export function HomeworkSection({vault,client,onDocument,focusId}:{vault:VaultController;client:Client;onDocument:(id:string)=>void;focusId?:string}){
  const {t,language}=useI18n(),data=vault.data!;const [picker,setPicker]=useState(false),[selectedId,setSelectedId]=useState(focusId),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[limit,setLimit]=useState(20);const deferred=useDeferredValue(query),when=useHomeworkTime(vault);
  const rows=useMemo(()=>clientHomework(data,client.id),[data,client.id]);const selected=rows.find(a=>a.id===selectedId);useEffect(()=>{if(focusId)setSelectedId(focusId);},[focusId]);
  const index=useMemo(()=>rows.map(a=>({a,haystack:fold(`${a.snapshot.content.title} ${a.snapshot.content.steps} ${a.feedback}`).folded})),[rows]);
  const words=fold(deferred).folded.split(/\s+/).filter(Boolean);const filtered=index.filter(({a,haystack})=>(filter==='all'||a.state.value===filter)&&words.every(w=>haystack.includes(w))).map(entry=>entry.a);
  async function assign(selection:HomeworkSelection){await vault.update(d=>assignHomework(d,client.id,selection));setPicker(false);setSelectedId(selection.id);}
  return <section className="card hw-section" aria-label={t('homework')}><div className="section-heading flex-wrap"><div><h2>{t('homework')}</h2><p>{t('hwOverviewHint')}</p></div><button className="btn btn-primary" onClick={()=>setPicker(true)}><Plus size={17}/>{t('hwChoose')}</button></div>
    <div className="hw-library-controls"><Field label={t('hwSearch')}><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}}/></Field><Field label={t('hwFilter')}><select value={filter} onChange={e=>{setFilter(e.target.value);setLimit(20);}}><option value="all">{t('all')}</option>{(['open','deferred','discussed','ended'] as const).map(s=><option key={s} value={s}>{t(`hwState_${s}`)}</option>)}</select></Field></div>
    {rows.some(a=>a.snapshot.legacySessionId)&&<p className="hint">{t('hwLegacyHint')}</p>}{!filtered.length?<p className="hint">{t('hwEmpty')}</p>:<ol className="hw-assignment-list">{filtered.slice(0,limit).map(a=><li key={a.id}><button className="hw-row" onClick={()=>setSelectedId(a.id)}><strong>{a.snapshot.content.title}</strong><span>{t('hwAssignedOn')}: {when(a.assignedAt)}</span><DeliverySummary vault={vault} assignment={a}/><span>{t(`hwState_${a.state.value}`)}{homeworkReturns(data,a).length?` · ${t('hwReturned')}`:''}</span>{a.dueOn&&<span>{t('hwDueOn')}: {dateLabel(a.dueOn,language,{day:'2-digit',month:'2-digit',year:'numeric'})}</span>}<ArrowRight size={18} aria-hidden="true"/></button></li>)}</ol>}
    {filtered.length>limit&&<button type="button" className="btn btn-secondary" onClick={()=>setLimit(n=>n+20)}>{t('showMoreRows')}</button>}
    {picker&&<HomeworkPicker vault={vault} client={client} onSelected={assign} onClose={()=>setPicker(false)}/>}{selected&&<HomeworkDetail vault={vault} assignment={selected} onClose={()=>setSelectedId(undefined)} onDocument={id=>{setSelectedId(undefined);onDocument(id);}}/>}
  </section>;
}
export function HomeworkOverview({vault,client,onOpen}:{vault:VaultController;client:Client;onOpen:(id?:string)=>void}){
  const {t,language}=useI18n(),data=vault.data!,when=useHomeworkTime(vault);const rows=useMemo(()=>clientHomework(data,client.id).filter(a=>a.state.value==='open'),[data,client.id]),[message,setMessage]=useState<string>();
  async function copy(a:HomeworkAssignment){const text=a.snapshot.legacySessionId?a.snapshot.content.steps:homeworkPlainText(a.snapshot.content);const next=overviewOf(data,client.id).nextAppointment;setMessage(await copyText(homeworkMessage(client,{homework:text},next,data.settings))?t('copiedHomework'):t('copyFailed'));}
  return <section className="card hw-overview"><div className="section-heading"><h2>{t('homeworkOpen')}</h2><button className="text-link" onClick={()=>onOpen()}>{t('hwAll')}<ArrowRight size={15}/></button></div>
    {rows.length?<ul className="homework-list">{rows.slice(0,3).map(a=><li key={a.id}><div><button className="text-link" onClick={()=>onOpen(a.id)}>{a.snapshot.content.title}</button>{!a.snapshot.legacySessionId&&<p className="hint">{t('hwAssignedOn')}: {when(a.assignedAt)}</p>}{a.snapshot.legacySessionId&&<p className="hint">{t('hwDateUnknown')} · {data.sessions.find(s=>s.id===a.snapshot.legacySessionId)?.date&&t('hwRecordedInSession').replace('{date}',dateLabel(data.sessions.find(s=>s.id===a.snapshot.legacySessionId)!.date,language,{day:'numeric',month:'short'}))}</p>}</div><div className="homework-actions"><label className="check-label"><input type="checkbox" checked={false} onChange={()=>void vault.update(d=>updateHomework(d,a.id,'discussed',a.feedback,a.dueOn??'')).catch(()=>{})}/><span>{t('homeworkReviewed')}</span></label><button className="btn btn-secondary" onClick={()=>void copy(a)}><Copy size={15}/>{t('homeworkCopy')}</button></div></li>)}</ul>:<p className="hint">{t('homeworkNone')}</p>}
    {message&&<Notice>{message}</Notice>}
  </section>;
}
