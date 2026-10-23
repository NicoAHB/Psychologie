import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, uid, normalizeVault, type Appointment } from '../src/lib/types';
import { saveWaitingEntry, releaseSlot, freedSlots } from '../src/lib/waitlist';
import { stampChanges, mergeVaults } from '../src/lib/merge';
import { deleteClient } from '../src/lib/records';
import { randomSalt, deriveKey, encryptVault, decryptVault } from '../src/lib/crypto';
import { clientExport } from '../src/lib/clientExport';
import { strFromU8, unzipSync } from 'fflate';
import { hasRecords } from '../src/lib/backupState';
const now='2026-10-23T10:00:00Z';
function setup(){const data=emptyVault();data.clients.push({id:'c',name:'Beispiel',createdAt:'2026-01-01',language:'de',preparation:'',contact:'',telegramChatId:'',reminderConsent:false});return data;}
test('waiting entries are bounded, encrypted and survive legacy defaults, backups and readable subject export',async()=>{
 const data=setup();saveWaitingEntry(data,{id:uid(),name:' Testperson ',preferredTimes:'Montag abends',note:'Terminwunsch',createdAt:now,clientId:'c'});assert.equal(data.waitlist[0].name,'Testperson');assert.equal(hasRecords({...emptyVault(),waitlist:data.waitlist}),true);
 assert.throws(()=>saveWaitingEntry(data,{...data.waitlist[0],name:'x'.repeat(101)}));
 const legacy=structuredClone(data) as Partial<typeof data>;delete legacy.waitlist;assert.deepEqual(normalizeVault(legacy as typeof data).waitlist,[]);
 const salt=randomSalt(),key=await deriveKey('strong test passphrase',salt),envelope=await encryptVault(key,data,uid(),salt);assert.ok(!JSON.stringify(envelope).includes('Montag'));const restored=await decryptVault(key,envelope);assert.deepEqual(restored.waitlist,data.waitlist);
 const files=unzipSync((await clientExport(data,'c','de',async()=>new Blob())).bytes);assert.match(strFromU8(files['warteliste.md']),/Terminwunsch/);
});
test('independent edits merge and linked-client erasure cannot resurrect waiting data',()=>{
 const data=setup();saveWaitingEntry(data,{id:'w',name:'Beispiel',preferredTimes:'Montag',note:'',createdAt:now,clientId:'c'});stampChanges(emptyVault(),data,1,'base');const a=structuredClone(data),b=structuredClone(data);a.waitlist[0].preferredTimes='Dienstag';b.waitlist[0].note='Nachmittags';stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');const joined=mergeVaults(a,b);assert.equal(joined.waitlist[0].preferredTimes,'Dienstag');assert.equal(joined.waitlist[0].note,'Nachmittags');
 const gone=structuredClone(joined);deleteClient(gone,'c');stampChanges(joined,gone,4,'erase');assert.equal(mergeVaults(gone,joined).waitlist.length,0);
 const deleted=structuredClone(joined);deleted.waitlist=[];stampChanges(joined,deleted,5,'drop');assert.equal(mergeVaults(deleted,joined).waitlist.length,0);
});
test('released future slots are deduplicated and disappear when filled, expired or unavailable',()=>{
 const data=setup();const a:Appointment={id:'a',clientId:'c',date:'2026-10-24',time:'14:00',duration:50,timeZone:'Europe/Berlin',feeCents:8500,reminderId:'r',status:'scheduled'};data.appointments.push(a);releaseSlot(a,now);releaseSlot(a,now);assert.equal(a.releasedSlots?.length,1);a.date='2026-10-25';assert.equal(freedSlots(data,Date.parse(now)).length,1);
 data.appointments.push({...a,id:'b',date:'2026-10-24',releasedSlots:[]});assert.equal(freedSlots(data,Date.parse(now)).length,0);data.appointments.pop();data.availability.push({id:'v',kind:'unavailable',title:'',fromDate:'2026-10-24',untilDate:'2026-10-24',allDay:true,timeZone:'Europe/Berlin'});assert.equal(freedSlots(data,Date.parse(now)).length,0);data.availability=[];assert.equal(freedSlots(data,Date.parse('2026-11-01T10:00:00Z')).length,0);
});
