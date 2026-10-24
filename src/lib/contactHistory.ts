import type { VaultData } from './types';

export type ContactKind = 'document' | 'invoice' | 'paymentReminder' | 'appointmentConfirmation' | 'appointmentReminder' | 'marketing' | 'return';
export interface ContactEvent {
  id: string; at: string; dateOnly?: boolean; channel: 'email' | 'telegram' | 'return'; kind: ContactKind;
  title: string; body?: string; recipient?: string; fileName?: string;
  status: 'sent' | 'unconfirmed' | 'failed' | 'received'; documentId?: string; invoiceId?: string;
}
/** A read-only projection of recorded receipts/returns. Downloads and uploads
 * alone are not labelled sent; no inbox, chat or external service is queried. */
export function contactHistory(data: VaultData, clientId: string): ContactEvent[] {
  if (!data.clients.some(c => c.id === clientId)) return [];
  const events: ContactEvent[] = [];
  const add = (event: ContactEvent) => { if (Number.isFinite(Date.parse(event.at))) events.push(event); };
  for (const document of data.documents.filter(d => d.clientId === clientId)) {
    for (const delivery of document.deliveries) add({ id: `document:${document.id}:email:${delivery.id}`, at: delivery.acceptedAt ?? delivery.requestedAt,
      channel: 'email', kind: delivery.purpose ?? (document.invoiceId ? 'invoice' : 'document'), status: delivery.acceptedAt ? 'sent' : 'unconfirmed',
      title: delivery.subject || document.title, body: delivery.body, recipient: delivery.recipient, fileName: document.file.fileName, documentId: document.id, invoiceId: document.invoiceId });
    for (const delivery of document.telegramDeliveries ?? []) add({ id: `document:${document.id}:telegram:${delivery.id}`, at: delivery.acceptedAt ?? delivery.requestedAt,
      channel: 'telegram', kind: delivery.purpose ?? (document.invoiceId ? 'invoice' : 'document'), status: delivery.acceptedAt ? 'sent' : 'unconfirmed',
      title: document.title, body: delivery.text, recipient: delivery.recipient, fileName: document.file.fileName, documentId: document.id, invoiceId: document.invoiceId });
    for (const returned of document.returns) add({ id: `document:${document.id}:return:${returned.id}`, at: returned.receivedOn, dateOnly: true,
      channel: 'return', kind: 'return', status: 'received', title: document.title, fileName: returned.file.fileName, documentId: document.id });
  }
  for (const appointment of data.appointments.filter(a => a.clientId === clientId)) for (const delivery of appointment.emailDeliveries ?? []) add({
    id: `appointment:${appointment.id}:${delivery.id}`, at: delivery.acceptedAt ?? delivery.requestedAt, channel: 'email', kind: delivery.purpose,
    status: delivery.acceptedAt ? 'sent' : 'unconfirmed', title: delivery.subject, body: delivery.body, recipient: delivery.recipient,
  });
  for (const newsletter of data.newsletters ?? []) for (const recipient of newsletter.recipients.filter(r => r.clientId === clientId)) {
    if (!recipient.requestedAt && !recipient.acceptedAt && recipient.status === 'pending') continue;
    const message = newsletter.messages.find(m => m.id === recipient.messageId); if (!message) continue;
    add({ id: `newsletter:${newsletter.id}:${recipient.id}`, at: recipient.acceptedAt ?? recipient.requestedAt ?? newsletter.createdAt,
      channel: recipient.channel, kind: 'marketing', status: recipient.acceptedAt ? 'sent' : recipient.status === 'failed' ? 'failed' : 'unconfirmed',
      title: recipient.language === 'uk' && message.titleUk ? message.titleUk : message.title,
      body: recipient.language === 'uk' && message.contentUk ? message.contentUk : message.content });
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}
