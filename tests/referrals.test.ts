import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { emptyVault, normalizeVault, uid, type Client, type Session } from '../src/lib/types';
import { registerReferral, reconcileReferralStarts, referralRows, referralEndInclusive, recordReferralPayout, reverseReferralPayout, lastCompletedQuarter, referralHasConflicts, rewardCents, clientReferralExport, resolveReferralCode, restoreReferralPayouts, referralMoney } from '../src/lib/referrals';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { syncConflicts } from '../src/lib/crdt';
import { deleteClient, deleteSession } from '../src/lib/records';
import { encryptVault, decryptVault, deriveKey, randomSalt } from '../src/lib/crypto';
import { clientExport } from '../src/lib/clientExport';
import { issueReferralCode } from '../src/lib/referralCodes';
import { overrideCloud } from '../src/lib/cloud';
const code = 'PRX-ABCDEF123456';
function setup() {
  const data=emptyVault(); const referrer: Client={id:uid(),name:'Do not disclose referrer name',createdAt:'2026-01-01',language:'de',preparation:'',contact:'',telegramChatId:'',reminderConsent:false};
  const referred={...referrer,id:uid(),name:'Never disclose referred name'};
  data.clients.push(referrer,referred); data.referralCodes.push({id:uid(),clientId:referrer.id,code,createdAt:'2026-01-01T12:00:00Z'});
  registerReferral(data,referred.id,code,true,'uk','2026-01-02T12:00:00Z');
  return {data,referrer,referred,referral:data.referrals[0]};
}
function session(clientId:string,paidAt:string|null,amount=8500,currency:'EUR'|'UAH'='EUR'):Session{return{id:uid(),clientId,date:'2026-01-03',time:'14:00',feeCents:8500,paidAt,notes:'',tags:[],billing:{currency,amountCents:amount}};}

