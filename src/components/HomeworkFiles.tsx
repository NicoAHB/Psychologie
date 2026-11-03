import { useState } from 'react';
import { Download, Mail, Reply, Send } from 'lucide-react';
import { useI18n, type TextKey } from '../lib/i18n';
import { downloadDocument, validEmail } from '../lib/documents';
import { homeworkDocuments, homeworkReturns } from '../lib/homework';
import type { HomeworkAssignment } from '../lib/homeworkTypes';
import { prepareHomeworkPdf } from '../lib/prepareHomeworkPdf';
import type { VaultController } from '../lib/useVault';
import { EmailComposer, ReturnDialog } from './documents';
import { TelegramComposer } from './telegram';
import { DocumentShareDialog } from './DocumentShare';
import { Notice } from './ui';
import { dateLabel } from '../lib/dates';

export function HomeworkFiles({vault,assignment,onDocument}:{vault:VaultController;assignment:HomeworkAssignment;onDocument:(id:string)=>void}) {
  const {t,language}=useI18n(),client=vault.data!.clients.find(c=>c.id===assignment.clientId)!;
  const [busy,setBusy]=useState(false),[error,setError]=useState<TextKey>(),[action,setAction]=useState<{id:string;kind:'email'|'telegram'|'return'|'share'}>();
  const document=homeworkDocuments(vault.data!,assignment)[0],returns=homeworkReturns(vault.data!,assignment);
  const [returnLimit,setReturnLimit]=useState(3);
  async function open(kind:'download'|'email'|'telegram'|'return'|'share') {
    if(busy)return;setBusy(true);setError(undefined);
    const key=vault.getKey();
    try {
      const doc=await prepareHomeworkPdf(vault,assignment);
      if(key!==vault.getKey())return;
      if(kind==='download')downloadDocument(await vault.file(doc.file.blobId,doc.file.mimeType),doc.file.fileName);
      else setAction({id:doc.id,kind});
    } catch(e){setError(e instanceof Error&&['hwPdfChanged','workerUnavailable','workerFailed','invoicePdfError'].includes(e.message)?e.message as TextKey:'storageError');}
    finally{setBusy(false);}
  }
  async function downloadReturn(file:import('../lib/types').DocumentFile){const key=vault.getKey();try{const blob=await vault.file(file.blobId,file.mimeType);if(key===vault.getKey())downloadDocument(blob,file.fileName);}catch{setError('storageError');}}
  return <section className="hw-files" aria-label={t('hwFiles')}><h4>{t('hwFiles')}</h4><div className="hw-file-grid"><section><h5>{t('documentOriginalColumn')}</h5><p className="hint">{t('hwDownloadHint')}</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void open('download')}><Download size={17}/>{t(busy?'working':'hwPdf')}</button>
    <details className="hw-send-tools"><summary>{t('hwSendTools')}</summary><div className="button-row">
      <button type="button" className="btn btn-secondary" disabled={busy||!validEmail(client.email??'')} onClick={()=>void open('email')}><Mail size={17}/>{t('emailClientDocument')}</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void open('telegram')}><Send size={17}/>{t('hwTelegramTitle')}</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void open('share')}>{t('shareTitle')}</button>
    </div>{!validEmail(client.email??'')&&<p className="hint">{t('clientEmailMissing')}</p>}</details>
    {document&&<p className="hint" role="status">{t('hwPdfStored')}</p>}
    </section><section className="hw-returns"><h5>{t('documentReturnColumn')}</h5>
      {returns.length?<ul>{returns.slice(0,returnLimit).map(r=><li key={r.id}><strong>{t('hwReturnReceived')} {dateLabel(r.receivedOn,language,{dateStyle:'short'})}</strong><button type="button" className="document-download" onClick={()=>void downloadReturn(r.file)}><Download size={16}/>{r.file.fileName}</button></li>)}</ul>:<p className="hint">{t('hwNoReturnsYet')}</p>}
      {returns.length>returnLimit&&<button className="text-link" type="button" onClick={()=>setReturnLimit(n=>n+3)}>{t('showMoreRows')}</button>}
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void open('return')}><Reply size={17}/>{t('uploadDocumentReturn')}</button>
      {document&&<button type="button" className="text-link hw-document-link" onClick={()=>onDocument(document.id)}>{t('hwOpenDocuments')}</button>}
    </section></div>{error&&<Notice error>{t(error)}</Notice>}
  {action?.kind==='email'&&<EmailComposer vault={vault} client={client} documentId={action.id} purpose="homework" onClose={()=>setAction(undefined)}/>}
  {action?.kind==='telegram'&&<TelegramComposer vault={vault} client={client} documentId={action.id} purpose="homework" onClose={()=>setAction(undefined)}/>}
  {action?.kind==='return'&&<ReturnDialog vault={vault} documentId={action.id} onClose={()=>setAction(undefined)}/>}
  {action?.kind==='share'&&<DocumentShareDialog vault={vault} client={client} documentId={action.id} onClose={()=>setAction(undefined)}/>}
  </section>;
}
