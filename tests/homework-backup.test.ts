import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, uid } from '../src/lib/types';
import { builtinHomework } from '../src/lib/homeworkCatalog';
import { assignHomework, attachHomeworkDocument, homeworkDocumentId } from '../src/lib/homework';
import { decryptBytes, decryptVault, deriveKey, encryptBytes, encryptVault, randomSalt } from '../src/lib/crypto';
import { referencedBlobs } from '../src/lib/blobs';
import { verifyBackup } from '../src/lib/verifyBackup';
import { recordSnapshot, readSnapshot, historyBlobIds } from '../src/lib/history';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { deleteClient } from '../src/lib/records';
import { clientExport } from '../src/lib/clientExport';
import { strFromU8, unzipSync } from 'fflate';
import { homeworkReviewValues } from '../src/lib/homeworkReview';

test('homework originals, returns, templates survive a fully encrypted backup and history round trip',async()=>{
  const data=emptyVault(),vaultId=uid(),salt=randomSalt(),passphrase='A private test-only backup passphrase';const key=await deriveKey(passphrase,salt);
  data.clients.push({id:'c',name:'PRIVATE CLIENT',language:'uk',createdAt:'2026-01-01',contact:'',preparation:'',telegramChatId:'',reminderConsent:false});
  const snapshot=structuredClone(builtinHomework('uk')[0].snapshot);snapshot.content.steps='PRIVATE ORIGINAL TASK';snapshot.practiceLog=true;
  const assignment=assignHomework(data,'c',{id:'assigned',snapshot,returnExpected:true});assignment.feedback='PRIVATE REVIEW';
  const base=homeworkReviewValues(assignment);assignment.reviewDraft={base,values:{...base,feedback:'PRIVATE PENDING REVIEW'},savedAt:'2026-01-04T12:00:00Z'};
  data.homeworkTemplates.push({id:'own',createdAt:'2026-01-01T12:00:00Z',snapshot:{category:'goals',version:'v1',content:{uk:snapshot.content}}});
  attachHomeworkDocument(data,assignment.id,{id:homeworkDocumentId(assignment.id),clientId:'c',homeworkAssignmentId:assignment.id,homeworkSnapshot:snapshot,title:snapshot.content.title,createdAt:'2026-01-02T12:00:00Z',file:{blobId:'original',mimeType:'application/pdf',fileName:'original.pdf',size:21},deliveries:[],returnExpected:true,returns:[{id:'r',receivedOn:'2026-01-03',uploadedAt:'2026-01-03T12:00:00Z',file:{blobId:'returned',mimeType:'application/pdf',fileName:'returned.pdf',size:21}}]});
  const bytes=new TextEncoder().encode('%PDF-private contents');const blobs=await Promise.all(referencedBlobs(data).map(async id=>({id,vaultId,payload:await encryptBytes(key,bytes,`praxisraum-blob:v1:${vaultId}:${id}`)})));
  const envelope=await encryptVault(key,data,vaultId,salt);const wire=JSON.stringify({type:'praxisraum-backup-v1',envelope,blobs});assert.ok(!wire.includes('PRIVATE'));assert.ok(!wire.includes('%PDF-'));
  const checked=await verifyBackup(JSON.parse(wire),passphrase);assert.equal(checked.files,2);assert.equal(checked.clients,1);await assert.rejects(()=>verifyBackup({type:'praxisraum-backup-v1',envelope,blobs:blobs.slice(1)},passphrase),/invalidBackup/);
  const restored=await decryptVault(key,envelope);assert.deepEqual(restored.homeworkAssignments,data.homeworkAssignments);assert.deepEqual(restored.homeworkTemplates,data.homeworkTemplates);
  for(const blob of blobs)assert.deepEqual(await decryptBytes(key,blob.payload,`praxisraum-blob:v1:${vaultId}:${blob.id}`),bytes);
  await recordSnapshot(envelope,true,1234,referencedBlobs(data));assert.deepEqual(await historyBlobIds(vaultId),new Set(['original','returned']));const historical=await decryptVault(key,(await readSnapshot(vaultId,1234))!);assert.equal(historical.homeworkAssignments[0].feedback,'PRIVATE REVIEW');
  assert.equal(historical.homeworkAssignments[0].reviewDraft?.values.feedback,'PRIVATE PENDING REVIEW');assert.equal(historical.homeworkAssignments[0].snapshot.practiceLog,true);
  const exported=await clientExport(restored,'c','uk',async()=>new Blob([bytes]));const zip=unzipSync(exported.bytes);const tasks=JSON.parse(strFromU8(zip['hausaufgaben.json']));assert.equal(tasks[0].reviewDraft.values.feedback,'PRIVATE PENDING REVIEW');assert.equal(tasks[0].snapshot.practiceLog,true);assert.match(strFromU8(zip['hausaufgaben.md']),/PRIVATE REVIEW\s+### [^\n]+\s+2026-01-04T12:00:00Z\s+PRIVATE PENDING REVIEW/);
  const erased=structuredClone(restored);deleteClient(erased,'c');stampChanges(restored,erased,100,'erase');const joined=mergeVaults(erased,restored);assert.deepEqual(joined.homeworkAssignments,[]);assert.deepEqual(joined.documents,[]);assert.ok(!JSON.stringify(joined.crdt).includes('PRIVATE REVIEW'));assert.ok(Object.entries(joined.crdt!.entities).filter(([id])=>['documents','homeworkAssignments'].includes(JSON.parse(id)[0])).every(([,registers])=>!JSON.stringify(registers).includes('PRIVATE ORIGINAL TASK')));assert.equal(joined.homeworkTemplates.length,1);
  // The shared own template intentionally remains; erasing a client does not erase the practice library.
});
