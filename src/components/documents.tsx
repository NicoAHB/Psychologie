import { DocumentShareDialog, DocumentShareHistory } from './DocumentShare';
import { runSecureTask } from '../lib/workerTasks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, FilePlus2, FileText, Mail, Paperclip, Reply } from 'lucide-react';
import { translate, useI18n, type TextKey } from '../lib/i18n';
import { dateLabel, today } from '../lib/dates';
import { DOCUMENT_ACCEPT, downloadDocument, emailConfigured, inspectDocument, prepareDelivery, sendDocumentEmail, validEmail } from '../lib/documents';
import { EmailSetupButton } from './EmailSetupCard';
import { uid, type AssessmentKind, type Client, type ClientDocument, type DocumentFile, type Language } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { canRemindInvoice, cancellationOf, invoiceOutstanding, validDay } from '../lib/invoice';
import { hasDocumentReceipt } from '../lib/followUp';
import { Field, Modal, Notice } from './ui';
import { invoiceMessage } from '../lib/invoiceMessage';
import { needsAttention } from '../lib/assessments';
import type { ImportedQuestionnaire } from '../lib/questionnaireImport';
import { TelegramComposer } from './telegram';

const errorKey = (error: unknown): TextKey => error instanceof Error && ['workerUnavailable', 'workerFailed', 'documentSizeError', 'documentTypeError', 'emailNotConfigured', 'emailSetupRequired', 'emailProviderKeyInvalid', 'emailSenderNotVerified', 'emailGmailConnectionInvalid', 'emailGmailAddressMismatch', 'emailGmailDeliveryUnknown', 'emailRateLimited', 'emailSendError', 'emailRetryExpired', 'invalidClientEmail', 'authError', 'invoiceInactive', 'invoiceReminderUnavailable', 'questionnaireImportDuplicate'].includes(error.message) ? error.message as TextKey : 'storageError';

