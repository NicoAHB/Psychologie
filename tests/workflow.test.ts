import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { attachInvoice, billingConflicts, buildInvoice, canRemindInvoice, cancellationOf, invoiceOutstanding, invoiceOverdue, invoicePaymentTerm, isSessionVoided, paidOn, reviseInvoice, uninvoiced } from '../src/lib/invoice';
import { invoiceMessage } from '../src/lib/invoiceMessage';
import { invoicePdf } from '../src/lib/invoicePdf';
import { incomeCsv } from '../src/lib/invoice';
import { pendingReturns, practiceToday } from '../src/lib/followUp';
import { overviewOf } from '../src/lib/discussion';
import { mergeVaults } from '../src/lib/merge';
import { emptyVault, uid, type ClientDocument } from '../src/lib/types';

function sample(currency: 'EUR' | 'UAH' = 'EUR') {
  const data = emptyVault(); const client = { id: 'client', name: 'Олена Приклад', address: 'Київ', contact: '', preparation: '', createdAt: '2026-01-01', telegramChatId: '', reminderConsent: false, language: 'uk' as const, currency };
  data.clients.push(client); data.settings.exchangeRate = { micros: 48125600, date: '2026-10-21', source: 'manual' };
  Object.assign(data.settings.practice, { name: 'Praxis Test', iban: 'DE-TEST', ibanUa: 'UA-TEST' });
  data.sessions.push({ id: 's1', clientId: client.id, date: '2026-10-01', time: '14:00', feeCents: 8500, paidAt: null, notes: '', tags: [] }, { id: 's2', clientId: client.id, date: '2026-10-02', time: '14:00', feeCents: 8500, paidAt: null, notes: '', tags: [] });
  const invoice = buildInvoice(data, client, data.sessions, '2026-10-03', 'uk', uid()); attachInvoice(data, invoice); return { data, client, invoice };
}
test('new invoices are due immediately, custom terms remain valid and legacy invoices keep their deadline', () => {
  const { data, client, invoice } = sample(); assert.equal(invoice.dueOn, '2026-10-03');
  assert.equal(invoicePaymentTerm(invoice, 'de'), 'Sofort'); assert.equal(invoicePaymentTerm(invoice, 'uk'), 'Негайно');
  assert.equal(invoiceOverdue(data, invoice, '2026-10-03'), false); assert.equal(invoiceOverdue(data, invoice, '2026-10-04'), true);
  assert.equal(buildInvoice(data, client, data.sessions, '2026-12-25', 'de', uid()).dueOn, '2026-12-25');
  const custom = buildInvoice(data, client, data.sessions, '2026-10-03', 'de', uid(), { dueOn: '2026-10-17' });
  assert.equal(custom.dueOn, '2026-10-17'); assert.equal(invoicePaymentTerm(custom), '17.10.2026');
  invoice.dueOn = '2026-10-17'; const before = structuredClone(invoice);
  buildInvoice(data, client, data.sessions, '2026-10-21', 'de', uid()); assert.deepEqual(invoice, before);
  assert.throws(() => buildInvoice(data, client, data.sessions, '2026-10-03', 'de', uid(), { dueOn: '2026-10-02' }), /invalidInvoiceDate/);
  delete invoice.dueOn; assert.equal(invoiceOverdue(data, invoice, '2026-12-01'), false); assert.equal(invoicePaymentTerm(invoice), '—');
});
test('overdue balance includes only unpaid invoice positions; paid, reversed and ambiguous invoices cannot trigger reminders', () => {
  const { data, invoice } = sample('UAH'); invoice.dueOn = '2026-10-17'; assert.equal(invoiceOverdue(data, invoice, '2026-10-17'), false); assert.equal(invoiceOverdue(data, invoice, '2026-10-18'), true);
  data.sessions[0].paidAt = '2026-10-10'; assert.equal(invoiceOutstanding(data, invoice), invoice.lines[1].amountCents);
  data.sessions[1].paidAt = '2026-10-11'; assert.equal(invoiceOutstanding(data, invoice), 0); assert.equal(invoiceOverdue(data, invoice, '2026-10-18'), false);
  data.sessions.pop(); assert.equal(invoiceOutstanding(data, invoice), null); assert.equal(paidOn(data, invoice), null);
});
test('an opened payment reminder becomes invalid if another device changes the payment balance', () => {
  const { data, invoice } = sample(); const balance = invoiceOutstanding(data, invoice); assert.equal(canRemindInvoice(data, invoice, balance), true); data.sessions[0].paidAt = '2026-10-21'; assert.equal(canRemindInvoice(data, invoice, balance), false); assert.equal(canRemindInvoice(data, invoice, invoiceOutstanding(data, invoice)), true);
});

