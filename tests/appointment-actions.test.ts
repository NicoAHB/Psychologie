import test from 'node:test';
import assert from 'node:assert/strict';
import {cancelScheduledAppointments} from '../src/lib/appointmentActions';
import {emptyVault,normalizeVault} from '../src/lib/types';
const at='2026-11-04T08:00:00Z';
function setup(){const data=emptyVault();data.clients.push({id:'c',name:'PRIVATE',language:'de',createdAt:'2026-01-01',contact:'',preparation:'',telegramChatId:'',reminderConsent:false});for(const[id,status]of[['next','scheduled'],['other','scheduled'],['done','completed'],['missed','noShow'],['cancelled','cancelled']]as const)data.appointments.push({id,clientId:'c',status,date:'2026-11-05',time:'14:00',timeZone:'Europe/Berlin',duration:50,feeCents:8500,reminderId:id});return data;}
test('cancelling selected future appointments records only their free slots and keeps other records intact',()=>{
 const data=setup(),before=structuredClone(data);assert.equal(cancelScheduledAppointments(data,new Set(['next']),at),1);assert.equal(data.appointments[0].status,'cancelled');assert.equal(data.appointments[0].releasedSlots?.[0].releasedAt,at);assert.deepEqual(data.appointments.slice(1),before.appointments.slice(1));assert.doesNotThrow(()=>normalizeVault(data));
});
test('an old open menu cannot change completed, failed or already cancelled appointments',()=>{
 const data=setup(),frozen=structuredClone(data);assert.throws(()=>cancelScheduledAppointments(data,new Set(['done','missed','cancelled','missing']),at),/appointmentCancelUnavailable/);assert.deepEqual(data,frozen);
 assert.equal(cancelScheduledAppointments(data,new Set(['next','other','done']),at),2);assert.equal(data.appointments.find(a=>a.id==='done')?.status,'completed');
});
test('a past cancellation creates no future vacancy and repeated cancellation is rejected',()=>{
 const data=setup();data.appointments[0].date='2026-11-01';assert.equal(cancelScheduledAppointments(data,new Set(['next']),at),1);assert.equal(data.appointments[0].releasedSlots,undefined);const once=structuredClone(data);assert.throws(()=>cancelScheduledAppointments(data,new Set(['next']),at));assert.deepEqual(data,once);
});
