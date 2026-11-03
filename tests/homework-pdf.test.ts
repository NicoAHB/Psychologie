import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { homeworkPdf } from '../src/lib/homeworkPdf';
import { builtinHomework } from '../src/lib/homeworkCatalog';
import { emptyVault, normalizeVault } from '../src/lib/types';
import { assignHomework, attachHomeworkDocument, homeworkDocumentId } from '../src/lib/homework';
import { assertHomeworkDocument, homeworkDeliveryNeedsConfirmation } from '../src/lib/homeworkDelivery';
import { prepareDelivery } from '../src/lib/documents';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { referencedBlobs } from '../src/lib/blobs';

const font=new Uint8Array(await readFile(new URL('../src/assets/DejaVuSans-Base.ttf',import.meta.url)));
test('every original worksheet generates fillable Unicode fields in both languages without private review data',async()=>{
  for(const language of ['de','uk'] as const)for(const choice of builtinHomework(language)) {
    const bytes=await homeworkPdf({assignmentId:'safe-id',snapshot:choice.snapshot},font);
    const pdf=await PDFDocument.load(bytes),form=pdf.getForm();
    assert.equal(pdf.getTitle(),choice.snapshot.content.title);assert.ok(pdf.getPageCount()>=2);
    assert.equal(form.getTextField('praxisraum_assignment_id').getText(),'safe-id');
    assert.equal(form.getTextField('reflection_3').isMultiline(),true);
    assert.equal(form.getTextField('completed_on').getText(),undefined);
    assert.equal(form.getFields().some(f=>f.getName()==='client_name'),false);
    form.getTextField('reflection_1').setText(language==='uk'?'Мої спостереження':'Meine Beobachtungen');
    // Preserve editable Unicode values when another PDF reader saves a response.
    const saved=await pdf.save({updateFieldAppearances:false});const returned=await PDFDocument.load(saved);
    assert.equal(returned.getForm().getTextField('reflection_1').getText(),language==='uk'?'Мої спостереження':'Meine Beobachtungen');
  }
});
test('long personalized worksheets paginate, legacy tasks get a reflection field, and names require explicit inclusion',async()=>{
  const snapshot=structuredClone(builtinHomework('uk')[0].snapshot);snapshot.content.steps='Д'.repeat(8000);snapshot.content.questions=[];snapshot.pdfClientName='Ім’я за згодою';
  const pdf=await PDFDocument.load(await homeworkPdf({assignmentId:'legacy-id',snapshot},font));
  assert.ok(pdf.getPageCount()>3);assert.equal(pdf.getForm().getTextField('client_name').getText(),'Ім’я за згодою');assert.ok(pdf.getForm().getTextField('reflection_1'));
});
function setup(){const data=emptyVault();data.clients.push({id:'c',name:'PRIVATE NAME',language:'de',contact:'',preparation:'PRIVATE PREPARATION',telegramChatId:'',reminderConsent:false,createdAt:'2026-01-01'});const task=assignHomework(data,'c',{id:'a',snapshot:builtinHomework('de')[0].snapshot,returnExpected:true});task.feedback='PRIVATE FEEDBACK';const doc={id:homeworkDocumentId(task.id),homeworkAssignmentId:task.id,homeworkSnapshot:structuredClone(task.snapshot),clientId:'c',title:task.snapshot.content.title,language:task.snapshot.language,file:{blobId:'file-a',fileName:'worksheet.pdf',mimeType:'application/pdf',size:20},createdAt:'2026-01-02T12:00:00Z',returnExpected:true,deliveries:[],returns:[]};attachHomeworkDocument(data,task.id,doc);return{data,task,doc};}
test('delivery uses one assignment and persists the homework purpose, uncertain attempts require explicit confirmation',()=>{
  const {data,doc}=setup();assert.doesNotThrow(()=>assertHomeworkDocument(data,doc));assert.equal(homeworkDeliveryNeedsConfirmation(data,doc),false);
  const delivery=prepareDelivery(doc,'example@example.com','Aufgabe','Bitte ausfüllen','2026-01-02T12:00:00Z','homework');assert.equal(delivery.purpose,'homework');data.documents[0].deliveries.push(delivery);
  assert.equal(homeworkDeliveryNeedsConfirmation(data,doc),true);assert.equal(prepareDelivery(data.documents[0],'example@example.com','Aufgabe','Bitte ausfüllen','2026-01-02T12:01:00Z','homework').id,delivery.id);
  data.homeworkAssignments[0].snapshot.content.title='Divergent';assert.throws(()=>assertHomeworkDocument(data,doc),/hwPdfChanged/);
});
test('offline PDF alternatives retain an indivisible file/content tuple and all encrypted files until conflict resolution',()=>{
  const {data}=setup(),a=structuredClone(data),b=structuredClone(data);
  a.documents[0].file.blobId='pdf-a';a.documents[0].homeworkSnapshot!.content.title='Fassung A';a.documents[0].title='Fassung A';
  b.documents[0].file.blobId='pdf-b';b.documents[0].homeworkSnapshot!.content.title='Fassung B';b.documents[0].title='Fassung B';
  stampChanges(data,a,10,'a');stampChanges(data,b,20,'b');const merged=mergeVaults(a,b),doc=merged.documents[0];
  assert.equal(doc.file.blobId,'pdf-b');assert.equal(doc.homeworkSnapshot!.content.title,'Fassung B');assert.equal(doc.title,'Fassung B');assert.deepEqual(referencedBlobs(merged).sort(),['pdf-a','pdf-b']);assert.doesNotThrow(()=>normalizeVault(merged));
  const invalid=structuredClone(merged);delete invalid.documents[0].homeworkSnapshot;assert.throws(()=>normalizeVault(invalid),/invalidBackup/);
});
