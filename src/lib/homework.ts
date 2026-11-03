import { sha256 } from '@noble/hashes/sha2.js';
import { homeworkDay, normalizeHomeworkRecords, validateHomeworkSelection, type HomeworkAssignment, type HomeworkContent, type HomeworkHandover, type HomeworkSelection, type HomeworkSnapshot, type HomeworkStatus, type HomeworkTemplate } from './homeworkTypes';
import type { ClientDocument, VaultData } from './types';

const normalized=(text:string)=>text.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const digest=(text:string)=>Array.from(sha256(new TextEncoder().encode(text)),b=>b.toString(16).padStart(2,'0')).join('');
export const homeworkDocumentId=(id:string)=>`homework-pdf:${id}`;
export const homeworkDocuments=(data:VaultData,assignment:HomeworkAssignment)=>data.documents.filter(d=>d.clientId===assignment.clientId&&d.homeworkAssignmentId===assignment.id);
/** Old free text stays in its session. Only an explicit action materialises a
 * separate assignment; the session date is never presented as a delivery date. */
export function legacyHomework(data:VaultData,clientId:string):HomeworkAssignment[] {
  const clientLanguage=data.clients.find(c=>c.id===clientId)?.language??'de';
  const converted=new Set((data.homeworkAssignments??[]).filter(a=>a.clientId===clientId&&a.snapshot.legacySessionId).map(a=>JSON.stringify([a.snapshot.legacySessionId,a.snapshot.content.steps])));
  return data.sessions.filter(s=>s.clientId===clientId&&s.kind!=='cancellationFee'&&s.homework?.trim()).flatMap(s=>{
    const text=s.homework!.trim();
    if (converted.has(JSON.stringify([s.id,text]))) return [];
    return [{id:`legacy-homework:${s.id}:${digest(text)}`,clientId,sessionId:s.id,snapshot:{templateId:`legacy:${s.id}`,version:'legacy',category:'goals',language:clientLanguage,legacySessionId:s.id,content:{title:text.replace(/\s+/g,' ').slice(0,120),goal:'',steps:text,rhythm:'',questions:[]}},returnExpected:false,state:{value:s.homeworkDone?'discussed':'open'},feedback:'',handovers:[]} as HomeworkAssignment];
  });
}
export function clientHomework(data:VaultData,clientId:string):HomeworkAssignment[] {
  const dates=new Map(data.sessions.map(s=>[s.id,s.date]));
  return [...(data.homeworkAssignments??[]).filter(a=>a.clientId===clientId),...legacyHomework(data,clientId)].sort((a,b)=>(b.assignedAt??b.recordedAt??dates.get(b.sessionId??'')??'').localeCompare(a.assignedAt??a.recordedAt??dates.get(a.sessionId??'')??'')||a.id.localeCompare(b.id));
}
export function previousHomework(data:VaultData,clientId:string,snapshot:HomeworkSnapshot):HomeworkAssignment[] {
  return clientHomework(data,clientId).filter(a=>a.snapshot.templateId===snapshot.templateId||!!a.snapshot.legacySessionId&&(normalized(a.snapshot.content.steps)===normalized(snapshot.content.steps)||normalized(a.snapshot.content.steps)===normalized(snapshot.content.title)));
}
export function assignHomework(data:VaultData,clientId:string,selection:HomeworkSelection,sessionId?:string,now=new Date().toISOString()):HomeworkAssignment {
  validateHomeworkSelection(selection);
  if (!data.clients.some(c=>c.id===clientId)||sessionId&&!data.sessions.some(s=>s.id===sessionId&&s.clientId===clientId)||!Number.isFinite(Date.parse(now))) throw new Error('hwInvalid');
  const existing=data.homeworkAssignments.find(a=>a.id===selection.id);
  if(existing){if(existing.clientId!==clientId||JSON.stringify(existing.snapshot)!==JSON.stringify(selection.snapshot)||existing.returnExpected!==selection.returnExpected||existing.dueOn!==selection.dueOn)throw new Error('hwInvalid');return existing;}
  const history=previousHomework(data,clientId,selection.snapshot);
  if(history.length&&(!selection.repeatConfirmed||history.some(a=>!selection.acknowledgedAssignmentIds?.includes(a.id))))throw new Error('hwRepeatRequired');
  const assignment:HomeworkAssignment={id:selection.id,clientId,...sessionId&&{sessionId},snapshot:structuredClone(selection.snapshot),assignedAt:now,recordedAt:now,...selection.dueOn&&{dueOn:selection.dueOn},returnExpected:selection.returnExpected,state:{value:'open',at:now},feedback:'',handovers:[],...history.length&&{repeatAcknowledgedAt:now}};
  data.homeworkAssignments.push(assignment);return assignment;
}
export function materializeLegacyHomework(data:VaultData,id:string):HomeworkAssignment {
  const found=data.homeworkAssignments.find(a=>a.id===id);if(found)return found;
  for(const client of data.clients){const legacy=legacyHomework(data,client.id).find(a=>a.id===id);if(legacy){const row={...structuredClone(legacy),recordedAt:new Date().toISOString()};data.homeworkAssignments.push(row);return row;}}
  throw new Error('hwInvalid');
}
export function updateHomework(data:VaultData,id:string,status:HomeworkStatus,feedback:string,dueOn:string,now=new Date().toISOString()) {
  if(!['open','deferred','discussed','ended'].includes(status)||feedback.length>4000||dueOn&&!homeworkDay(dueOn))throw new Error('hwInvalid');
  const item=materializeLegacyHomework(data,id);if(item.state.value!==status)item.state={value:status,at:now};item.feedback=feedback;
  updateHomeworkReturnPlan(data,id,item.returnExpected,dueOn);
  if(item.snapshot.legacySessionId&&status==='discussed'){const session=data.sessions.find(s=>s.id===item.snapshot.legacySessionId);if(session?.homework?.trim()===item.snapshot.content.steps)session.homeworkDone=true;}
}
export function recordHomeworkHandover(data:VaultData,id:string,on:string,channel:HomeworkHandover['channel'],reference:string,now=new Date().toISOString()) {
  if(!homeworkDay(on)||on>reference||!['personal','externalEmail','externalTelegram','other'].includes(channel))throw new Error('hwInvalid');
  materializeLegacyHomework(data,id).handovers.push({id:crypto.randomUUID(),on,channel,recordedAt:now});
}
export function saveHomeworkTemplate(data:VaultData,template:HomeworkTemplate){
  normalizeHomeworkRecords([template],[]);
  const at=data.homeworkTemplates.findIndex(t=>t.id===template.id);if(at<0)data.homeworkTemplates.push(structuredClone(template));else data.homeworkTemplates[at]=structuredClone(template);
}
export function homeworkReceipts(data:VaultData,assignment:HomeworkAssignment) {
  const docs=homeworkDocuments(data,assignment);
  return docs.flatMap(document=>[
    ...document.deliveries.map(event=>({id:event.id,channel:'email' as const,at:event.acceptedAt??event.requestedAt,confirmed:!!event.acceptedAt,documentId:document.id})),
    ...(document.telegramDeliveries??[]).map(event=>({id:event.id,channel:'telegram' as const,at:event.acceptedAt??event.requestedAt,confirmed:!!event.acceptedAt,documentId:document.id}))
  ]).sort((a,b)=>b.at.localeCompare(a.at));
}
export function homeworkReturns(data:VaultData,assignment:HomeworkAssignment) {return homeworkDocuments(data,assignment).flatMap(document=>document.returns.map(item=>({...item,documentId:document.id}))).sort((a,b)=>b.receivedOn.localeCompare(a.receivedOn)||b.uploadedAt.localeCompare(a.uploadedAt));}
export const homeworkPlainText=(content:HomeworkContent)=>[content.title,content.goal,content.steps,content.rhythm,...content.questions].filter(Boolean).join('\n\n');
/** A document and the assignment must have the same owner; one PDF identity is
 * reused for downloads and both channels, rather than creating phantom tasks. */