function DocumentDialog({ vault, client, questionnaire, onClose, onSaved }: { vault: VaultController; client: Client; questionnaire: boolean; onClose: () => void; onSaved: (document: ClientDocument, email: boolean) => void }) {
  const { t } = useI18n(); const [file, setFile] = useState<File>(); const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AssessmentKind>('phq9'); const [language, setLanguage] = useState<Language>(client.language);
  const [returnExpected, setReturnExpected] = useState(questionnaire); const [returnDueOn, setReturnDueOn] = useState(''); const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  async function save(e: FormEvent) {
    e.preventDefault(); setError(undefined); if (returnExpected && returnDueOn && !validDay(returnDueOn)) { setError('required'); return; } if (!questionnaire && (!file || !title.trim())) { setError('required'); return; }
    setBusy(true); let added: string | undefined;
    try {
      let bytes: Uint8Array<ArrayBuffer>; let fileName: string; let mimeType: string; const documentId = uid();
      if (questionnaire) {
        bytes = await runSecureTask('questionnaire', { kind, language, documentId }); fileName = `${kind}-${language}-${today()}.pdf`; mimeType = 'application/pdf';
      } else ({ bytes, fileName, mimeType } = await inspectDocument(file!));
      added = await vault.addFile(bytes);
      const document: ClientDocument = { id: documentId, clientId: client.id, title: questionnaire ? translate(language, `${kind}Title`) : title.trim(), createdAt: new Date().toISOString(), file: { blobId: added, fileName, mimeType, size: bytes.byteLength }, returnExpected, ...(returnExpected && returnDueOn && { returnDueOn }), deliveries: [], returns: [], ...(questionnaire && { kind, language }) };
      await vault.update(d => { d.documents.push(document); }); onSaved(document, email);
    } catch (error) { if (added) await vault.purgeUnused([added]).catch(() => {}); setError(errorKey(error)); }
    finally { setBusy(false); }
  }
  return <Modal title={t(questionnaire ? 'createFillablePdf' : 'uploadClientDocument')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={save} noValidate>
    {questionnaire ? <><Field label={t('questionnaires')}><select value={kind} onChange={e => setKind(e.target.value as AssessmentKind)}><option value="phq9">{t('phq9Title')}</option><option value="gad7">{t('gad7Title')}</option></select></Field>
      <Field label={t('documentLanguage')}><select value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="de">Deutsch</option><option value="uk">Українська</option></select></Field><p className="hint">{t('fillablePdfHint')}</p></>
      : <><Field label={t('documentFile')} hint={t('documentFormats')}><input type="file" accept={DOCUMENT_ACCEPT} onChange={e => { const f = e.target.files?.[0]; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }}/></Field><Field label={t('documentTitle')}><input value={title} maxLength={160} onChange={e => setTitle(e.target.value)}/></Field></>}
    <label className="check-label"><input type="checkbox" checked={returnExpected} onChange={e => setReturnExpected(e.target.checked)}/><span>{t('documentReturnExpected')}</span></label>
    {returnExpected && <Field label={t('returnDueOn')}><input type="date" value={returnDueOn} onChange={e => setReturnDueOn(e.target.value)}/></Field>}
    <label className="check-label"><input type="checkbox" checked={email} disabled={!validEmail(client.email ?? '')} onChange={e => setEmail(e.target.checked)}/><span>{t('emailDocumentCheckbox')}</span></label>
    {!validEmail(client.email ?? '') && <p className="hint">{t('clientEmailMissing')}</p>}
    {email && <p className="hint">{t('emailReviewHint')}</p>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t(busy ? 'working' : email ? 'saveAndPrepareEmail' : 'save')}</button></div>
  </form></Modal>;
}

export function EmailComposer({ vault, client, documentId, onClose, purpose = 'invoice' }: { vault: VaultController; client: Client; documentId: string; onClose: () => void; purpose?: 'invoice' | 'paymentReminder' }) {
  const { t, language } = useI18n(); const document = vault.data!.documents.find(d => d.id === documentId)!;
  const pending = [...document.deliveries].reverse().find(d => !d.acceptedAt && d.recipient === client.email && (d.purpose ?? 'invoice') === purpose);
  const invoice = vault.data!.invoices.find(i => i.id === document.invoiceId);
  const message = invoice && invoiceMessage(invoice, client, purpose, invoiceOutstanding(vault.data!, invoice) ?? 0);
  const inactive = !!invoice && !!cancellationOf(vault.data!, invoice.id); const [expectedBalance] = useState(() => invoice ? invoiceOutstanding(vault.data!, invoice) : null); const reminderUnavailable = purpose === 'paymentReminder' && (!invoice || !canRemindInvoice(vault.data!, invoice, expectedBalance));
  const [subject, setSubject] = useState(pending?.subject ?? message?.subject ?? translate(client.language, 'documentEmailSubject'));
  const [body, setBody] = useState(pending?.body ?? message?.body ?? translate(client.language, document.returnExpected ? 'documentEmailBodyReturn' : 'documentEmailBody'));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>(); const [sentAt, setSentAt] = useState<string>();
  async function send(e: FormEvent) {
    e.preventDefault(); setError(undefined); setBusy(true);
    try {
      if (!emailConfigured || vault.demo) throw new Error('emailNotConfigured');
      if (inactive) throw new Error('invoiceInactive');
      if (reminderUnavailable) throw new Error('invoiceReminderUnavailable');
      const delivery = prepareDelivery(document, client.email ?? '', subject, body, new Date().toISOString(), purpose);
      // Persist the request id before contacting the provider, so retries after a network failure stay idempotent.
      await vault.update(d => { const doc = d.documents.find(x => x.id === documentId)!; if (!doc.deliveries.some(x => x.id === delivery.id)) doc.deliveries.push(delivery); });
      const receipt = await sendDocumentEmail(delivery, document.file, await vault.file(document.file.blobId, document.file.mimeType));
      await vault.update(d => { const item = d.documents.find(x => x.id === documentId)!.deliveries.find(x => x.id === delivery.id)!; Object.assign(item, receipt); });
      setSentAt(receipt.acceptedAt);
    } catch (error) { setError(errorKey(error)); } finally { setBusy(false); }
  }
  return <Modal title={t(purpose === 'paymentReminder' ? 'invoiceReminderTitle' : invoice ? 'emailClientInvoice' : 'emailClientDocument')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={send} noValidate>
    <Field label={t('emailRecipient')}><input type="email" value={client.email ?? ''} readOnly/></Field>
    <Field label={t('emailSubject')}><input lang={client.language} value={subject} maxLength={180} disabled={!!sentAt || busy} onChange={e => setSubject(e.target.value)}/></Field>
    <Field label={t('emailMessage')}><textarea lang={client.language} rows={6} value={body} maxLength={12000} disabled={!!sentAt || busy} onChange={e => setBody(e.target.value)}/></Field>
    <p className="document-attachment"><Paperclip size={17}/>{document.file.fileName}</p>
    <Notice>{t('emailPrivacyHint')}</Notice>
    {purpose === 'paymentReminder' && <Notice>{t('invoiceReminderHint')}</Notice>}
    {inactive && <Notice error>{t('invoiceInactive')}</Notice>}
    {reminderUnavailable && <Notice error>{t('invoiceReminderUnavailable')}</Notice>}
    {(!emailConfigured || vault.demo) && <Notice>{t('emailNotConfigured')}</Notice>}
    <EmailSetupButton demo={vault.demo}/>
    {sentAt && <Notice>{t('emailAccepted')} {new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(sentAt))}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button>{!sentAt && <button className="btn btn-primary" disabled={busy || inactive || reminderUnavailable || !emailConfigured || vault.demo || !validEmail(client.email ?? '') || !subject.trim()}><Mail size={17}/>{t(busy ? 'working' : 'sendEmailNow')}</button>}</div>
  </form></Modal>;
}

function ReturnSettingsDialog({ vault, documentId, onClose }: { vault: VaultController; documentId: string; onClose: () => void }) {
  const { t } = useI18n(); const doc = vault.data!.documents.find(d => d.id === documentId)!;
  const [expected, setExpected] = useState(doc.returnExpected); const [dueOn, setDueOn] = useState(doc.returnDueOn ?? ''); const [closed, setClosed] = useState(!!doc.returnClosedAt);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>();
  async function save(e: FormEvent) { e.preventDefault(); setError(undefined); if (dueOn && !validDay(dueOn)) { setError('required'); return; } setBusy(true);
    try { await vault.update(d => { const item = d.documents.find(x => x.id === documentId)!; item.returnExpected = expected; if (dueOn) item.returnDueOn = dueOn; else delete item.returnDueOn; if (closed) item.returnClosedAt ??= new Date().toISOString(); else delete item.returnClosedAt; }); onClose(); } catch { setError('storageError'); } finally { setBusy(false); }
  }
  return <Modal title={t('returnSettings')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={save} noValidate><p className="hint">{t('returnSettingsHint')}</p>
    <label className="check-label"><input type="checkbox" checked={expected} onChange={e => setExpected(e.target.checked)}/><span>{t('documentReturnExpected')}</span></label>
    {expected && <><Field label={t('returnDueOn')}><input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)}/></Field><label className="check-label"><input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)}/><span>{t('returnClose')}</span></label></>}
    {error && <Notice error>{t(error)}</Notice>}<div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t('save')}</button></div>
  </form></Modal>;
}

