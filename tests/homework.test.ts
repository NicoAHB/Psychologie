import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { emptyVault, normalizeVault, uid, type ClientDocument, type Session } from '../src/lib/types';
import { builtinHomework, homeworkCatalog } from '../src/lib/homeworkCatalog';
import { assignHomework, attachHomeworkDocument, clientHomework, homeworkDocumentId, homeworkReceipts, homeworkReturns, legacyHomework, materializeLegacyHomework, previousHomework, recordHomeworkHandover, reviewHomeworkFromSession, reviewLegacyHomework, saveHomeworkTemplate, updateHomework } from '../src/lib/homework';
import { normalizeHomeworkRecords, validHomeworkContent, type HomeworkSelection, type HomeworkTemplate } from '../src/lib/homeworkTypes';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { deleteClient, deleteSession, orphanedBlobs } from '../src/lib/records';
import { referencedBlobs } from '../src/lib/blobs';
import { decryptVault, encryptVault, randomSalt } from '../src/lib/crypto';
import { clientExport } from '../src/lib/clientExport';

function setup(){const data=emptyVault();data.clients.push({id:'c',name:'PRIVATE PERSON',language:'de',createdAt:'2026-01-01',preparation:'',contact:'',telegramChatId:'',reminderConsent:false});return data;}
function selection():HomeworkSelection{return{id:uid(),snapshot:structuredClone(builtinHomework('de')[0].snapshot),returnExpected:true};}
const session:Session={id:'session',clientId:'c',date:'2026-01-01',time:'10:00',feeCents:8500,paidAt:null,notes:'',tags:[],homework:'Bisherige persönliche Aufgabe'};

