import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { emptyVault, uid, normalizeVault, type VaultData, type Appointment, type Client } from '../src/lib/types';
import { cancellationDefault, failurePricing, recordAppointmentFailure } from '../src/lib/cancellations';
import { completeAndPay } from '../src/lib/practiceFlow';
import { stampChanges, mergeVaults } from '../src/lib/merge';
import { syncConflicts } from '../src/lib/crdt';
import { deleteSession, deleteClient } from '../src/lib/records';
import { encryptVault, deriveKey, randomSalt, decryptVault } from '../src/lib/crypto';
import { clientExport } from '../src/lib/clientExport';
import { hasAppointmentEmailConsent, prepareAppointmentEmail, dispatchAppointmentEmail, emailReminderDue } from '../src/lib/appointmentEmail';
import { createEmailHandler, type EmailEnvironment } from '../supabase/functions/send-client-email/handler';
import type { VaultController } from '../src/lib/useVault';
const now = '2026-10-23T16:30:00.000Z';
function setup() {
  const data = emptyVault(); const client: Client = { id: uid(), name: 'Testperson', createdAt: '2026-01-01', language: 'uk', preparation: 'SECRET-NOTE', contact: '', email: 'test@example.com', telegramChatId: '', reminderConsent: false, currency: 'UAH', timeZone: 'Europe/Kyiv' };
  data.clients.push(client); data.settings.defaultCancellationFeeCents = 3000; data.settings.exchangeRate = { micros: 48000000, date: '2026-10-23', source: 'manual' };
  const appointment: Appointment = { id: uid(), clientId: client.id, date: '2026-10-24', time: '14:00', duration: 50, timeZone: 'Europe/Berlin', reminderId: uid(), status: 'scheduled' as const, feeCents: 8500, billing: { currency: 'UAH' as const, amountCents: 408000, rate: data.settings.exchangeRate } }; data.appointments.push(appointment);
  return { data, client, appointment };
}
function fakeVault(data: VaultData, afterWrite?: () => void) {
  const key = {} as CryptoKey; return { demo: false, getData: () => data, getKey: () => key, update: async (fn: (data: VaultData) => void) => { fn(data); afterWrite?.(); } } as Pick<VaultController,'demo'|'getData'|'getKey'|'update'>;
}
test('failure charges use defaults or explicit client overrides including zero and never mark a clinical appointment completed', () => {
  const { data, client, appointment } = setup(); assert.equal(failurePricing(data, appointment).billing.amountCents, 144000);
  client.cancellationFee = { currency: 'UAH', amountCents: 90000 }; const price = failurePricing(data, appointment); assert.equal(price.billing.amountCents, 90000);
  recordAppointmentFailure(data, appointment.id, 'noShow', price); assert.equal(data.appointments[0].status,'noShow'); assert.equal(data.sessions[0].paidAt,null); assert.equal(data.sessions[0].kind,'cancellationFee');
  assert.throws(() => recordAppointmentFailure(data,appointment.id,'lateCancelled',price));
  deleteSession(data,data.sessions[0].id); assert.equal(data.appointments[0].status,'scheduled');
  client.currency='EUR'; delete data.appointments[0].billing; assert.equal(failurePricing(data,data.appointments[0]).billing.currency,'EUR'); assert.equal(failurePricing(data,data.appointments[0]).billing.amountCents,1900);
  client.cancellationFee.amountCents = 0; assert.equal(cancellationDefault(data,data.appointments[0]).value,0); recordAppointmentFailure(data,appointment.id,'lateCancelled'); assert.equal(data.sessions.length,0); assert.equal(data.appointments[0].status,'lateCancelled');
});
test('fee metadata and unpaid state survive encrypted backups, client export, deletion and offline financial conflicts', async () => {
  const { data, appointment } = setup(); stampChanges(emptyVault(),data,1,'base'); const a=structuredClone(data),b=structuredClone(data);
  recordAppointmentFailure(a,appointment.id,'noShow',failurePricing(a,a.appointments[0])); completeAndPay(b,appointment.id,'cash'); stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');const merged=mergeVaults(a,b);assert.equal(merged.sessions.length,1);assert.ok(syncConflicts(merged).some(c=>c.field==='$amount'));
  const salt=randomSalt(),key=await deriveKey('strong test passphrase',salt),env=await encryptVault(key,a,uid(),salt); assert.ok(!JSON.stringify(env).includes('cancellationFee')); const restored=await decryptVault(key,env);assert.equal(restored.sessions[0].failureStatus,'noShow');
  const files=unzipSync((await clientExport(restored,restored.clients[0].id,'de',async()=>new Blob())).bytes);assert.match(strFromU8(files['sitzungen.md']),/Ausfallhonorar/);assert.match(strFromU8(files['daten.json']),/cancellationFee/);
  const gone=structuredClone(a);deleteClient(gone,gone.clients[0].id);stampChanges(a,gone,4,'erase');assert.equal(mergeVaults(gone,a).sessions.length,0);
  const legacy=emptyVault();assert.equal(normalizeVault(legacy).settings.defaultCancellationFeeCents,undefined);
});
test('appointment email opt-in is separate, destination-bound, revocation wins concurrent grants', () => {
  const {data,client}=setup();assert.equal(hasAppointmentEmailConsent(client),false);
  client.appointmentEmailConsent={id:uid(),destination:client.email!,grantedAt:now};assert.equal(hasAppointmentEmailConsent(client),true);
  const other=structuredClone(data);other.clients[0].email='other@example.com';assert.equal(hasAppointmentEmailConsent(other.clients[0]),false);
  stampChanges(emptyVault(),data,1,'base');const a=structuredClone(data),b=structuredClone(data);a.clients[0].appointmentEmailConsent!.revokedAt=now;b.clients[0].appointmentEmailConsent!.grantedAt='2026-10-23T16:31:00Z';stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');assert.equal(hasAppointmentEmailConsent(mergeVaults(a,b).clients[0]),false);
});
test('localized appointment email has a minimal UTC calendar and stable exact-byte retry across devices',async()=>{
  const {data,client,appointment}=setup();client.appointmentEmailConsent={id:uid(),destination:client.email!,grantedAt:now};
  const first=await prepareAppointmentEmail(data,appointment.id,'appointmentConfirmation',now);assert.match(first.subject,/Підтвердження/);assert.match(first.calendar,/DTSTART:20261024T120000Z/);assert.ok(!JSON.stringify(first).includes('SECRET-NOTE'));assert.ok(!first.body.includes('4080'));
  appointment.emailDeliveries=[first];const again=await prepareAppointmentEmail(data,appointment.id,'appointmentConfirmation','2026-10-23T17:00:00Z');assert.deepEqual(first,again);
  const v=fakeVault(data);let calls=0;const transport=async()=>{calls++;return{providerId:'test',acceptedAt:now};};await dispatchAppointmentEmail(v,appointment.id,'appointmentConfirmation',{now,transport});await dispatchAppointmentEmail(v,appointment.id,'appointmentConfirmation',{now,transport});assert.equal(calls,1);assert.equal(appointment.emailDeliveries[0].state,'sent');
});
test('uncertain email persists before sending, never retries automatically or beyond provider retry window',async()=>{
  const {data,client,appointment}=setup();client.appointmentEmailConsent={id:uid(),destination:client.email!,grantedAt:now};const v=fakeVault(data);let calls=0;
  const transport=async()=>{calls++;assert.equal(data.appointments[0].emailDeliveries?.[0].state,'sending');throw new Error('network');};
  await assert.rejects(dispatchAppointmentEmail(v,appointment.id,'appointmentConfirmation',{now,transport}));assert.equal(appointment.emailDeliveries?.[0].state,'unknown');
  await assert.rejects(dispatchAppointmentEmail(v,appointment.id,'appointmentConfirmation',{now,automatic:true,transport}),/appointmentEmailUnknown/);
  // Still before the appointment but beyond 23 hours from the first attempt.
  await assert.rejects(dispatchAppointmentEmail(v,appointment.id,'appointmentConfirmation',{now:'2026-10-24T16:00:00Z',transport}));assert.equal(calls,1);
});
test('consent revoked after durable reservation prevents all transport; no permission means zero requests',async()=>{
  const {data,client,appointment}=setup();let calls=0;const transport=async()=>{calls++;return{providerId:'test',acceptedAt:now};};
  await assert.rejects(dispatchAppointmentEmail(fakeVault(data),appointment.id,'appointmentConfirmation',{now,transport}),/appointmentEmailConsentMissing/);
  client.appointmentEmailConsent={id:uid(),destination:client.email!,grantedAt:now};await assert.rejects(dispatchAppointmentEmail(fakeVault(data,()=>{client.appointmentEmailConsent!.revokedAt=now;}),appointment.id,'appointmentConfirmation',{now,transport}));assert.equal(calls,0);
});
test('email reminder window is the previous calendar day at 18h, including DST; no next-day catch-up',()=>{
  const {appointment}=setup();assert.equal(emailReminderDue(appointment,Date.parse('2026-10-23T15:59:00Z')),false);assert.equal(emailReminderDue(appointment,Date.parse(now)),true);assert.equal(emailReminderDue(appointment,Date.parse('2026-10-23T22:00:00Z')),false);
  appointment.date='2026-10-26';assert.equal(emailReminderDue(appointment,Date.parse('2026-10-25T16:59:00Z')),false);assert.equal(emailReminderDue(appointment,Date.parse('2026-10-25T17:00:00Z')),true);
});
test('existing email edge handler accepts only a constrained calendar and rejects active calendar components',async()=>{
  const env:EmailEnvironment={APP_ORIGIN:'https://app.example',EMAIL_OWNER_USER_ID:'owner',EMAIL_FROM:'test@example.com',RESEND_API_KEY:'fake',SUPABASE_URL:'https://test.example',SUPABASE_ANON_KEY:'fake'};let sends=0;
  const handler=createEmailHandler(env,(async(url:RequestInfo|URL)=>String(url).includes('/auth/v1/user')?Response.json({id:'owner'}):(sends++,Response.json({id:'fake-provider'}))) as typeof fetch);
  const {data,client,appointment}=setup();client.appointmentEmailConsent={id:uid(),destination:client.email!,grantedAt:now};const email=await prepareAppointmentEmail(data,appointment.id,'appointmentConfirmation',now);
  const request=(calendar:string)=>new Request('https://edge.example',{method:'POST',headers:{origin:env.APP_ORIGIN!,authorization:'Bearer fake','Content-Type':'application/json'},body:JSON.stringify({requestId:email.id,to:email.recipient,subject:email.subject,text:email.body,attachment:{filename:'termin.ics',contentType:'text/calendar',content:btoa(unescape(encodeURIComponent(calendar)))}})});
  assert.equal((await handler(request(email.calendar))).status,200);assert.equal((await handler(request(email.calendar.replace('BEGIN:VEVENT','BEGIN:VALARM')))).status,400);assert.equal(sends,1);
});

