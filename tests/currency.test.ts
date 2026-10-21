import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bankFor, billAmount, convertWhole, currencyOf, fetchNbuRate, parseNbu, parseRate, validRate } from '../src/lib/currency';
import { attachInvoice, buildInvoice, incomeCsv } from '../src/lib/invoice';
import { money, parseMoney } from '../src/lib/dates';
import { emptyVault, normalizeVault, uid, type ExchangeRate, type Session } from '../src/lib/types';
import { InvoiceSheet } from '../src/components/invoices';
const rate: ExchangeRate = { micros: 48_125_600, date: '2026-10-21', source: 'nbu' };
function sample() {
  const data = emptyVault();
  const client = { id: uid(), name: 'Test', contact: '', createdAt: '2026-01-01', language: 'uk' as const, preparation: '', telegramChatId: '', reminderConsent: false, currency: 'UAH' as const };
  data.clients.push(client); data.settings.exchangeRate = { ...rate };
  data.settings.practice = { ...data.settings.practice, name: 'Praxis Test', iban: 'DE-EXAMPLE', bank: 'German example bank', ibanUa: 'UA-EXAMPLE', bankUa: 'Ukrainian example bank', accountHolderUa: 'Test UA' };
  const session: Session = { id: uid(), clientId: client.id, date: '2026-10-20', time: '12:00', feeCents: 8500, notes: '', tags: [], paidAt: '2026-10-21' };
  data.sessions.push(session);
  return { data, client, session };
}
test('whole currency inputs reject every fraction and both locales display no fractional digits', () => {
  assert.equal(parseMoney('85'), 8500); assert.equal(parseMoney('0'), 0);
  for (const value of ['85,00', '85.00', '85,5', '85.5', '-1', '1e3', '1 000', '9999999']) assert.throws(() => parseMoney(value), /invalidAmount/);
  assert.equal(money(8500, 'de'), '85 €');
  assert.ok(!/\d[.,]\d{2}(?:\D|$)/.test(money(409100, 'uk', 'UAH')));
});
test('exchange rates retain six decimal places and are validated separately from amounts', () => {
  assert.equal(parseRate('48,1256'), 48125600); assert.equal(parseRate('48.123456'), 48123456);
  for (const value of ['0', '-48', 'NaN', '48.1234567', '1e6', '']) assert.throws(() => parseRate(value), /invalidRate/);
  assert.equal(validRate(rate), true); assert.equal(validRate({ ...rate, micros: Infinity }), false);
});
test('whole-unit conversion is exact at half boundaries, in both directions', () => {
  assert.equal(convertWhole(8500, 'EUR', 'UAH', rate), 409100);
  assert.equal(convertWhole(8500, 'EUR', 'UAH', { ...rate, micros: 48500000 }), 412300);
  assert.equal(convertWhole(400000, 'UAH', 'EUR', rate), 8300);
  assert.equal(convertWhole(0, 'EUR', 'UAH', rate), 0);
  assert.throws(() => convertWhole(8500, 'EUR', 'UAH'), /rateRequired/);
  assert.throws(() => convertWhole(-100, 'EUR', 'UAH', rate), /invalidAmount/);
});
test('EUR entry produces a fixed native UAH charge; UAH entry still has a whole EUR comparison', () => {
  assert.deepEqual(billAmount(8500, 'EUR', 'UAH', rate), { feeCents: 8500, billing: { currency: 'UAH', amountCents: 409100, rate } });
  const native = billAmount(400000, 'UAH', 'UAH', rate);
  assert.equal(native.feeCents, 8300); assert.equal(native.billing.amountCents, 400000);
  assert.throws(() => billAmount(8550, 'EUR', 'UAH', rate), /invalidAmount/);
  assert.equal(currencyOf({}), 'EUR');
});
test('NBU parsing accepts only the EUR record and a real date; request sends no identifiers or credentials', async () => {
  const rows = [{ r030: 978, cc: 'EUR', rate: 48.1256, exchangedate: '21.10.2026' }];
  assert.deepEqual(parseNbu(rows), rate);
  assert.throws(() => parseNbu([{ ...rows[0], cc: 'USD' }]));
  assert.throws(() => parseNbu([{ ...rows[0], rate: -1 }]));
  assert.throws(() => parseNbu([{ ...rows[0], exchangedate: '31.02.2026' }]));
  let observed = false;
  const request = (async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(url), 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json');
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.referrerPolicy, 'no-referrer'); assert.equal(init?.body, undefined); observed = true;
    return new Response(JSON.stringify(rows));
  }) as typeof fetch;
  assert.deepEqual(await fetchNbuRate(request), rate); assert.equal(observed, true);
  await assert.rejects(() => fetchNbuRate((async () => new Response('', { status: 503 })) as typeof fetch), /rateLoadFailed/);
});
test('invoice selects the correct bank, contains only UAH, and snapshots EUR comparison outside the document', () => {
  const { data, client, session } = sample();
  const invoice = buildInvoice(data, client, [session], '2026-10-21', 'uk', uid());
  assert.equal(invoice.currency, 'UAH'); assert.equal(invoice.totalCents, 409100); assert.equal(invoice.totalEuroCents, 8500);
  const html = renderToStaticMarkup(createElement(InvoiceSheet, { invoice, paid: null }));
  assert.ok(html.includes('UA-EXAMPLE')); assert.ok(html.includes('Ukrainian example bank'));
  assert.ok(!html.includes('DE-EXAMPLE')); assert.ok(!html.includes('German example bank'));
  assert.ok(!html.includes('EUR')); assert.ok(!html.includes('€')); assert.ok(!html.includes('85,00'));
  data.settings.practice.ibanUa = 'CHANGED'; data.settings.exchangeRate!.micros += 1; assert.equal(invoice.paymentAccount?.iban, 'UA-EXAMPLE'); assert.equal(invoice.lines[0].rate?.micros, 48125600); 
  assert.equal(bankFor(data.settings.practice, 'EUR').iban, 'DE-EXAMPLE');
});
test('existing native UAH prices never change when the next daily rate changes', () => {
  const { data, client, session } = sample(); Object.assign(session, billAmount(8500, 'EUR', 'UAH', rate));
  const invoice = buildInvoice(data, client, [session], '2026-10-22', 'de', uid(), { rate: { ...rate, micros: 52000000 } });
  assert.equal(invoice.totalCents, 409100); assert.equal(invoice.lines[0].rate?.micros, rate.micros);
  const eur = buildInvoice(data, client, [session], '2026-10-22', 'de', uid(), { currency: 'EUR' });
  assert.equal(eur.totalCents, 8500); assert.equal(eur.paymentAccount?.iban, 'DE-EXAMPLE');
});
test('migration rounds existing invoices per line, preserves exact originals, and is idempotent without mutating its input', () => {
  const { data, client, session } = sample(); session.feeCents = 8550;
  data.invoices.push({ id: uid(), number: '2026-001', clientId: client.id, issuedAt: '2026-10-20', language: 'de', sender: data.settings.practice, recipient: { name: client.name, address: '' }, lines: [{ sessionId: session.id, date: session.date, description: 'Sitzung', amountCents: 8550 }, { sessionId: uid(), date: session.date, description: 'Sitzung', amountCents: 8550 }], totalCents: 17100 });
  const result = normalizeVault(data);
  assert.equal(data.sessions[0].feeCents, 8550); assert.equal(data.invoices[0].lines[0].amountCents, 8550);
  assert.equal(result.sessions[0].feeCents, 8600); assert.equal(result.sessions[0].originalFeeCents, 8550);
  assert.equal(result.invoices[0].totalCents, 17200); assert.equal(result.invoices[0].originalAmounts?.totalCents, 17100);
  assert.equal(result.invoices[0].originalAmounts?.lines[0].amountCents, 8550);
  assert.deepEqual(normalizeVault(result), result); assert.equal(normalizeVault(data, false).invoices[0].lines[0].amountCents, 8550);
});
test('income export retains original currency and exact agreed rate next to whole EUR comparisons', () => {
  const { data, session } = sample(); Object.assign(session, billAmount(8500, 'EUR', 'UAH', rate));
  const csv = incomeCsv(data, 2026, false, 'de');
  assert.ok(csv.includes(';85;4091;UAH;48,1256;2026-10-21;nbu'));
  assert.ok(!csv.includes('Test')); assert.ok(csv.includes('Originalwährung'));
});

test('issuing a UAH invoice for an older EUR session updates the native payment ledger and CSV', () => {
  const { data, client, session } = sample();
  const invoice = buildInvoice(data, client, [session], '2026-10-21', 'uk', uid());
  attachInvoice(data, invoice);
  assert.equal(data.sessions[0].billing?.currency, 'UAH');
  assert.equal(data.sessions[0].billing?.amountCents, 409100);
  assert.equal(data.sessions[0].feeCents, 8500);
  assert.ok(incomeCsv(data, 2026, false, 'de').includes(';85;4091;UAH;48,1256;2026-10-21;nbu'));
});
