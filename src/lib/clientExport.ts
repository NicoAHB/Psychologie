import { strToU8, zipSync, type Zippable } from 'fflate';
import { money } from './dates';
import { scoreOf } from './assessments';
import { translate } from './i18n';
import type { Language, VaultData } from './types';

const safe = (value: string) => value.normalize('NFC').replace(/[^\p{L}\p{N}._-]/gu, '-').replace(/\.{2,}/g, '-').slice(0, 100) || 'datei';
const csv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
/** A readable export of exactly one subject. No vault keys, other clients or device settings. */
export async function clientExport(data: VaultData, clientId: string, language: Language, file: (id: string, type?: string) => Promise<Blob>) {
  const client = data.clients.find(item => item.id === clientId); if (!client) throw new Error('required');
  const T = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const sessions = data.sessions.filter(item => item.clientId === clientId).sort((a, b) => a.date.localeCompare(b.date));
  const appointments = data.appointments.filter(item => item.clientId === clientId).sort((a, b) => a.date.localeCompare(b.date));
  const notes = data.notes.filter(item => item.clientId === clientId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const invoices = data.invoices.filter(item => item.clientId === clientId);
  const assessments = data.assessments.filter(item => item.clientId === clientId);
  const documents = data.documents.filter(item => item.clientId === clientId);
  const archive: Zippable = {}; const attachments: { path: string; blobId: string; mimeType: string }[] = [];
  const text = (path: string, value: string) => { archive[path] = [strToU8(value), { level: 6 }]; };
  const add = (path: string, blobId: string, mimeType: string) => { attachments.push({ path, blobId, mimeType }); return path; };
  if (client.avatarId) add('bilder/profil.webp', client.avatarId, 'image/webp');
  text('profil.md', `# ${client.name}\n\n${T('clientExportProfile')}\n\n- ${T('date')}: ${client.createdAt}\n- ${T('clientEmail')}: ${client.email ?? ''}\n- ${T('contact')}: ${client.contact}\n- ${T('invoiceRecipientAddress')}: ${client.address ?? ''}\n\n## ${T('preparation')}\n\n${client.preparation}\n`);
  text('sitzungen.md', `# ${T('tabDiscussed')}\n\n` + sessions.map(session => `## ${session.date} ${session.time}\n\n${session.notes}\n\n${session.tags.join(' ')}\n\n${T('homeworkOpen')}: ${session.homework ?? ''}\n`).join('\n'));
  text('termine.md', `# ${T('appointments')}\n\n` + appointments.map(item => `- ${item.date} ${item.time} (${item.timeZone}), ${item.duration} min, ${item.status}`).join('\n'));
  text('fotonotizen.md', `# ${T('addNote')}\n\n` + notes.map(note => { const path = add(`bilder/${safe(note.id)}.webp`, note.blobId, 'image/webp'); return `## ${note.createdAt}\n\n${note.caption}\n\n${note.tags.join(' ')}\n\n![${T('addNote')}](${path})\n`; }).join('\n'));
  text('finanzen.csv', '\uFEFF' + [[T('date'), T('invoiceAmount'), T('currencyEur'), T('paymentDate'), T('invoiceNumber')], ...sessions.map(session => [session.date, money(session.billing?.amountCents ?? session.feeCents, language, session.billing?.currency ?? 'EUR'), money(session.feeCents, language), session.paidAt ?? '', invoices.find(invoice => invoice.id === session.invoiceId)?.number ?? ''])].map(row => row.map(value => csv(typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value)).join(';')).join('\r\n'));
  text('frageboegen.md', `# ${T('questionnaires')}\n\n` + assessments.map(assessment => `## ${assessment.date} · ${T(`${assessment.kind}Title`)}\n\n${assessment.answers.map((value, index) => `${index + 1}. ${value}`).join('\n')}\n\n${T('scoreLabel')}: ${scoreOf(assessment.kind, assessment.answers)}\n\n${assessment.note}\n`).join('\n'));
  for (const invoice of invoices) text(`rechnungen/${safe(invoice.id)}.md`, `# ${T(invoice.kind === 'cancellation' ? 'cancellationTitle' : 'invoiceTitle')} ${invoice.number}\n\n${invoice.issuedAt}\n\n${invoice.lines.map(line => `- ${line.date}: ${line.description} — ${money(line.amountCents, invoice.language, invoice.currency ?? 'EUR')}`).join('\n')}\n\n${T('invoiceTotal')}: ${money(invoice.totalCents, invoice.language, invoice.currency ?? 'EUR')}\n`);
  const documentIndex = documents.map(document => {
    const original = add(`dokumente/${safe(document.id)}-${safe(document.file.fileName)}`, document.file.blobId, document.file.mimeType);
    const returned = document.returns.map(item => ({ ...item, path: add(`dokumente/${safe(document.id)}-${safe(item.id)}-${safe(item.file.fileName)}`, item.file.blobId, item.file.mimeType) }));
    return { ...document, path: original, returns: returned };
  });
  text('dokumente.md', `# ${T('clientDocuments')}\n\n` + documentIndex.map(document => `## ${document.title}\n\n[${document.file.fileName}](${document.path})\n\n${[...document.deliveries.map(item => `${T('documentSentOn')}: ${item.acceptedAt ?? T('documentNotSent')} · ${item.recipient}\n${item.subject}\n${item.body}\n`), ...(document.telegramDeliveries ?? []).map(item => `${T('telegramSentOn')}: ${item.acceptedAt ?? T('telegramNotSent')}\n${item.text}\n`), ...document.returns.map(item => `${T('documentReceivedOn')}: ${item.receivedOn} · [${item.file.fileName}](${item.path})`)].join('\n')}\n`).join('\n'));
  text('daten.json', JSON.stringify({ format: 'praxisraum-client-export-v1', exportedAt: new Date().toISOString(), client, appointments, sessions, notes, invoices, assessments, documents: documentIndex }, null, 2));
  text('README.md', `# ${T('clientExportTitle')}: ${client.name}\n\n${T('clientExportReadme')}\n\n${T('clientExportContents')}\n`);
  for (const attachment of attachments) { const blob = await file(attachment.blobId, attachment.mimeType); archive[attachment.path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]; }
  return { bytes: new Uint8Array(zipSync(archive)), filename: `Praxisraum-${safe(client.name)}-${new Date().toISOString().slice(0, 10)}.zip` };
}
