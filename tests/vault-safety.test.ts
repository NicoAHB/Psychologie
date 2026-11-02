import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { purgeBlobs, getRemovals, readBlob, readVault, writeBlob, writeVault, writeVaultChecked, metaGet } from '../src/lib/db';
import { commitVaultSnapshot, listSnapshots } from '../src/lib/history';
import { sameEnvelope, VaultWindowAccess } from '../src/lib/vaultAccess';
import { backupNeeded, backupSourceId, markBackup, readBackupState } from '../src/lib/backupState';
import { readStorageHealth, storagePressure } from '../src/lib/storageHealth';
import { emptyVault, normalizeVault, uid, type NewsletterDraft, type VaultData, type VaultEnvelope } from '../src/lib/types';
import { deleteNewsletterDraft, saveNewsletterDraft } from '../src/lib/newsletterDrafts';
import { referencedBlobs } from '../src/lib/blobs';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { deleteClient } from '../src/lib/records';
import { syncConflicts } from '../src/lib/crdt';
import { deriveKey, encryptBytes, encryptVault, randomSalt, decryptVault } from '../src/lib/crypto';
import { verifyBackup } from '../src/lib/verifyBackup';
import { clientExport } from '../src/lib/clientExport';
import { strFromU8, unzipSync } from 'fflate';

const envelope = (id = uid()): VaultEnvelope => ({ format:'praxisraum-v1',vaultId:id,salt:'synthetic',iterations:600000,payload:{iv:uid(),ciphertext:'encrypted synthetic contents'} });
test('atomic vault writes reject stale windows, including access-only changes and imports with files', async () => {
  const original = envelope(), first = { ...original, payload: { ...original.payload, iv:uid() } }, stale = { ...original, payload:{ ...original.payload, iv:uid() } };
  await writeVault(original);
  const outcome = await Promise.allSettled([writeVaultChecked(first,original),writeVaultChecked(stale,original)]);
  assert.equal(outcome.filter(r=>r.status==='fulfilled').length,1);
  const stored = await readVault(); assert.ok(sameEnvelope(stored,first) || sameEnvelope(stored,stale));
  await assert.rejects(()=>writeVaultChecked(envelope(),null),/vaultChanged/);
  const changed = { ...stored!, salt:'changed access wrap' }; await writeVaultChecked(changed,stored!);
  await assert.rejects(()=>writeVaultChecked(first,stored!),/vaultChanged/);
  const blob = { id:uid(),vaultId:original.vaultId,payload:{iv:'old',ciphertext:'old encrypted file'} }; await writeBlob(blob);
  await assert.rejects(()=>writeVaultChecked(stale,original,[{...blob,payload:{iv:'replacement',ciphertext:'replacement'}}]),/vaultChanged/);
  assert.deepEqual(await readBlob(blob.id),blob); assert.deepEqual(await readVault(),changed);
  await assert.rejects(()=>purgeBlobs(original.vaultId,[blob.id],original),/vaultChanged/);
  assert.deepEqual(await readBlob(blob.id),blob); assert.ok(!(await getRemovals(original.vaultId)).has(blob.id));
});
test('a failed compare-and-snapshot leaves history and revocation journals untouched',async()=>{
  const original=envelope(), next={...original,payload:{...original.payload,iv:uid()}}; await writeVault(original);
  await commitVaultSnapshot(next,[],100,original,{'synthetic-journal':['one']});
  assert.deepEqual(await metaGet('synthetic-journal'),['one']); const before=await listSnapshots(original.vaultId);
  await assert.rejects(()=>commitVaultSnapshot(original,[],200,original,{'synthetic-journal':['must-not-be-revoked']}),/vaultChanged/);
  assert.deepEqual(await metaGet('synthetic-journal'),['one']); assert.deepEqual(await listSnapshots(original.vaultId),before); assert.deepEqual(await readVault(),next);
});
test('window access is exclusive, releases deliberately, and falls back to atomic comparisons without Web Locks',async()=>{
  let held=false;
  const manager={ request: async (_name: string,_options: unknown,run:(lock:object|null)=>Promise<void>)=>{ if(held)return run(null);held=true;try{await run({});}finally{held=false;} } } as unknown as LockManager;
  const first=new VaultWindowAccess(), second=new VaultWindowAccess(); await first.acquire(manager);
  await assert.rejects(()=>second.acquire(manager),/vaultInUse/); first.release(); await new Promise(resolve=>setTimeout(resolve,0));
  await second.acquire(manager); second.release(); await new Promise(resolve=>setTimeout(resolve,0));
  await new VaultWindowAccess().acquire(undefined);
});
test('backup coverage follows the exported encrypted version, not the completion time or a backwards clock',async()=>{
  const saved=envelope(), source=backupSourceId(saved), later={...saved,payload:{...saved.payload,iv:uid()}};
  const at=1000000000;await markBackup(saved.vaultId,'download',at,source);
  const state=await readBackupState(saved.vaultId);assert.equal(backupNeeded(state,at-1,true,at+8*864e5,source).needed,false);
  assert.equal(backupNeeded(state,at-1,true,at+8*864e5,backupSourceId(later)).needed,true);
  assert.notEqual(backupSourceId({...saved,salt:'new access'}),source);
  assert.equal(backupNeeded({at,kind:'auto'},at+1,true,at+8*864e5).needed,true);
});
test('storage estimates distinguish pressure, projected large files and unavailable browser APIs',async()=>{
  const MiB=1048576;
  assert.equal(storagePressure({usage:100*MiB,quota:1000*MiB}),'ok');
  assert.equal(storagePressure({usage:810*MiB,quota:1000*MiB}),'low');
  assert.equal(storagePressure({usage:900*MiB,quota:1000*MiB},60*MiB),'critical');
  for(const health of [{},{usage:0,quota:0},{usage:-1,quota:100},{usage:1,quota:NaN}])assert.equal(storagePressure(health),'unknown');
  assert.deepEqual(await readStorageHealth({estimate:async()=>{throw new Error('not available');},persisted:async()=>{throw new Error('not available');}}),{});
  assert.deepEqual(await readStorageHealth({estimate:async()=>({usage:123,quota:456}),persisted:async()=>true}),{usage:123,quota:456,persisted:true});
});