test('choosing a competing fee variant resolves its appointment outcome as one reviewed decision',async()=>{
 const {resolvePracticeConflict}=await import('../src/lib/practiceConflicts');const {data,appointment}=setup();stampChanges(emptyVault(),data,1,'base');const a=structuredClone(data),b=structuredClone(data);recordAppointmentFailure(a,appointment.id,'noShow',failurePricing(a,a.appointments[0]));completeAndPay(b,appointment.id,'cash');stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');
 const merged=mergeVaults(a,b),before=structuredClone(merged),financial=syncConflicts(merged).find(c=>c.collection==='sessions'&&c.field==='$amount')!;
 const missed=financial.variants.find(v=>v.value&&typeof v.value==='object'&&!Array.isArray(v.value)&&v.value.kind==='cancellationFee')!;resolvePracticeConflict(merged,financial,missed);assert.equal(merged.sessions[0].kind,'cancellationFee');assert.equal(merged.sessions[0].paidAt,null);assert.equal(merged.appointments[0].status,'noShow');
 stampChanges(before,merged,4,'review');const old=mergeVaults(merged,b);assert.equal(old.appointments[0].status,'noShow');assert.equal(old.sessions[0].kind,'cancellationFee');assert.equal(syncConflicts(old).filter(c=>c.collection==='sessions'&&c.field==='$amount').length,0);
});
test('a conflicting no-charge cancellation cannot silently contradict a completed paid record',async()=>{
 const {resolvePracticeConflict}=await import('../src/lib/practiceConflicts');const {data,appointment}=setup();stampChanges(emptyVault(),data,1,'base');const a=structuredClone(data),b=structuredClone(data);recordAppointmentFailure(a,appointment.id,'noShow');completeAndPay(b,appointment.id,'cash');stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');const merged=mergeVaults(a,b),conflict=syncConflicts(merged).find(c=>c.collection==='appointments'&&c.field==='status')!;const missed=conflict.variants.find(v=>v.value==='noShow')!,before=JSON.stringify(merged);assert.throws(()=>resolvePracticeConflict(merged,conflict,missed),/syncConflictOutcomeMismatch/);assert.equal(JSON.stringify(merged),before);assert.equal(merged.sessions[0].paidAt!==null,true);
});
