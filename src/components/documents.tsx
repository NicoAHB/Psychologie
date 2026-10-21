import { useState, type FormEvent } from 'react';
import { Download, FilePlus2, FileText, Mail, Paperclip, Reply } from 'lucide-react';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { dateLabel, today } from '../lib/dates';
import { DOCUMENT_ACCEPT, downloadDocument, emailConfigured, inspectDocument, prepareDelivery, sendDocumentEmail, validEmail } from '../lib/documents';
import { uid, type AssessmentKind, type Client, type ClientDocument, type DocumentFile, type Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Field, Modal, Notice } from './ui';
import { invoiceMessage } from '../lib/invoiceMessage';
import { TelegramComposer } from './telegram';

const errorKey = (error: unknown): TextKey => error instanceof Error && ['documentSizeError', 'documentTypeError', 'emailNotConfigured', 'emailRateLimited', 'emailSendError', 'emailRetryExpired', 'invalidClientEmail', 'authError'].includes(error.message) ? error.message as TextKey : 'storageError';

function DocumentDialog({ vault, client, questionnaire, onClose, onSaved }: { vault: VaultController; client: Client; questionnaire: boolean; onClose: () => void; onSaved: (document: ClientDocument, email: boolean) => void }) {
  const { t } = useI18n(); const [file, setFile] = useState<File>(); const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AssessmentKind>('phq9'); const [language, setLanguage] = useState<Language>(client.language);
  const [returnExpected, setReturnExpected] = useState(questionnaire); const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  async function save(e: FormEvent) {
    e.preventDefault(); setError(undefined); if (!questionnaire && (!file || !title.trim())) { setError('required'); return; }
    setBusy(true); let added: string | undefined;
    try {
      let bytes: Uint8Array<ArrayBuffer>; let fileName: string; let mimeType: string;
      if (questionnaire) {
        const [{ questionnairePdf }, { default: fontUrl }] = await Promise.all([import('../lib/questionnairePdf'), import('../assets/DejaVuSans.ttf?url')]);
        const font = await fetch(fontUrl);
        if (!font.ok) throw new Error('storageError');
        bytes = await questionnairePdf(kind, language, new Uint8Array(await font.arrayBuffer())); fileName = `${kind}-${language}-${today()}.pdf`; mimeType = 'application/pdf';
      } else ({ bytes, fileName, mimeType } = await inspectDocument(file!));
      added = await vault.addFile(bytes);
      const document: ClientDocument = { id: uid(), clientId: client.id, title: questionnaire ? translate(language, `${kind}Title`) : title.trim(), createdAt: new Date().toISOString(), file: { blobId: added, fileName, mimeType, size: bytes.byteLength }, returnExpected, deliveries: [], returns: [], ...(questionnaire && { kind, language }) };
      await vault.update(d => { d.documents.push(document); }); onSaved(document, email);
    } catch (error) { if (added) await vault.purgeUnused([added]).catch(() => {}); setError(errorKey(error)); }
    finally { setBusy(false); }
  }
  return <Modal title={t(questionnaire ? 'createFillablePdf' : 'uploadClientDocument')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={save} noValidate>
    {questionnaire ? <><Field label={t('questionnaires')}><select value={kind} onChange={e => setKind(e.target.value as AssessmentKind)}><option value="phq9">{t('phq9Title')}</option><option value="gad7">{t('gad7Title')}</option></select></Field>
      <Field label={t('documentLanguage')}><select value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="de">Deutsch</option><option value="uk">Українська</option></select></Field><p className="hint">{t('fillablePdfHint')}</p></>
      : <><Field label={t('documentFile')} hint={t('documentFormats')}><input type="file" accept={DOCUMENT_ACCEPT} onChange={e => { const f = e.target.files?.[0]; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }}/></Field><Field label={t('documentTitle')}><input value={title} maxLength={160} onChange={e => setTitle(e.target.value)}/></Field></>}
    <label className="check-label"><input type="checkbox" checked={returnExpected} onChange={e => setReturnExpected(e.target.checked)}/><span>{t('documentReturnExpected')}</span></label>
    <label className="check-label"><input type="checkbox" checked={email} disabled={!validEmail(client.email ?? '')} onChange={e => setEmail(e.target.checked)}/><span>{t('emailDocumentCheckbox')}</span></label>
    {!validEmail(client.email ?? '') && <p className="hint">{t('clientEmailMissing')}</p>}
    {email && <p className="hint">{t('emailReviewHint')}</p>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t(busy ? 'working' : email ? 'saveAndPrepareEmail' : 'save')}</button></div>
  </form></Modal>;
}

export function EmailComposer({ vault, client, documentId, onClose }: { vault: VaultController; client: Client; documentId: string; onClose: () => void }) {
  const { t, language } = useI18n(); const document = vault.data!.documents.find(d => d.id === documentId)!;
  const pending = [...document.deliveries].reverse().find(d => !d.acceptedAt && d.recipient === client.email);
  const invoice = vault.data!.invoices.find(i => i.id === document.invoiceId);
  const message = invoice && invoiceMessage(invoice, client);
  const [subject, setSubject] = useState(pending?.subject ?? message?.subject ?? translate(client.language, 'documentEmailSubject'));
  const [body, setBody] = useState(pending?.body ?? message?.body ?? translate(client.language, document.returnExpected ? 'documentEmailBodyReturn' : 'documentEmailBody'));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>(); const [sentAt, setSentAt] = useState<string>();
  async function send(e: FormEvent) {
    e.preventDefault(); setError(undefined); setBusy(true);
    try {
      if (!emailConfigured || vault.demo) throw new Error('emailNotConfigured');
      const delivery = prepareDelivery(document, client.email ?? '', subject, body);
      // Persist the request id before contacting the provider, so retries after a network failure stay idempotent.
      await vault.update(d => { const doc = d.documents.find(x => x.id === documentId)!; if (!doc.deliveries.some(x => x.id === delivery.id)) doc.deliveries.push(delivery); });
      const receipt = await sendDocumentEmail(delivery, document.file, await vault.file(document.file.blobId, document.file.mimeType));
      await vault.update(d => { const item = d.documents.find(x => x.id === documentId)!.deliveries.find(x => x.id === delivery.id)!; Object.assign(item, receipt); });
      setSentAt(receipt.acceptedAt);
    } catch (error) { setError(errorKey(error)); } finally { setBusy(false); }
  }
  return <Modal title={t(invoice ? 'emailClientInvoice' : 'emailClientDocument')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={send} noValidate>
    <Field label={t('emailRecipient')}><input type="email" value={client.email ?? ''} readOnly/></Field>
    <Field label={t('emailSubject')}><input lang={client.language} value={subject} maxLength={180} disabled={!!sentAt || busy} onChange={e => setSubject(e.target.value)}/></Field>
    <Field label={t('emailMessage')}><textarea lang={client.language} rows={6} value={body} maxLength={12000} disabled={!!sentAt || busy} onChange={e => setBody(e.target.value)}/></Field>
    <p className="document-attachment"><Paperclip size={17}/>{document.file.fileName}</p>
    <Notice>{t('emailPrivacyHint')}</Notice>
    {(!emailConfigured || vault.demo) && <Notice>{t('emailNotConfigured')}</Notice>}
    {sentAt && <Notice>{t('emailAccepted')} {new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(sentAt))}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button>{!sentAt && <button className="btn btn-primary" disabled={busy || !emailConfigured || vault.demo || !validEmail(client.email ?? '') || !subject.trim()}><Mail size={17}/>{t(busy ? 'working' : 'sendEmailNow')}</button>}</div>
  </form></Modal>;
}

function ReturnDialog({ vault, documentId, onClose }: { vault: VaultController; documentId: string; onClose: () => void }) {
  const { t } = useI18n(); const [file, setFile] = useState<File>(); const [receivedOn, setReceivedOn] = useState(today());
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  async function save(e: FormEvent) {
    e.preventDefault(); if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn) || receivedOn > today() || Number.isNaN(Date.parse(receivedOn)) || new Date(receivedOn).toISOString().slice(0, 10) !== receivedOn) { setError('required'); return; }
    setBusy(true); let added: string | undefined;
    try {
      const { bytes, fileName, mimeType } = await inspectDocument(file); added = await vault.addFile(bytes);
      const returned = { id: uid(), receivedOn, uploadedAt: new Date().toISOString(), file: { blobId: added, fileName, mimeType, size: bytes.byteLength } };
      await vault.update(d => { d.documents.find(x => x.id === documentId)!.returns.push(returned); }); onClose();
    } catch (error) { if (added) await vault.purgeUnused([added]).catch(() => {}); setError(errorKey(error)); } finally { setBusy(false); }
  }
  return <Modal title={t('uploadDocumentReturn')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={save} noValidate>
    <Field label={t('returnedDocumentFile')} hint={t('documentFormats')}><input type="file" accept={DOCUMENT_ACCEPT} onChange={e => setFile(e.target.files?.[0])}/></Field>
    <Field label={t('documentReceivedOn')}><input type="date" value={receivedOn} max={today()} onChange={e => setReceivedOn(e.target.value)}/></Field>
    <p className="hint">{t('documentReturnHint')}</p>{error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t(busy ? 'working' : 'save')}</button></div>
  </form></Modal>;
}

/** Also used in the questionnaire tab, so the patient-fillable export is easy to discover. */
export function QuestionnairePdfButton({ vault, client }: { vault: VaultController; client: Client }) {
  const { t } = useI18n(); const [creating, setCreating] = useState(false); const [emailId, setEmailId] = useState<string>(); const [saved, setSaved] = useState(false);
  return <><button className="btn btn-secondary btn-small" onClick={() => setCreating(true)}><FileText size={16}/>{t('createFillablePdf')}</button>
    {saved && <p className="hint" role="status">{t('questionnairePdfStored')}</p>}
    {creating && <DocumentDialog vault={vault} client={client} questionnaire onClose={() => setCreating(false)} onSaved={(doc, email) => { setCreating(false); setSaved(true); if (email) setEmailId(doc.id); }}/>} 
    {emailId && <EmailComposer vault={vault} client={client} documentId={emailId} onClose={() => setEmailId(undefined)}/>}</>;
}

export function DocumentsSection({ vault, client }: { vault: VaultController; client: Client }) {
  const { t, language } = useI18n(); const [adding, setAdding] = useState(false); const [emailId, setEmailId] = useState<string>(); const [returnId, setReturnId] = useState<string>(); const [error, setError] = useState<TextKey>();
  const documents = vault.data!.documents.filter(d => d.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [telegramId, setTelegramId] = useState<string>();
  const day = (iso: string) => dateLabel(iso.slice(0, 10), language, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const when = (iso: string) => new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  async function download(file: DocumentFile) { try { downloadDocument(await vault.file(file.blobId, file.mimeType), file.fileName); } catch { setError('storageError'); } }
  return <section className="card documents-section"><div className="section-heading flex-wrap"><div><h2><FileText size={18}/>{t('clientDocuments')}</h2><p>{t('clientDocumentsHint')}</p></div><div className="button-row"><button className="btn btn-secondary btn-small" onClick={() => setAdding(true)}><FilePlus2 size={16}/>{t('uploadClientDocument')}</button><QuestionnairePdfButton vault={vault} client={client}/></div></div>
    {!client.email && <Notice>{t('clientEmailMissing')}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    {!documents.length ? <p className="hint">{t('noClientDocuments')}</p> : <div className="document-list">{documents.map(doc => <article className="client-document" key={doc.id}><header><h3>{doc.title}</h3><small>{t('documentAddedOn')} {day(doc.createdAt)}</small></header>
      <div className="document-columns"><section><h4>{t('documentOriginalColumn')}</h4><button className="document-download" onClick={() => void download(doc.file)}><Download size={17}/>{doc.file.fileName}</button>
        <ul className="document-history">{doc.deliveries.map(delivery => <li key={delivery.id} className={delivery.acceptedAt ? 'document-sent' : ''}><Mail size={15}/><span>{delivery.acceptedAt ? <>{t('documentSentOn')} <time dateTime={delivery.acceptedAt}>{when(delivery.acceptedAt)}</time></> : <>{t('documentNotSent')} · {when(delivery.requestedAt)}</>}<small>{delivery.recipient}</small></span></li>)}</ul>
        {(doc.telegramDeliveries ?? []).map(delivery => <p className="hint" key={delivery.id}>{t(delivery.acceptedAt ? 'telegramSentOn' : 'telegramNotSent')} · {when(delivery.acceptedAt ?? delivery.requestedAt)} · {delivery.recipient}</p>)}
        {!doc.deliveries.length && !doc.telegramDeliveries?.length && <p className="hint">{t('documentNotSent')}</p>}
        <button className="btn btn-secondary btn-small" disabled={!validEmail(client.email ?? '')} onClick={() => setEmailId(doc.id)}><Mail size={16}/>{t('emailClientDocument')}</button>
        {doc.invoiceId && <button className="btn btn-secondary btn-small" onClick={() => setTelegramId(doc.id)}>{t('invoiceTelegram')}</button>}
      </section><section><h4>{t('documentReturnColumn')}</h4>
        {doc.returns.length ? <ul className="document-returns">{doc.returns.map(returned => <li key={returned.id}><strong>{t('documentReceivedOn')} <time dateTime={returned.receivedOn}>{day(returned.receivedOn)}</time></strong><button className="document-download" onClick={() => void download(returned.file)}><Download size={17}/>{returned.file.fileName}</button><small>{t('documentAddedOn')} {day(returned.uploadedAt)}</small></li>)}</ul> : <p className="hint">{t(doc.returnExpected ? 'documentAwaitingReturn' : 'documentNoReturn')}</p>}
        <button className="btn btn-secondary btn-small" onClick={() => setReturnId(doc.id)}><Reply size={16}/>{t('uploadDocumentReturn')}</button>
      </section></div></article>)}</div>}
    <p className="hint">{t('emailHistoryHint')}</p>
    {adding && <DocumentDialog vault={vault} client={client} questionnaire={false} onClose={() => setAdding(false)} onSaved={(doc, email) => { setAdding(false); if (email) setEmailId(doc.id); }}/>} 
    {emailId && <EmailComposer vault={vault} client={client} documentId={emailId} onClose={() => setEmailId(undefined)}/>}
    {telegramId && <TelegramComposer vault={vault} client={client} documentId={telegramId} onClose={() => setTelegramId(undefined)}/>}
    {returnId && <ReturnDialog vault={vault} documentId={returnId} onClose={() => setReturnId(undefined)}/>}
  </section>;
}