function fixture(){
  const data=emptyVault(), client={id:uid(),name:'Synthetic Alpha',language:'de' as const,createdAt:'2026-01-01',contact:'',telegramChatId:'',reminderConsent:false,preparation:''};
  data.clients.push(client,{...client,id:uid(),name:'Synthetic Beta'});
  const draft:NewsletterDraft={id:uid(),createdAt:'2026-01-01T12:00:00Z',savedAt:'2026-01-01T12:00:00Z',payload:{channel:'both',title:'Nur ein Test',titleUk:'Тест',content:'Vertraulicher Entwurf',contentUk:'Приватна чернетка',clientIds:data.clients.map(c=>c.id),image:{blobId:uid(),fileName:'newsletter.webp',mimeType:'image/webp',size:3}}};
  return {data,client,draft};
}
test('old vaults receive empty newsletter drafts; validation and recipient cleanup happen before encrypted persistence',()=>{
  const {data,draft}=fixture(); const old=structuredClone(data); delete(old as Partial<VaultData>).newsletterDrafts; assert.deepEqual(normalizeVault(old).newsletterDrafts,[]);
  draft.payload.clientIds.push('missing');saveNewsletterDraft(data,draft);assert.equal(data.newsletterDrafts[0].payload.clientIds.length,2);
  assert.throws(()=>saveNewsletterDraft(data,{...draft,payload:{...draft.payload,title:'x'.repeat(181)}}),/required/);
  data.deleted[draft.id]=1;assert.throws(()=>saveNewsletterDraft(data,draft),/newsletterDraftDeleted/);
});
test('concurrent newsletter drafts merge with conflicting pictures retained; discarded drafts do not reappear',()=>{
  const {data,draft}=fixture();saveNewsletterDraft(data,draft);stampChanges(emptyVault(),data,1,'base');
  const a=structuredClone(data),b=structuredClone(data);a.newsletterDrafts[0].payload.content='Laptop';b.newsletterDrafts[0].payload.image!.blobId=uid();
  stampChanges(data,a,2,'laptop');stampChanges(data,b,2,'tablet');const joined=mergeVaults(a,b);
  assert.ok(syncConflicts(joined).some(c=>c.collection==='newsletterDrafts'));assert.equal(referencedBlobs(joined).length,2);
  const before=structuredClone(joined);deleteNewsletterDraft(joined,draft.id);stampChanges(before,joined,3,'laptop');const erased=mergeVaults(joined,b);
  assert.equal(erased.newsletterDrafts.length,0);assert.deepEqual(referencedBlobs(erased),[]);
});
test('client deletion removes draft recipient IDs, including hidden conflicting payloads and stale devices',()=>{
  const {data,client,draft}=fixture();saveNewsletterDraft(data,draft);stampChanges(emptyVault(),data,1,'base');
  const old=structuredClone(data),before=structuredClone(data);deleteClient(data,client.id);stampChanges(before,data,2,'a');const merged=mergeVaults(data,old);
  assert.ok(!JSON.stringify(merged.newsletterDrafts).includes(client.id));
  assert.ok(!JSON.stringify(Object.entries(merged.crdt!.entities).filter(([k])=>k.includes('newsletterDrafts'))).includes(client.id));
});
test('encrypted backup and snapshot round-trips include newsletter images; client export never reveals other recipient IDs',async()=>{
  const {data,client,draft}=fixture();saveNewsletterDraft(data,draft);stampChanges(emptyVault(),data,1,'base');
  const salt=randomSalt(),key=await deriveKey('Synthetic backup passphrase',salt),vaultId=uid(), encrypted=await encryptVault(key,data,vaultId,salt);
  const bytes=new Uint8Array([1,2,3]),file=draft.payload.image!;
  const blob={id:file.blobId,vaultId,payload:await encryptBytes(key,bytes,`praxisraum-blob:v1:${vaultId}:${file.blobId}`)};
  const backup={type:'praxisraum-backup-v1',envelope:encrypted,blobs:[blob]};assert.ok(!JSON.stringify(backup).includes(draft.payload.content));
  assert.equal((await verifyBackup(backup,'Synthetic backup passphrase')).files,1);assert.deepEqual((await decryptVault(key,encrypted)).newsletterDrafts,data.newsletterDrafts);
  await writeVault(encrypted);await commitVaultSnapshot(encrypted,referencedBlobs(data),Date.now(),encrypted);assert.ok((await listSnapshots(vaultId))[0].blobIds?.includes(file.blobId));
  const exported=await clientExport(data,client.id,'de',async()=>new Blob([bytes]));const archive=unzipSync(exported.bytes),json=JSON.parse(strFromU8(archive['daten.json']));
  assert.deepEqual(json.newsletterDrafts[0].payload.clientIds,[client.id]);assert.ok(!strFromU8(archive['daten.json']).includes(data.clients[1].id));assert.deepEqual(archive[`newsletter-entwuerfe/${draft.id}.webp`],bytes);
});