test('a reversal preserves the original, snapshots and actual receipts; unpaid fees stop contributing to outstanding totals', () => {
  const { data, invoice } = sample(); data.sessions[0].paidAt = '2026-10-10'; const original = structuredClone(invoice); const csv = incomeCsv(data, 2026, false, 'de');
  const { cancellation } = reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', reason: 'Rechnung aufgehoben', cancellationId: uid() });
  assert.deepEqual(invoice, original); assert.equal(cancellation.totalCents, -17000); assert.equal(cancellation.lines[0].amountCents, -8500); assert.equal(cancellation.cancels?.number, invoice.number); assert.equal(cancellation.dueOn, undefined);
  assert.equal(cancellationOf(data, invoice.id)?.id, cancellation.id); assert.equal(invoiceOutstanding(data, invoice), 0); assert.equal(overviewOf(data, 'client').unpaidCents, 0); assert.equal(isSessionVoided(data, data.sessions[1]), true); assert.equal(uninvoiced(data, 'client').length, 2);
  assert.equal(data.sessions[0].paidAt, '2026-10-10'); assert.equal(incomeCsv(data, 2026, false, 'de'), csv);
  data.sessions[1].paidAt = '2026-10-22'; assert.equal(paidOn(data, invoice), null, 'later payments must not rewrite the reversed original'); assert.equal(cancellation.paymentSnapshot?.[1].paidAt, null);
  const before = structuredClone(data); assert.throws(() => reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', reason: 'Noch einmal', cancellationId: uid() }), /invoiceInactive/); assert.deepEqual(data, before);
});
test('correction is atomic, sequentially numbered and updates unpaid whole native amounts using the frozen rate', () => {
  const { data, invoice } = sample('UAH'); const before = structuredClone(data);
  const replacement = { id: uid(), dueOn: '2026-11-04', language: 'uk' as const, recipient: { name: 'Олена Виправлена', address: 'Нова адреса' }, sender: invoice.sender, paymentAccount: invoice.paymentAccount!, lines: invoice.lines.map(l => ({ sessionId: l.sessionId, amountCents: 480000, description: 'Виправлена консультація' })) };
  assert.throws(() => reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: '', replacement }), /required/); assert.deepEqual(data, before);
  const result = reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: 'Адреса та сума', replacement });
  assert.equal(result.cancellation.number, '2026-002'); assert.equal(result.replacement!.number, '2026-003'); assert.equal(result.replacement!.totalCents, 960000); assert.equal(result.replacement!.totalEuroCents, 20000); assert.equal(data.sessions[0].feeCents, 10000); assert.equal(data.sessions[0].billing?.amountCents, 480000); assert.equal(data.sessions[0].invoiceId, replacement.id); assert.equal(uninvoiced(data, 'client').length, 0); assert.equal(invoice.totalCents, before.invoices[0].totalCents);
});
test('paid amount changes are rejected without a partial reversal; metadata corrections preserve the payment date', () => {
  const { data, invoice } = sample(); data.sessions[0].paidAt = '2026-10-10';
  const replacement = { id: uid(), dueOn: '2026-11-04', language: 'de' as const, recipient: { name: 'Corrected', address: 'New address' }, sender: invoice.sender, paymentAccount: invoice.paymentAccount!, lines: invoice.lines.map(l => ({ sessionId: l.sessionId, amountCents: l.amountCents + 100, description: l.description })) };
  const before = structuredClone(data); assert.throws(() => reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: 'Korrektur', replacement }), /invoicePaidAmountLocked/); assert.deepEqual(data, before);
  replacement.lines.forEach((l, i) => l.amountCents = invoice.lines[i].amountCents); reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: 'Adresse', replacement }); assert.equal(data.sessions[0].paidAt, '2026-10-10'); assert.equal(data.sessions[0].feeCents, 8500);
});
test('merging a concurrent note edit restores the valid replacement link, and concurrent replacements are flagged', () => {
  const { data, invoice } = sample(); const stale = structuredClone(data);
  const replacement = { id: uid(), dueOn: '2026-11-04', language: 'de' as const, recipient: invoice.recipient, sender: invoice.sender, paymentAccount: invoice.paymentAccount!, lines: invoice.lines.map(l => ({ ...l, amountCents: 9000 })) };
  reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: 'Betrag', replacement }); stale.sessions[0].updatedAt = 999; stale.sessions[0].notes = 'Updated note';
  const merged = mergeVaults(data, stale); assert.equal(merged.sessions[0].invoiceId, replacement.id); assert.equal(merged.sessions[0].feeCents, 9000); assert.equal(merged.sessions[0].notes, 'Updated note');
  merged.invoices.push({ ...structuredClone(merged.invoices.at(-1)!), id: uid(), number: '2026-004' }); assert.ok(billingConflicts(merged).includes('2026-004')); assert.equal(invoiceOutstanding(merged, merged.invoices.at(-1)!), null);
});
test('a duplicate reversal also blocks payment reminders for its replacement descendants', () => {
  const { data, invoice } = sample(); const replacement = { id: uid(), dueOn: '2026-11-04', language: 'de' as const, recipient: invoice.recipient, sender: invoice.sender, paymentAccount: invoice.paymentAccount!, lines: invoice.lines.map(l => ({ ...l })) };
  const result = reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: 'Korrektur', replacement }); data.invoices.push({ ...structuredClone(result.cancellation), id: uid(), number: '2026-004' });
  assert.ok(billingConflicts(data).includes(result.replacement!.number)); assert.equal(invoiceOutstanding(data, result.replacement!), null); assert.equal(canRemindInvoice(data, result.replacement!, 17000), false);
});
test('duplicate active invoice numbers are flagged even for distinct sessions; cancelling the mistaken document resolves the live claim', () => {
  const { data, invoice } = sample(); const second = { ...structuredClone(invoice), id: uid(), lines: [{ ...invoice.lines[0], sessionId: 'another-session' }], totalCents: 8500 }; data.invoices.push(second); data.sessions.push({ ...data.sessions[0], id: 'another-session', invoiceId: second.id });
  assert.equal(invoiceOutstanding(data, invoice), null); assert.ok(billingConflicts(data).includes(invoice.number)); reviseInvoice(data, second.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: 'Doppelt vergeben' }); assert.equal(invoiceOutstanding(data, invoice), 17000);
});

