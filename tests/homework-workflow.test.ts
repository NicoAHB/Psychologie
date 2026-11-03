import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, normalizeVault, uid, type ClientDocument } from '../src/lib/types';
import { builtinHomework } from '../src/lib/homeworkCatalog';
import { assignHomework, homeworkDocumentId, updateHomework } from '../src/lib/homework';
import { commitHomeworkReview, homeworkReviewValues, saveHomeworkReviewDraft } from '../src/lib/homeworkReview';
import { homeworkProgress, homeworkTimeline, matchesHomeworkFocus } from '../src/lib/homeworkWorkflow';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { deleteClient } from '../src/lib/records';
import { decryptVault, encryptVault, randomSalt } from '../src/lib/crypto';
function setup(){const data=emptyVault();data.clients.push({id:'c',name:'PRIVATE',language:'de',createdAt:'2026-01-01',contact:'',preparation:'',telegramChatId:'',reminderConsent:false});const a=assignHomework(data,'c',{id:uid(),snapshot:structuredClone(builtinHomework('de')[0].snapshot),returnExpected:true},undefined,'2026-01-01T10:00:00Z');return{data,a};}
function document(a:ReturnType<typeof setup>['a']):ClientDocument{return{id:homeworkDocumentId(a.id),clientId:'c',homeworkAssignmentId:a.id,homeworkSnapshot:structuredClone(a.snapshot),createdAt:'2026-01-01T11:00:00Z',title:'Aufgabe',file:{blobId:'pdf',fileName:'task.pdf',mimeType:'application/pdf',size:10},returnExpected:true,deliveries:[],returns:[]};}
test('progress distinguishes explicit handover, uncertain transport, returns and overdue open work',()=>{
 const {a}=setup(),doc=document(a);a.dueOn='2026-01-04';let p=homeworkProgress(a,[doc],'2026-01-05');assert.equal(p.delivered,false);assert.equal(p.overdue,true);assert.equal(p.waiting,false);assert.equal(matchesHomeworkFocus(p,'notSent'),true);
 doc.deliveries.push({id:'send',recipient:'test@example.com',subject:'',body:'',requestedAt:'2026-01-03T10:00:00Z'});p=homeworkProgress(a,[doc],'2026-01-05');assert.equal(p.uncertain,true);assert.equal(p.delivered,false);
 a.handovers.push({id:'manual',on:'2026-01-03',recordedAt:'2026-01-03T11:00:00Z',channel:'personal'});p=homeworkProgress(a,[doc],'2026-01-05');assert.equal(p.waiting,true);assert.equal(p.overdue,true);
 doc.returns.push({id:'r',receivedOn:'2026-01-04',uploadedAt:'2026-01-05T12:00:00Z',file:doc.file});p=homeworkProgress(a,[doc],'2026-01-05');assert.equal(p.overdue,false);assert.equal(p.waiting,false);assert.equal(matchesHomeworkFocus(p,'received'),true);
 a.state={value:'discussed'};assert.equal(matchesHomeworkFocus(homeworkProgress(a,[],'2026-01-05'),'history'),true);
});
test('the event timeline sorts by practice day and never substitutes the upload date for receipt',()=>{
 const {data,a}=setup(),doc=document(a);data.settings.timeZone='Europe/Kyiv';data.documents.push(doc);
 doc.deliveries.push({id:'send',recipient:'test@example.com',subject:'',body:'',requestedAt:'2026-01-03T23:30:00Z',acceptedAt:'2026-01-03T23:31:00Z'});
 a.handovers.push({id:'m',on:'2026-01-03',recordedAt:'2026-01-06T12:00:00Z',channel:'other'});doc.returns.push({id:'r',receivedOn:'2026-01-05',uploadedAt:'2026-01-07T12:00:00Z',file:doc.file});
 const events=homeworkTimeline(data,a);assert.deepEqual(events.map(e=>e.kind),['returned','sent','handover','assigned']);assert.equal(events[0].at,'2026-01-05');assert.equal(events[2].dateOnly,true);
});
test('review drafts survive encrypted round trips without approving status or private notes',async()=>{
 const {data,a}=setup(),base=homeworkReviewValues(a);const values={...base,status:'discussed' as const,feedback:'PRIVATE UNSAVED REVIEW',dueOn:'2026-02-01'};saveHomeworkReviewDraft(data,'c',a.id,{base,values,savedAt:'2026-01-06T10:00:00Z'});
 assert.equal(a.state.value,'open');assert.equal(a.feedback,'');const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const env=await encryptVault(key,data,uid(),randomSalt());assert.ok(!JSON.stringify(env).includes('PRIVATE UNSAVED REVIEW'));const restored=await decryptVault(key,env);assert.equal(restored.homeworkAssignments[0].reviewDraft?.values.feedback,values.feedback);
 commitHomeworkReview(data,'c',a.id,base,values);assert.equal(a.feedback,values.feedback);assert.equal(a.state.value,'discussed');assert.equal(a.reviewDraft,undefined);
 const old=setup().data;assert.equal(normalizeVault(old).homeworkAssignments[0].reviewDraft,undefined);
});
test('review approval preserves untouched incoming fields and requires a fresh explicit approval for overlaps',()=>{
 const {data,a}=setup(),base=homeworkReviewValues(a),local={...base,feedback:'MY PRIVATE REVIEW'};updateHomework(data,a.id,'discussed','', '2026-03-01');commitHomeworkReview(data,'c',a.id,base,local);assert.equal(a.state.value,'discussed');assert.equal(a.dueOn,'2026-03-01');assert.equal(a.feedback,local.feedback);
 const before=homeworkReviewValues(a),changed={...before,feedback:'LOCAL TWO'};a.feedback='REMOTE';assert.throws(()=>commitHomeworkReview(data,'c',a.id,before,changed),/hwReviewConflict/);const acknowledged=homeworkReviewValues(a);a.feedback='REMOTE THREE';assert.throws(()=>commitHomeworkReview(data,'c',a.id,before,changed,acknowledged),/hwReviewConflict/);commitHomeworkReview(data,'c',a.id,before,changed,homeworkReviewValues(a));assert.equal(a.feedback,'LOCAL TWO');
});
test('draft validation, concurrent alternatives and erasure include the complete private pending content',()=>{
 const {data,a}=setup(),left=structuredClone(data),right=structuredClone(data),base=homeworkReviewValues(a);
 saveHomeworkReviewDraft(left,'c',a.id,{base,values:{...base,feedback:'PRIVATE DRAFT LEFT'},savedAt:'2026-01-04T10:00:00Z'});saveHomeworkReviewDraft(right,'c',a.id,{base,values:{...base,feedback:'PRIVATE DRAFT RIGHT'},savedAt:'2026-01-04T11:00:00Z'});stampChanges(data,left,10,'l');stampChanges(data,right,20,'r');const merged=mergeVaults(left,right);assert.ok(JSON.stringify(merged.crdt).includes('PRIVATE DRAFT LEFT'));assert.ok(JSON.stringify(merged.crdt).includes('PRIVATE DRAFT RIGHT'));
 const invalid=structuredClone(merged);invalid.homeworkAssignments[0].reviewDraft!.values.dueOn='2026-02-30';assert.throws(()=>normalizeVault(invalid),/invalidBackup/);
 const erased=structuredClone(merged);deleteClient(erased,'c');stampChanges(merged,erased,30,'erase');assert.ok(!JSON.stringify(mergeVaults(erased,left).crdt).includes('PRIVATE DRAFT'));
});

test('next appointment shortcuts use the practice calendar date and skip cancelled and past appointments',async()=>{
 const {nextHomeworkDue}=await import('../src/lib/homeworkWorkflow');const {data}=setup();data.settings.timeZone='Europe/Berlin';data.appointments.push({id:'next',clientId:'c',date:'2026-01-06',time:'00:30',timeZone:'Europe/Kyiv',duration:50,feeCents:8500,reminderId:'r-next',status:'scheduled'},{id:'cancelled',clientId:'c',date:'2026-01-03',time:'10:00',timeZone:'Europe/Berlin',duration:50,feeCents:8500,reminderId:'r-cancelled',status:'cancelled'});assert.equal(nextHomeworkDue(data,'c',Date.parse('2026-01-02T12:00:00Z')),'2026-01-05');assert.equal(nextHomeworkDue(data,'other',Date.parse('2026-01-02T12:00:00Z')),undefined);
});
