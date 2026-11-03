import { practiceToday } from './followUp';
import { homeworkDocuments } from './homework';
import type { HomeworkAssignment } from './homeworkTypes';
import type { ClientDocument, VaultData } from './types';
import { appointmentInstant, appointmentStart, byStart } from './dates';

export function nextHomeworkDue(data:VaultData,clientId:string,now=Date.now()):string|undefined {
  const next=data.appointments.filter(a=>a.clientId===clientId&&a.status==='scheduled'&&appointmentStart(a)>=now).sort(byStart)[0];
  return next?practiceToday(data.settings,new Date(appointmentInstant(next))):undefined;
}

export type HomeworkFocus = 'all'|'active'|'overdue'|'waiting'|'received'|'notSent'|'drafts'|'history';
export interface HomeworkProgress { delivered:boolean; uncertain:boolean; returned:number; waiting:boolean; overdue:boolean; active:boolean; draft:boolean }
export function homeworkProgress(a:HomeworkAssignment,documents:readonly ClientDocument[],reference:string):HomeworkProgress {
  const delivered=!!a.handovers.length||documents.some(d=>d.deliveries.some(e=>e.acceptedAt)||d.telegramDeliveries?.some(e=>e.acceptedAt));
  const returned=documents.reduce((n,d)=>n+d.returns.length,0),active=a.state.value==='open'||a.state.value==='deferred';
  const waiting=active&&a.returnExpected&&delivered&&!returned&&!documents.some(d=>d.returnClosedAt);
  return {delivered,returned,active,waiting,draft:!!a.reviewDraft,
    uncertain:documents.some(d=>d.deliveries.some(e=>!e.acceptedAt)||d.telegramDeliveries?.some(e=>!e.acceptedAt)),
    overdue:a.state.value==='open'&&!!a.dueOn&&a.dueOn<reference&&!returned&&!documents.some(d=>d.returnClosedAt)};
}
/** Index documents once, instead of repeatedly scanning all attachments while typing. */
export function homeworkProgressIndex(data:VaultData,rows:readonly HomeworkAssignment[],reference=practiceToday(data.settings)) {
  const docs=new Map<string,ClientDocument[]>();
  for(const d of data.documents)if(d.homeworkAssignmentId){const key=JSON.stringify([d.clientId,d.homeworkAssignmentId]);const list=docs.get(key)??[];list.push(d);docs.set(key,list);}
  return new Map(rows.map(a=>[a.id,homeworkProgress(a,docs.get(JSON.stringify([a.clientId,a.id]))??[],reference)]));
}
export function matchesHomeworkFocus(p:HomeworkProgress,focus:HomeworkFocus) {
  return focus==='all'||focus==='active'&&p.active||focus==='overdue'&&p.overdue||focus==='waiting'&&p.waiting||focus==='received'&&p.returned>0||focus==='notSent'&&p.active&&!p.delivered||focus==='drafts'&&p.draft||focus==='history'&&!p.active;
}
export interface HomeworkEvent { id:string; kind:'assigned'|'recorded'|'sent'|'unconfirmed'|'handover'|'returned'|'status'; at:string; dateOnly?:boolean; recordedAt?:string; channel?:'email'|'telegram'|HomeworkAssignment['handovers'][number]['channel']; status?:HomeworkAssignment['state']['value']; documentId?:string; returnId?:string }
export function homeworkTimeline(data:VaultData,a:HomeworkAssignment):HomeworkEvent[] {
  const events:HomeworkEvent[]=[];
  if(a.assignedAt)events.push({id:'assigned',kind:'assigned',at:a.assignedAt});
  else if(a.recordedAt)events.push({id:'recorded',kind:'recorded',at:a.recordedAt});
  if(a.state.at&&a.state.value!=='open')events.push({id:'status',kind:'status',at:a.state.at,status:a.state.value});
  for(const h of a.handovers)events.push({id:`handover:${h.id}`,kind:'handover',at:h.on,dateOnly:true,recordedAt:h.recordedAt,channel:h.channel});
  for(const d of homeworkDocuments(data,a)) {
    for(const e of d.deliveries)events.push({id:`email:${e.id}`,kind:e.acceptedAt?'sent':'unconfirmed',at:e.acceptedAt??e.requestedAt,channel:'email',documentId:d.id});
    for(const e of d.telegramDeliveries??[])events.push({id:`telegram:${e.id}`,kind:e.acceptedAt?'sent':'unconfirmed',at:e.acceptedAt??e.requestedAt,channel:'telegram',documentId:d.id});
    for(const r of d.returns)events.push({id:`return:${r.id}`,kind:'returned',at:r.receivedOn,dateOnly:true,documentId:d.id,returnId:r.id});
  }
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:data.settings.timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  const keys=new Map(events.map(e=>{if(e.dateOnly)return[e.id,{day:e.at,instant:0}];const parts=Object.fromEntries(day.formatToParts(new Date(e.at)).map(p=>[p.type,p.value]));return[e.id,{day:`${parts.year}-${parts.month}-${parts.day}`,instant:Date.parse(e.at)}];}));
  return events.sort((a,b)=>keys.get(b.id)!.day.localeCompare(keys.get(a.id)!.day)||Number(!!a.dateOnly)-Number(!!b.dateOnly)||keys.get(b.id)!.instant-keys.get(a.id)!.instant||a.id.localeCompare(b.id));
}