export function attachHomeworkDocument(data:VaultData,id:string,document:ClientDocument) {
  const assignment=materializeLegacyHomework(data,id);
  if(document.homeworkAssignmentId!==id||document.clientId!==assignment.clientId||document.id!==homeworkDocumentId(id)||JSON.stringify(document.homeworkSnapshot)!==JSON.stringify(assignment.snapshot))throw new Error('hwInvalid');
  if(!data.documents.some(d=>d.id===document.id))data.documents.push(document);
}

/** Explicit review during a completed appointment updates the same task history. */
export function reviewHomeworkFromSession(data:VaultData,clientId:string,ids:readonly string[],now=new Date().toISOString()) {
  for(const id of new Set(ids)){const row=data.homeworkAssignments.find(a=>a.id===id&&a.clientId===clientId);if(!row)throw new Error('hwInvalid');updateHomework(data,id,'discussed',row.feedback,row.dueOn??'',now);}
}
export function reviewLegacyHomework(data:VaultData,sessionId:string,done:boolean,now=new Date().toISOString()) {
  const session=data.sessions.find(s=>s.id===sessionId);if(!session)return;session.homeworkDone=done;
  for(const row of data.homeworkAssignments)if(row.snapshot.legacySessionId===sessionId&&row.snapshot.content.steps===session.homework?.trim())row.state={value:done?'discussed':'open',at:now};
}

/** One return plan for the task and its existing document metadata. The issued PDF stays unchanged. */
export function updateHomeworkReturnPlan(data:VaultData,id:string,returnExpected:boolean,dueOn:string) {
  if(typeof returnExpected!=='boolean'||dueOn&&!homeworkDay(dueOn))throw new Error('hwInvalid');
  const item=materializeLegacyHomework(data,id);item.returnExpected=returnExpected;
  if(dueOn)item.dueOn=dueOn;else delete item.dueOn;
  for(const doc of homeworkDocuments(data,item)){doc.returnExpected=returnExpected;if(dueOn)doc.returnDueOn=dueOn;else delete doc.returnDueOn;}
}