test('optional code is normalized; consent, self-referral, duplicate assignments and revocation are enforced',()=>{
  const {data,referrer,referred}=setup(); assert.equal(resolveReferralCode(data,' prx-abcdef123456 ').clientId,referrer.id);
  assert.throws(()=>resolveReferralCode(data,code,referrer.id),/referralSelf/);
  const other={...referred,id:uid()};data.clients.push(other);
  assert.throws(()=>registerReferral(data,other.id,code,false,'de'),/referralConsentRequired/);
  registerReferral(data,other.id,'',false,'de');assert.equal(data.referrals.length,1);
  assert.throws(()=>registerReferral(data,referred.id,code,true,'de'),/referralAlreadyAssigned/);
  data.referralCodes[0].revokedAt='2026-01-03';assert.throws(()=>resolveReferralCode(data,code),/referralInvalidCode/);
  assert.equal(data.referrals[0].consentLanguage,'uk'); assert.equal(data.referrals[0].rateBps,1000);
});
test('first PAYMENT fixes inclusive twelve calendar months, including leap day; pause or payment reversal never resets clock',()=>{
  const {data,referred,referral}=setup();data.sessions.push(session(referred.id,'2024-02-29'));reconcileReferralStarts(data);
  assert.equal(referral.firstPaidOn,'2024-02-29');assert.equal(referralEndInclusive(referral),'2025-02-27');
  data.sessions[0].paidAt=null;referred.status='paused';reconcileReferralStarts(data);assert.equal(referral.firstPaidOn,'2024-02-29');
  data.sessions.push(session(referred.id,'2025-02-28'));referred.status='active';reconcileReferralStarts(data);
  assert.equal(referralRows(data,'2025-03-01')[0].revenueCents,0);assert.equal(referralRows(data,'2025-03-01')[0].status,'expired');
});
test('only paid non-void sessions in payment window count; EUR and UAH never mix and future payments are excluded',()=>{
  const {data,referred,referral}=setup();
  data.sessions.push(session(referred.id,'2026-02-01'),session(referred.id,'2027-01-31'),session(referred.id,'2027-02-01'),session(referred.id,null),session(referred.id,'2026-02-02',400000,'UAH'),session(referred.id,'2028-01-01'));
  reconcileReferralStarts(data);assert.equal(referral.firstPaidOn,'2026-02-01');
  const rows=referralRows(data,'2027-02-02');assert.equal(rows.find(r=>r.currency==='EUR')!.revenueCents,17000);assert.equal(rows.find(r=>r.currency==='UAH')!.rewardCents,40000);
  data.invoices.push({id:'cancel',kind:'cancellation',cancels:{id:'original',number:'A',issuedAt:'2026-02-01'},number:'B',clientId:referred.id,issuedAt:'2026-02-02',lines:[],totalCents:0,recipient:{name:'',address:''},sender:data.settings.practice,language:'de'});
  data.sessions[0].invoiceId='original';assert.equal(referralRows(data,'2026-02-28').find(r=>r.currency==='EUR')?.revenueCents ?? 0,0);
});
test('central term changes affect new registrations, never existing referrals; integer rounding is cumulative',()=>{
  const {data,referred,referral}=setup();data.settings.referralProgram={rateBps:1500,months:6};assert.equal(referral.rateBps,1000);
  const client={...referred,id:uid()};data.clients.push(client);registerReferral(data,client.id,code,true,'de');assert.equal(data.referrals[1].months,6);
  assert.equal(rewardCents(8500,1000),850);assert.equal(rewardCents(5,1000),1);assert.equal(rewardCents(4,1000),0);
  assert.throws(()=>rewardCents(Number.MAX_SAFE_INTEGER+1,1000),/referralInvalidAmount/);
});
test('quarterly payouts are idempotent, reversals auditable and refunds offset future rewards without erasing ledger entries',()=>{
  const {data,referred,referrer}=setup();data.sessions.push(session(referred.id,'2026-02-01'));reconcileReferralStarts(data);
  assert.equal(lastCompletedQuarter('2026-04-01'),'2026-03-31');assert.equal(lastCompletedQuarter('2026-01-01'),'2025-12-31');
  const p=recordReferralPayout(data,referrer.id,'EUR','2026-04-01','2026-04-01');assert.equal(p.amountCents,850);
  assert.throws(()=>recordReferralPayout(data,referrer.id,'EUR','2026-04-01','2026-04-01'),/referralPayoutBlocked/);
  data.sessions[0].paidAt=null;assert.equal(referralRows(data,'2026-05-01')[0].openCents,-850);
  data.sessions.push(session(referred.id,'2026-05-02',17000));assert.equal(recordReferralPayout(data,referrer.id,'EUR','2026-07-01','2026-07-01').amountCents,850);
  reverseReferralPayout(data,p.id,'2026-07-01');assert.equal(data.referralPayouts.length,3);assert.equal(data.referralPayouts[2].amountCents,-850);
  assert.throws(()=>reverseReferralPayout(data,p.id),/referralPayoutBlocked/);
});
test('concurrent offline payout bookings share one ID; differing records remain conflicts and block more payouts',()=>{
  const {data,referred,referrer}=setup();data.sessions.push(session(referred.id,'2026-02-01'));reconcileReferralStarts(data);stampChanges(emptyVault(),data,1,'base');
  const a=structuredClone(data),b=structuredClone(data);
  recordReferralPayout(a,referrer.id,'EUR','2026-04-02','2026-04-02');recordReferralPayout(b,referrer.id,'EUR','2026-04-03','2026-04-03');stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');
  const merged=mergeVaults(a,b);assert.equal(merged.referralPayouts.length,1);assert.equal(referralHasConflicts(merged),true);assert.ok(syncConflicts(merged).some(c=>c.collection==='referralPayouts'));
  assert.throws(()=>recordReferralPayout(merged,referrer.id,'EUR','2026-07-01','2026-07-01'),/referralPayoutBlocked/);
});
test('concurrent first payments choose earliest date; unrelated fields, codes and terms survive symmetric merges',()=>{
  const {data,referred}=setup();stampChanges(emptyVault(),data,1,'base');const a=structuredClone(data),b=structuredClone(data);
  a.sessions.push(session(referred.id,'2026-03-01'));b.sessions.push(session(referred.id,'2026-02-01'));reconcileReferralStarts(a);reconcileReferralStarts(b);stampChanges(data,a,2,'a');stampChanges(data,b,3,'b');
  const ab=mergeVaults(a,b),ba=mergeVaults(b,a);assert.equal(ab.referrals[0].firstPaidOn,'2026-02-01');assert.equal(ba.referrals[0].firstPaidOn,'2026-02-01');assert.deepEqual(ab.referralCodes,ba.referralCodes);assert.equal(ab.sessions.length,2);assert.equal(referralHasConflicts(ab),false);
});
test('deleting a client removes links and hidden CRDT snapshots; stale devices cannot resurrect the relationship',()=>{
  const {data,referrer,referred}=setup();data.sessions.push(session(referred.id,'2026-02-01'));reconcileReferralStarts(data);recordReferralPayout(data,referrer.id,'EUR','2026-04-01','2026-04-01');stampChanges(emptyVault(),data,1,'base');
  const gone=structuredClone(data);deleteClient(gone,referred.id);stampChanges(data,gone,2,'delete');const merged=mergeVaults(gone,data);
  assert.equal(merged.referrals.length,0);assert.equal(merged.referralPayouts[0].amountCents,850);assert.equal(merged.referralPayouts[0].allocations.length,0);
  assert.ok(!JSON.stringify(merged.crdt).includes(referred.name));
  const snapshots=Object.entries(merged.crdt!.entities).filter(([key])=>JSON.parse(key)[0]==='referrals');assert.ok(snapshots.every(([,fields])=>!fields.$snapshot));
  const referrerGone=structuredClone(data);deleteClient(referrerGone,referrer.id);stampChanges(data,referrerGone,2,'delete-other');const final=mergeVaults(referrerGone,data);assert.equal(final.referralCodes.length,0);assert.equal(final.referralPayouts.length,0);
});
test('session deletion corrects current revenue while first payment and historical payouts remain fixed',()=>{
  const {data,referred,referrer}=setup();const s=session(referred.id,'2026-02-01');data.sessions.push(s);reconcileReferralStarts(data);recordReferralPayout(data,referrer.id,'EUR','2026-04-01','2026-04-01');deleteSession(data,s.id);reconcileReferralStarts(data);assert.equal(data.referrals[0].firstPaidOn,'2026-02-01');assert.equal(referralRows(data,'2026-05-01')[0].openCents,-850);
});
test('legacy vault defaults and encrypted backup round-trip preserve all referral records and cent-valued rewards',async()=>{
  const {data,referred,referrer}=setup();data.sessions.push(session(referred.id,'2026-02-01'));reconcileReferralStarts(data);recordReferralPayout(data,referrer.id,'EUR','2026-04-01','2026-04-01');
  const legacy=structuredClone(data) as Partial<typeof data>;delete legacy.referralCodes;delete legacy.referrals;delete legacy.referralPayouts;assert.deepEqual(normalizeVault(legacy as typeof data).referrals,[]);
  const salt=randomSalt(),key=await deriveKey('a long test passphrase',salt),env=await encryptVault(key,data,uid(),salt);assert.ok(!JSON.stringify(env).includes(code));const restored=await decryptVault(key,env);assert.deepEqual(restored.referrals,data.referrals);assert.equal(restored.referralPayouts[0].amountCents,850);
});
test('client export contains own code and payouts, never other clients IDs, names, sessions or allocation IDs',async()=>{
  const {data,referred,referrer,referral}=setup();data.sessions.push(session(referred.id,'2026-02-01'));reconcileReferralStarts(data);recordReferralPayout(data,referrer.id,'EUR','2026-04-01','2026-04-01');
  const projection=JSON.stringify(clientReferralExport(data,referrer.id));assert.ok(!projection.includes(referred.id));assert.ok(!projection.includes(referral.id));
  const zip=await clientExport(data,referrer.id,'de',async()=>new Blob());const files=unzipSync(zip.bytes);const json=strFromU8(files['empfehlungen.json']);assert.ok(json.includes(code));assert.ok(!json.includes(referred.id));assert.ok(!strFromU8(files['daten.json']).includes(referred.name));
});
test('code issuance sends only vault UUID and a one-way digest, validates server response and never supplies its own code',async()=>{
  let sent:unknown;overrideCloud({rpc:async(name:string,args:unknown)=>{assert.equal(name,'issue_referral_code');sent=args;return{data:{id:uid(),code,created_at:'2026-01-01T00:00:00Z'},error:null};}});
  const vaultId=uid(),clientId=uid(),created=await issueReferralCode(vaultId,clientId);assert.equal(created.clientId,clientId);const args=sent as Record<string,string>;assert.equal(args.p_vault_id,vaultId);assert.match(args.p_subject_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(sent).includes(clientId));assert.deepEqual(Object.keys(args).sort(),['p_subject_hash','p_vault_id']);overrideCloud(null);
});

test('in-app snapshot restore retains payouts and reversals, while whole values omit unnecessary zero decimals',()=>{
  const {data,referred,referrer}=setup();data.sessions.push(session(referred.id,'2026-02-01'));reconcileReferralStarts(data);const original=recordReferralPayout(data,referrer.id,'EUR','2026-04-01','2026-04-01');const older=structuredClone(data.referralPayouts);reverseReferralPayout(data,original.id,'2026-04-02');
  const restored=restoreReferralPayouts(data.referralPayouts,older);assert.equal(restored.length,2);assert.equal(restored.reduce((s,p)=>s+p.amountCents,0),0);assert.equal(restoreReferralPayouts(restored,[]).length,2);assert.match(referralMoney(850,'de','EUR'),/8,50/);assert.ok(!referralMoney(40000,'de','UAH').includes(',00'));
});
