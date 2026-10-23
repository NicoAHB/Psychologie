import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoice, incomeCsv, nextInvoiceNumber, paidOn, uninvoiced } from '../src/lib/invoice';
import { emptyVault, uid, type Client, type Session } from '../src/lib/types';

const client = (name: string): Client => ({ id: uid(), name, contact: '', preparation: '', telegramChatId: '', language: 'de', reminderConsent: false, createdAt: '2026-01-01', address: 'Hauptstr. 1\n10115 Berlin' });
const session = (clientId: string, date: string, feeCents: number, paidAt: string | null = null): Session => ({ id: uid(), clientId, date, time: '10:00', feeCents, paidAt, notes: '', tags: [] });
function sample() {
  const data = emptyVault(); const a = client('=HYPERLINK("x")'); const b = client('Boris; "B"');
  data.clients.push(a, b); data.settings.practice = { ...data.settings.practice, name: 'Praxis Muster', invoicePrefix: 'R-', serviceName: 'Psychologische Beratung' };
  data.sessions.push(session(a.id, '2026-01-10', 8500, '2026-02-01'), session(a.id, '2026-01-17', 9000), session(b.id, '2026-03-02', 7050, '2026-03-05'));
  return { data, a, b };
}
test('invoice numbers count up per prefix and year without gaps', () => {
  const { data, a } = sample();
  assert.equal(nextInvoiceNumber(data, '2026-05-01'), 'R-2026-001');
  const first = buildInvoice(data, a, data.sessions.slice(0, 2), '2026-05-01', 'de', uid()); data.invoices.push(first);
  assert.equal(first.number, 'R-2026-001'); assert.equal(first.totalCents, 17500); assert.equal(first.lines[0].description, 'Psychologische Beratung');
  assert.equal(nextInvoiceNumber(data, '2026-06-01'), 'R-2026-002'); assert.equal(nextInvoiceNumber(data, '2027-01-02'), 'R-2027-001');
  assert.equal(nextInvoiceNumber(data, '2026-06-01', ''), '2026-001');
});
test('an invoice keeps a snapshot of the recipient and the practice, and the default service name follows the language', () => {
  const { data, a } = sample(); data.settings.practice.serviceName = '';
  const invoice = buildInvoice(data, a, [data.sessions[0]], '2026-05-01', 'uk', uid());
  data.settings.practice.name = 'Umbenannt'; a.address = 'Neue Adresse';
  assert.equal(invoice.sender.name, 'Praxis Muster'); assert.equal(invoice.recipient.address, 'Hauptstr. 1\n10115 Berlin'); assert.equal(invoice.lines[0].description, 'Консультаційна зустріч');
  assert.throws(() => buildInvoice(data, a, [], '2026-05-01', 'de', uid()), /noSessions/);
});
test('only sessions without an invoice are offered, oldest first; paid status needs every session paid', () => {
  const { data, a } = sample(); const invoice = buildInvoice(data, a, data.sessions.slice(0, 2), '2026-05-01', 'de', uid()); data.invoices.push(invoice);
  assert.equal(uninvoiced(data, a.id).length, 2); data.sessions[0].invoiceId = invoice.id; assert.equal(uninvoiced(data, a.id).length, 1);
  assert.equal(paidOn(data, invoice), null); data.sessions[1].paidAt = '2026-06-01'; assert.equal(paidOn(data, invoice), '2026-06-01');
});
test('CSV export lists income by payment date, pseudonymises clients by default and defuses formulas', () => {
  const { data } = sample(); const csv = incomeCsv(data, 2026, false, 'de');
  assert.ok(csv.startsWith('﻿Zahlungsdatum;Termindatum;Klient;Rechnung;Euro-Vergleich (EUR);Originalbetrag;Originalwährung;Wechselkurs EUR → UAH;Kursdatum;Kursquelle\r\n'));
  assert.deepEqual(csv.trim().split('\r\n').slice(1), ['2026-02-01;2026-01-10;Klient 1;;85;85;EUR;;;', '2026-03-05;2026-03-02;Klient 2;;71;71;EUR;;;']);
  const named = incomeCsv(data, 2026, true, 'de');
  assert.ok(named.includes(`"'=HYPERLINK(""x"")"`) || named.includes("'=HYPERLINK"), 'formula prefix is neutralised'); assert.ok(named.includes('"Boris; ""B"""'));
  assert.equal(incomeCsv(data, 2025, true, 'de').trim().split('\r\n').length, 1);
});
