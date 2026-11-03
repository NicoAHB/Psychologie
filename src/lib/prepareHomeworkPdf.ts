import { homeworkFileName } from './homeworkFileName';
import { attachHomeworkDocument, clientHomework, homeworkDocumentId, materializeLegacyHomework } from './homework';
import type { HomeworkAssignment } from './homeworkTypes';
import type { ClientDocument } from './types';
import type { VaultController } from './useVault';
import { runSecureTask } from './workerTasks';

const jobs = new WeakMap<CryptoKey,Map<string,Promise<ClientDocument>>>();
export function matchingHomeworkPdf(document:ClientDocument,assignment:HomeworkAssignment) {
  return document.homeworkAssignmentId===assignment.id && document.clientId===assignment.clientId &&
    JSON.stringify(document.homeworkSnapshot)===JSON.stringify(assignment.snapshot);
}
/** A PDF is generated once for this assignment, encrypted before storage, and reused
 * for both delivery channels. A lock or changed snapshot invalidates the operation. */
export function prepareHomeworkPdf(vault:VaultController,assignment:HomeworkAssignment):Promise<ClientDocument> {
  const key=vault.getKey(); if(!key)return Promise.reject(new Error('locked'));
  let active=jobs.get(key); if(!active){active=new Map();jobs.set(key,active);}
  const pending=active.get(assignment.id); if(pending)return pending;
  const job=prepare(vault,assignment,key).finally(()=>active!.delete(assignment.id));
  active.set(assignment.id,job);return job;
}
async function prepare(vault:VaultController,assignment:HomeworkAssignment,key:CryptoKey):Promise<ClientDocument> {
  const id=homeworkDocumentId(assignment.id);
  function current() {
    const data=vault.getData();
    if(vault.getKey()!==key||!data)throw new Error('locked');
    const row=clientHomework(data,assignment.clientId).find(a=>a.id===assignment.id);
    if(!row||JSON.stringify(row.snapshot)!==JSON.stringify(assignment.snapshot))throw new Error('hwPdfChanged');
    return data;
  }
  const existing=current().documents.find(d=>d.id===id);
  if(existing){if(!matchingHomeworkPdf(existing,assignment))throw new Error('hwPdfChanged');await vault.flush();const stored=current().documents.find(d=>d.id===id);if(!stored||!matchingHomeworkPdf(stored,assignment))throw new Error('hwPdfChanged');return stored;}
  let bytes:Uint8Array<ArrayBuffer>|undefined,blobId:string|undefined;
  try {
    bytes=await runSecureTask('homeworkPdf',{assignmentId:assignment.id,snapshot:structuredClone(assignment.snapshot)});current();
    const size=bytes.byteLength;blobId=await vault.addFile(bytes);bytes.fill(0);current();
    const document:ClientDocument={id,clientId:assignment.clientId,homeworkAssignmentId:assignment.id,homeworkSnapshot:structuredClone(assignment.snapshot),title:assignment.snapshot.content.title,language:assignment.snapshot.language,createdAt:new Date().toISOString(),file:{blobId,fileName:homeworkFileName({assignmentId:assignment.id,snapshot:assignment.snapshot}),mimeType:'application/pdf',size},deliveries:[],returns:[],returnExpected:assignment.returnExpected,...assignment.dueOn&&{returnDueOn:assignment.dueOn}};
    await vault.update(data=>{
      current();const live=materializeLegacyHomework(data,assignment.id);document.returnExpected=live.returnExpected;if(live.dueOn)document.returnDueOn=live.dueOn;else delete document.returnDueOn;
      const other=data.documents.find(d=>d.id===id);if(other&&!matchingHomeworkPdf(other,assignment))throw new Error('hwPdfChanged');
      attachHomeworkDocument(data,assignment.id,document);
    });
    const result=current().documents.find(d=>d.id===id)!;
    if(result.file.blobId!==blobId)await vault.purgeUnused([blobId]);
    return result;
  } catch(error) {
    if(blobId&&vault.getKey()===key)await vault.purgeUnused([blobId]).catch(()=>{});
    throw error;
  } finally {bytes?.fill(0);}
}