test('correspondence uses client language and only native outstanding money, with reversal and replacement references', () => {
  const { data, invoice, client } = sample('UAH'); data.sessions[0].paidAt = '2026-10-10'; const body = invoiceMessage(invoice, client, 'paymentReminder', invoiceOutstanding(data, invoice)!).body;
  assert.match(body, /Добрий день/); assert.doesNotMatch(body, /€|EUR/); assert.match(body, /03.10.2026/); assert.ok(body.includes(new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 }).format(invoice.lines[1].amountCents / 100)));
  const result = reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', cancellationId: uid(), reason: 'Виправлення' }); const message = invoiceMessage(result.cancellation, { ...client, language: 'de' }); assert.match(message.subject, /Storno/); assert.match(message.body, new RegExp(invoice.number)); assert.match(message.body, /keine Zahlung/);
});
test('return queue distinguishes unsent, waiting and overdue; received or closed documents disappear without deleting history', () => {
  const { data } = sample(); const doc = (id: string): ClientDocument => ({ id, clientId: 'client', title: id, createdAt: '2026-10-01T09:00:00Z', file: { blobId: id, fileName: 'test.pdf', mimeType: 'application/pdf', size: 10 }, returnExpected: true, returnDueOn: '2026-10-15', deliveries: [], returns: [] });
  const unsent = doc('unsent'); const overdue = doc('overdue'); overdue.deliveries.push({ id: uid(), recipient: 'client@example.com', requestedAt: '2026-10-01', acceptedAt: '2026-10-01', subject: '', body: '' }); const waiting = { ...structuredClone(overdue), id: 'waiting', returnDueOn: '2026-10-30' }; const done = { ...structuredClone(overdue), id: 'done', returnClosedAt: '2026-10-20' }; const received = { ...structuredClone(overdue), id: 'received', returns: [{ id: uid(), file: overdue.file, receivedOn: '2026-10-20', uploadedAt: '2026-10-20' }] };
  data.documents.push(unsent, overdue, waiting, done, received); assert.deepEqual(pendingReturns(data, '2026-10-21').map(r => [r.document.id, r.status]), [['overdue','overdue'],['waiting','waiting'],['unsent','notSent']]); assert.equal(data.documents.length, 5);
  assert.equal(practiceToday({ timeZone: 'Europe/Kyiv' }, new Date('2026-10-21T22:30:00Z')), '2026-10-22');
});
test('reversal PDFs keep Cyrillic references and native negative amounts without bank instructions or an artificial due date', async () => {
  const { data, invoice } = sample('UAH'); const { cancellation } = reviseInvoice(data, invoice.id, { issuedAt: '2026-10-21', reason: 'Виправлення адреси', cancellationId: uid() });
  const [regular, bold] = await Promise.all([readFile('src/assets/DejaVuSans.ttf'), readFile('src/assets/DejaVuSans-Bold.ttf')]); const bytes = await invoicePdf(cancellation, null, regular, bold); const pdf = await PDFDocument.load(bytes); assert.match(pdf.getTitle()!, /Сторнувальний/); assert.equal(pdf.getPageCount(), 1);
  if (process.env.SAVE_INVOICE_PDFS) await writeFile('/tmp/praxisraum-cancellation.pdf', bytes);
});