function ReturnDialog({ vault, documentId, onClose }: { vault: VaultController; documentId: string; onClose: () => void }) {
  const { t } = useI18n(); const [file, setFile] = useState<File>(); const [receivedOn, setReceivedOn] = useState(today());
  const [busy, setBusy] = useState(false); const [reading, setReading] = useState(false); const [error, setError] = useState<TextKey>();
  const [result, setResult] = useState<ImportedQuestionnaire>(); const [importError, setImportError] = useState<TextKey>(); const [confirmed, setConfirmed] = useState(false); const [assessmentDate, setAssessmentDate] = useState(today());
  const document = vault.data!.documents.find(d => d.id === documentId)!;
  const selection = useRef(0);
  async function pick(file?: File) {
    const version = ++selection.current; setFile(file); setResult(undefined); setImportError(undefined); setConfirmed(false); setError(undefined);
    if (!file || !document.kind) { setReading(false); return; }
    setReading(true);
    try {
      const { bytes, mimeType } = await inspectDocument(file); if (mimeType !== 'application/pdf') throw new Error('questionnaireImportInvalid');
      const value = await runSecureTask('readQuestionnaire', { bytes, kind: document.kind, documentId: document.id });
      if (selection.current !== version) return; setResult(value); setAssessmentDate(value.completedOn ?? '');
    } catch (error) { if (selection.current === version) setImportError(error instanceof Error && ['questionnaireImportInvalid', 'questionnaireImportIncomplete', 'questionnaireImportMismatch'].includes(error.message) ? error.message as TextKey : 'questionnaireImportInvalid'); }
    finally { if (selection.current === version) setReading(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (reading || !file || !validDay(receivedOn) || receivedOn > today() || confirmed && (!result || !validDay(assessmentDate) || assessmentDate > today())) { setError('required'); return; }
    setBusy(true); let added: string | undefined;
    try {
      const { bytes, fileName, mimeType } = await inspectDocument(file); added = await vault.addFile(bytes);
      const fileHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const returnId = uid(); const assessmentId = confirmed && result ? uid() : undefined;
      const returned = { id: returnId, receivedOn, uploadedAt: new Date().toISOString(), file: { blobId: added, fileName, mimeType, size: bytes.byteLength }, ...(assessmentId && { assessmentId }) };
      await vault.update(d => {
        if (assessmentId && d.assessments.some(a => a.clientId === document.clientId && a.kind === result!.kind && a.source?.fileHash === fileHash)) throw new Error('questionnaireImportDuplicate');
        const target = d.documents.find(x => x.id === documentId); if (!target) throw new Error('required'); target.returns.push(returned);
        if (assessmentId && result) d.assessments.push({ id: assessmentId, clientId: target.clientId, kind: result.kind, date: assessmentDate, answers: [...result.answers], note: t('questionnaireImportedNote'), source: { documentId, returnId, fileHash } });
      }); onClose();
    } catch (error) { if (added) await vault.purgeUnused([added]).catch(() => {}); setError(errorKey(error)); } finally { setBusy(false); }
  }
  return <Modal title={t('uploadDocumentReturn')} onClose={() => { if (!busy) onClose(); }}><form onSubmit={save} noValidate>
    <Field label={t('returnedDocumentFile')} hint={t('documentFormats')}><input type="file" accept={DOCUMENT_ACCEPT} disabled={busy} onChange={e => void pick(e.target.files?.[0])}/></Field>
    <Field label={t('documentReceivedOn')}><input type="date" value={receivedOn} max={today()} onChange={e => setReceivedOn(e.target.value)}/></Field>
    {reading && <p className="hint" role="status">{t('questionnaireImportReading')}</p>}
    {importError && <Notice>{t(importError)} {t('questionnaireImportFileOnly')}</Notice>}
    {result && <section className="form-section"><h3>{t('questionnaireImportTitle')}</h3><p>{t(`${result.kind}Title`)} · <strong>{result.score} / {result.kind === 'phq9' ? 27 : 21}</strong></p>{result.name && <p className="hint">{t('pdfClientName')}: {result.name}</p>}<p className="hint">{t('questionnaireImportReview')}</p><ol>{result.answers.map((answer, index) => <li key={index}>{t(`${result.kind}_${index + 1}` as TextKey)}: <strong>{answer}</strong></li>)}</ol>
      {needsAttention(result.kind, result.answers) && <Notice error>{t('attentionNote')}</Notice>}
      <Field label={t('questionnaireImportDate')}><input type="date" value={assessmentDate} max={today()} onChange={e => setAssessmentDate(e.target.value)}/></Field>
      <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>{t('questionnaireImportConfirm')}</span></label></section>}
    <p className="hint">{t('documentReturnHint')}</p>{error && <Notice error>{t(error)}</Notice>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy || reading}>{t(busy ? 'working' : 'save')}</button></div>
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

export function DocumentsSection({ vault, client, focusId }: { vault: VaultController; client: Client; focusId?: string }) {
  const { t, language } = useI18n(); const [adding, setAdding] = useState(false); const [emailId, setEmailId] = useState<string>(); const [returnId, setReturnId] = useState<string>(); const [error, setError] = useState<TextKey>();
  const documents = vault.data!.documents.filter(d => d.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [shareId, setShareId] = useState<string>();
  const [telegramId, setTelegramId] = useState<string>(); const [settingsId, setSettingsId] = useState<string>();
  useEffect(() => { if (!focusId) return; const id = requestAnimationFrame(() => { const item = globalThis.document.getElementById(`client-document-${focusId}`); item?.scrollIntoView({ block: 'start' }); item?.focus({ preventScroll: true }); }); return () => cancelAnimationFrame(id); }, [focusId, documents.length]);
  const day = (iso: string) => dateLabel(iso.slice(0, 10), language, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const when = (iso: string) => new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'uk-UA', { timeZone: vault.data!.settings.timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  async function download(file: DocumentFile) { try { downloadDocument(await vault.file(file.blobId, file.mimeType), file.fileName); } catch { setError('storageError'); } }
  return <section className="card documents-section"><div className="section-heading flex-wrap"><div><h2><FileText size={18}/>{t('clientDocuments')}</h2><p>{t('clientDocumentsHint')}</p></div><div className="button-row"><button className="btn btn-secondary btn-small" onClick={() => setAdding(true)}><FilePlus2 size={16}/>{t('uploadClientDocument')}</button><QuestionnairePdfButton vault={vault} client={client}/></div></div>
    {!client.email && <Notice>{t('clientEmailMissing')}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    {!documents.length ? <p className="hint">{t('noClientDocuments')}</p> : <div className="document-list">{documents.map(doc => <article className={`client-document ${doc.id === focusId ? 'is-focused' : ''}`} id={`client-document-${doc.id}`} tabIndex={-1} key={doc.id}><header><h3>{doc.title}</h3><small>{t('documentAddedOn')} {day(doc.createdAt)}</small>{doc.returnExpected && <small>{doc.returnClosedAt ? `${t('returnClosedOn')} ${day(doc.returnClosedAt)}` : doc.returnDueOn ? `${t('returnDueLabel')} ${day(doc.returnDueOn)}` : t('returnNoDue')}</small>}</header>
      <div className="document-columns"><section><h4>{t('documentOriginalColumn')}</h4><button className="document-download" onClick={() => void download(doc.file)}><Download size={17}/>{doc.file.fileName}</button>
        <ul className="document-history">{doc.deliveries.map(delivery => <li key={delivery.id} className={delivery.acceptedAt ? 'document-sent' : ''}><Mail size={15}/><span>{delivery.purpose === 'paymentReminder' && `${t('invoiceReminderTitle')} · `}{delivery.acceptedAt ? <>{t('documentSentOn')} <time dateTime={delivery.acceptedAt}>{when(delivery.acceptedAt)}</time></> : <>{t('documentNotSent')} · {when(delivery.requestedAt)}</>}<small>{delivery.recipient}</small></span></li>)}</ul>
        {(doc.telegramDeliveries ?? []).map(delivery => <p className="hint" key={delivery.id}>{delivery.purpose === 'paymentReminder' && `${t('invoiceReminderTitle')} · `}{t(delivery.acceptedAt ? 'telegramSentOn' : 'telegramNotSent')} · {when(delivery.acceptedAt ?? delivery.requestedAt)} · {delivery.recipient}</p>)}
        {!doc.deliveries.length && !doc.telegramDeliveries?.length && <p className="hint">{t('documentNotSent')}</p>}
        <button className="btn btn-secondary btn-small" disabled={!validEmail(client.email ?? '')} onClick={() => setEmailId(doc.id)}><Mail size={16}/>{t('emailClientDocument')}</button>
        <button className="btn btn-secondary btn-small" onClick={() => setShareId(doc.id)}>{t('shareTitle')}</button><DocumentShareHistory vault={vault} document={doc}/>
        {doc.invoiceId && <button className="btn btn-secondary btn-small" onClick={() => setTelegramId(doc.id)}>{t('invoiceTelegram')}</button>}
      </section><section><h4>{t('documentReturnColumn')}</h4>
        {doc.returns.length ? <ul className="document-returns">{doc.returns.map(returned => <li key={returned.id}><strong>{t('documentReceivedOn')} <time dateTime={returned.receivedOn}>{day(returned.receivedOn)}</time></strong><button className="document-download" onClick={() => void download(returned.file)}><Download size={17}/>{returned.file.fileName}</button><small>{t('documentAddedOn')} {day(returned.uploadedAt)}</small>{returned.assessmentId && <small>{t('questionnaireImportedStatus')}</small>}</li>)}</ul> : <p className="hint">{t(doc.returnClosedAt ? 'returnClose' : doc.returnExpected ? hasDocumentReceipt(doc) ? 'documentAwaitingReturn' : 'returnNotSent' : 'documentNoReturn')}</p>}
        <div className="button-row"><button className="btn btn-secondary btn-small" onClick={() => setReturnId(doc.id)}><Reply size={16}/>{t('uploadDocumentReturn')}</button><button className="text-link" onClick={() => setSettingsId(doc.id)}>{t('returnSettings')}</button></div>
      </section></div></article>)}</div>}
    <p className="hint">{t('emailHistoryHint')}</p>
    {adding && <DocumentDialog vault={vault} client={client} questionnaire={false} onClose={() => setAdding(false)} onSaved={(doc, email) => { setAdding(false); if (email) setEmailId(doc.id); }}/>}
    {emailId && <EmailComposer vault={vault} client={client} documentId={emailId} onClose={() => setEmailId(undefined)}/>}
    {telegramId && <TelegramComposer vault={vault} client={client} documentId={telegramId} onClose={() => setTelegramId(undefined)}/>}
    {shareId && <DocumentShareDialog vault={vault} client={client} documentId={shareId} onClose={() => setShareId(undefined)}/>}
    {settingsId && <ReturnSettingsDialog vault={vault} documentId={settingsId} onClose={() => setSettingsId(undefined)}/>}
    {returnId && <ReturnDialog vault={vault} documentId={returnId} onClose={() => setReturnId(undefined)}/>}
  </section>;
}