test('thirty original complete worksheets have matching stable IDs in DE and UK and six categories',()=>{
  const de=builtinHomework('de'),uk=builtinHomework('uk');assert.equal(de.length,30);assert.deepEqual(de.map(x=>x.id),uk.map(x=>x.id));assert.equal(new Set(de.map(x=>x.id)).size,30);assert.equal(new Set(de.map(x=>x.snapshot.category)).size,6);
  for(const choices of [de,uk])for(const choice of choices){assert.ok(validHomeworkContent(choice.snapshot.content));assert.equal(choice.snapshot.content.questions.length,3);assert.ok(choice.snapshot.content.steps.length>100);}
});
test('older encrypted vaults receive empty extensions; free-text dates stay unknown and originals are unchanged',async()=>{
  const old=setup();old.sessions.push(structuredClone(session));delete (old as Partial<typeof old>).homeworkAssignments;delete (old as Partial<typeof old>).homeworkTemplates;
  const original=JSON.stringify(old),value=normalizeVault(old);assert.equal(JSON.stringify(old),original);assert.equal(value.homeworkAssignments.length,0);const [legacy]=legacyHomework(value,'c');assert.equal(legacy.assignedAt,undefined);assert.equal(legacy.handovers.length,0);assert.equal(legacy.snapshot.content.steps,session.homework);
  materializeLegacyHomework(value,legacy.id);assert.equal(clientHomework(value,'c').length,1);assert.equal(value.homeworkAssignments[0].assignedAt,undefined);assert.equal(value.sessions[0].homework,session.homework);
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const env=await encryptVault(key,old,uid(),randomSalt());assert.deepEqual((await decryptVault(key,env)).homeworkAssignments,[]);
});
test('a repeat needs explicit acknowledgement of all previous tasks, including completed tasks and newly arrived repeats',()=>{
  const data=setup(),first=selection();const task=assignHomework(data,'c',first,undefined,'2026-01-02T12:00:00Z');updateHomework(data,task.id,'discussed','Besprochen','','2026-01-03T12:00:00Z');
  const again=selection();assert.throws(()=>assignHomework(data,'c',again),/hwRepeatRequired/);again.repeatConfirmed=true;assert.throws(()=>assignHomework(data,'c',again),/hwRepeatRequired/);again.acknowledgedAssignmentIds=[task.id];const second=assignHomework(data,'c',again);assert.ok(second.repeatAcknowledgedAt);assert.equal(assignHomework(data,'c',again).id,second.id);assert.equal(data.homeworkAssignments.length,2);
  const stale={...selection(),repeatConfirmed:true,acknowledgedAssignmentIds:[task.id]};assert.throws(()=>assignHomework(data,'c',stale),/hwRepeatRequired/);
});
test('template changes, language changes and archival preserve the ID and earlier assigned snapshot',()=>{
  const data=setup(),draft=selection();const own:HomeworkTemplate={id:'own',createdAt:'2026-01-01T12:00:00Z',snapshot:{version:'one',category:'feelings' as const,content:{de:draft.snapshot.content}}};saveHomeworkTemplate(data,own);
  const choice=homeworkCatalog(data,'uk').find(x=>x.id==='own')!;assert.equal(choice.requestedLanguage,false);assert.equal(choice.snapshot.language,'de');
  const task=assignHomework(data,'c',{...draft,snapshot:choice.snapshot});const before=structuredClone(task.snapshot);own.snapshot.version='two';own.snapshot.content.de!.title='Neuer Titel';own.archived=true;saveHomeworkTemplate(data,own);
  assert.deepEqual(task.snapshot,before);assert.equal(homeworkCatalog(data,'de').some(x=>x.id==='own'),false);assert.equal(previousHomework(data,'c',{...choice.snapshot,version:'two',content:own.snapshot.content.de!}).length,1);
});
test('handover is explicit and future dates are refused; downloads alone never produce a receipt',()=>{
  const data=setup(),task=assignHomework(data,'c',selection());assert.deepEqual(homeworkReceipts(data,task),[]);assert.throws(()=>recordHomeworkHandover(data,task.id,'2026-01-05','personal','2026-01-04'),/hwInvalid/);
  recordHomeworkHandover(data,task.id,'2026-01-03','personal','2026-01-04');assert.equal(task.handovers[0].on,'2026-01-03');assert.deepEqual(homeworkReceipts(data,task),[]);
});
test('offline feedback, independent handovers and favourites merge without losing history; client erasure removes hidden payloads',()=>{
  const base=setup(),task=assignHomework(base,'c',selection());const a=structuredClone(base),b=structuredClone(base);
  a.homeworkAssignments[0].feedback='PRIVATE FEEDBACK';recordHomeworkHandover(a,task.id,'2026-01-02','personal','2026-01-04');a.settings.homeworkFavorites=['builtin:hw01'];
  updateHomework(b,task.id,'discussed','','','2026-01-03T12:00:00Z');recordHomeworkHandover(b,task.id,'2026-01-03','externalEmail','2026-01-04');b.settings.homeworkFavorites=['builtin:hw02'];
  stampChanges(base,a,10,'a');stampChanges(base,b,20,'b');const merged=mergeVaults(a,b);assert.equal(merged.homeworkAssignments[0].feedback,'PRIVATE FEEDBACK');assert.equal(merged.homeworkAssignments[0].state.value,'discussed');assert.equal(merged.homeworkAssignments[0].handovers.length,2);assert.deepEqual(merged.settings.homeworkFavorites?.sort(),['builtin:hw01','builtin:hw02']);
  const erased=structuredClone(merged);deleteClient(erased,'c');stampChanges(merged,erased,30,'delete');const joined=mergeVaults(erased,a);assert.deepEqual(joined.homeworkAssignments,[]);assert.ok(!JSON.stringify(joined.crdt).includes('PRIVATE FEEDBACK'));
});
test('session deletion detaches a separately assigned task; documents, returned files and their delivery history share the existing encrypted file lifecycle',async()=>{
  const data=setup();data.sessions.push(structuredClone(session));const task=assignHomework(data,'c',selection(),session.id);
  const document:ClientDocument={id:homeworkDocumentId(task.id),clientId:'c',homeworkAssignmentId:task.id,homeworkSnapshot:structuredClone(task.snapshot),title:task.snapshot.content.title,createdAt:'2026-01-02T12:00:00Z',file:{blobId:'pdf',fileName:'aufgabe.pdf',mimeType:'application/pdf',size:20},returnExpected:true,deliveries:[{id:'email',recipient:'test@example.com',requestedAt:'2026-01-02T12:00:00Z',subject:'Aufgabe',body:'Bitte ausfüllen',purpose:'homework'}],returns:[{id:'return',receivedOn:'2026-01-04',uploadedAt:'2026-01-04T12:00:00Z',file:{blobId:'returned',fileName:'zurueck.pdf',mimeType:'application/pdf',size:20}}]};attachHomeworkDocument(data,task.id,document);assert.equal(homeworkReceipts(data,task)[0].confirmed,false);document.deliveries[0].acceptedAt='2026-01-02T12:01:00Z';assert.equal(homeworkReceipts(data,task)[0].confirmed,true);assert.equal(homeworkReturns(data,task)[0].receivedOn,'2026-01-04');
  assert.deepEqual(referencedBlobs(data).sort(),['pdf','returned']);deleteSession(data,session.id);assert.equal(data.homeworkAssignments[0].sessionId,undefined);assert.equal(data.homeworkAssignments.length,1);
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const env=await encryptVault(key,data,uid(),randomSalt());const restored=await decryptVault(key,env);assert.equal(restored.homeworkAssignments[0].id,task.id);assert.deepEqual(referencedBlobs(restored).sort(),['pdf','returned']);
  const exported=await clientExport(data,'c','de',async()=>new Blob(['%PDF-example']));const zip=unzipSync(exported.bytes);assert.equal(JSON.parse(strFromU8(zip['daten.json'])).homework.length,1);assert.ok(zip['hausaufgaben.json']);assert.ok(zip['hausaufgaben.md']);
  const before=referencedBlobs(data);deleteClient(data,'c');assert.deepEqual(orphanedBlobs(before,data).sort(),['pdf','returned']);
});
test('invalid assignments and staged snapshots fail import instead of accepting malformed dates or oversized content',()=>{
  const data=setup(),task=assignHomework(data,'c',selection());assert.throws(()=>normalizeHomeworkRecords([], [{...task,dueOn:'2026-02-30'}]),/invalidBackup/);assert.throws(()=>normalizeHomeworkRecords([], [{...task,snapshot:{...task.snapshot,content:{...task.snapshot.content,steps:'x'.repeat(8001)}}}]),/invalidBackup/);
});
test('appointment reviews use the same history, preserve private notes and reject another client’s task',()=>{
  const data=setup();data.sessions.push(structuredClone(session));const task=assignHomework(data,'c',selection());task.feedback='Private Rückmeldung';reviewHomeworkFromSession(data,'c',[task.id],'2026-01-05T12:00:00Z');assert.equal(task.state.value,'discussed');assert.equal(task.state.at,'2026-01-05T12:00:00Z');assert.equal(task.feedback,'Private Rückmeldung');assert.throws(()=>reviewHomeworkFromSession(data,'other',[task.id]),/hwInvalid/);
  const legacy=legacyHomework(data,'c')[0];materializeLegacyHomework(data,legacy.id);reviewLegacyHomework(data,session.id,true,'2026-01-06T12:00:00Z');assert.equal(clientHomework(data,'c').find(a=>a.id===legacy.id)?.state.value,'discussed');assert.equal(data.sessions[0].homeworkDone,true);
});
