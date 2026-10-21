import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { invoicePdf } from '../src/lib/invoicePdf';
import { invoiceFilename, invoiceMessage } from '../src/lib/invoiceMessage';
import { buildInvoice } from '../src/lib/invoice';
import { emptyVault, uid, type Client, type ClientDocument, type TelegramDelivery } from '../src/lib/types';
import { mergeVaults } from '../src/lib/merge';
import { overrideCloud } from '../src/lib/cloud';
import { sendInvoiceTelegram, validTelegramChat } from '../src/lib/telegram';
import { createTelegramHandler, type TelegramEnvironment } from '../supabase/functions/send-client-telegram/handler';

function sample() {
  const data = emptyVault(); const client: Client = { id: 'client', name: 'Олена Приклад', createdAt: '2026-01-01', language: 'uk', currency: 'UAH', email: 'olena@example.com', preparation: '', contact: '', telegramChatId: '123456789', reminderConsent: false, address: 'вул. Прикладна 1\nКиїв' };
  data.clients.push(client); data.settings.exchangeRate = { micros: 48125600, source: 'nbu', date: '2026-10-21' };
  Object.assign(data.settings.practice, { name: 'Ірина Приклад', address: 'Musterweg 1\n10115 Berlin', iban: 'DE-EXAMPLE', ibanUa: 'UA-EXAMPLE', bankUa: 'Банк України', serviceName: 'Психологічна консультація', taxNote: 'Приклад примітки' });
  data.sessions.push({ id: 'session', clientId: client.id, date: '2026-10-20', time: '14:00', notes: 'SECRET CLINICAL NOTE', feeCents: 8500, paidAt: null, tags: [] });
  const invoice = buildInvoice(data, client, data.sessions, '2026-10-21', 'uk', uid()); return { data, client, invoice };
}
test('invoice correspondence follows the client language with native currency only and a safe PDF filename', () => {
  const { client, invoice } = sample(); const uk = invoiceMessage(invoice, client); assert.match(uk.subject, /Ваш рахунок/); assert.match(uk.body, /Добрий день, Олена/); assert.match(uk.body, /₴|грн/); assert.doesNotMatch(uk.body, /EUR|€|SECRET/);
  const de = invoiceMessage(invoice, { ...client, language: 'de' }); assert.match(de.subject, /Ihre Rechnung/); assert.match(de.body, /Guten Tag/); assert.match(de.body, /UAH/); assert.doesNotMatch(de.body, /€|SECRET/);
  assert.doesNotMatch(invoiceFilename({ ...invoice, number: '2026/001\n../x' }), /[\r\n/\\]/);
});
test('local invoice PDF supports Cyrillic, many pages and long descriptions without changing its snapshot', async () => {
  const { invoice } = sample();
  const [regular, bold] = await Promise.all([readFile('src/assets/DejaVuSans.ttf'), readFile('src/assets/DejaVuSans-Bold.ttf')]);
  const original = structuredClone(invoice);
  for (const language of ['de', 'uk'] as const) {
    const bytes = await invoicePdf({ ...invoice, language }, null, regular, bold); const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1); assert.match(pdf.getTitle()!, new RegExp(invoice.number)); assert.equal(pdf.getForm().getFields().length, 0);
    if (process.env.SAVE_INVOICE_PDFS) await writeFile(`/tmp/praxisraum-invoice-${language}.pdf`, bytes);
  }
  const many = { ...invoice, lines: Array.from({ length: 85 }, (_, i) => ({ ...invoice.lines[0], sessionId: `s${i}`, description: `${i + 1}. Психологічна консультація — ${'Підготовка '.repeat(i % 5)}` })), totalCents: invoice.totalCents * 85 };
  const bytes = await invoicePdf(many, null, regular, bold); assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 4);
  const long = await invoicePdf({ ...invoice, lines: [{ ...invoice.lines[0], description: 'довгийтекст'.repeat(300) }] }, '2026-10-21', regular, bold); assert.ok((await PDFDocument.load(long)).getPageCount() >= 2);
  if (process.env.SAVE_INVOICE_PDFS) { await writeFile('/tmp/praxisraum-invoice-many.pdf', bytes); await writeFile('/tmp/praxisraum-invoice-long.pdf', long); }
  assert.deepEqual(invoice, original);
});
test('Telegram receipts are merged independently from email and document returns', () => {
  const { data } = sample(); const delivery: TelegramDelivery = { id: uid(), recipient: '123456789', requestedAt: '2026-10-21T12:00:00Z', text: 'Рахунок' };
  const doc: ClientDocument = { id: uid(), clientId: 'client', title: 'Рахунок', file: { blobId: uid(), fileName: 'invoice.pdf', mimeType: 'application/pdf', size: 100 }, createdAt: '2026-10-21', returnExpected: false, deliveries: [], returns: [], telegramDeliveries: [delivery] };
  data.documents.push(doc); const remote = structuredClone(data); Object.assign(remote.documents[0].telegramDeliveries![0], { acceptedAt: '2026-10-21T12:01:00Z', messageId: 42 });
  data.documents[0].updatedAt = 500; remote.documents[0].updatedAt = 100;
  assert.equal(mergeVaults(data, remote).documents[0].telegramDeliveries![0].messageId, 42); assert.equal(delivery.acceptedAt, undefined);
});

const env: TelegramEnvironment = { APP_ORIGIN: 'https://app.example.com', TELEGRAM_OWNER_USER_ID: 'owner', TELEGRAM_BOT_TOKEN: 'test-only', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public' };
const payload = () => ({ chatId: '123456789', text: 'Ваш рахунок у вкладенні.', attachment: { filename: 'invoice.pdf', content: btoa('%PDF-1.7\ntest') } });
const req = (body: object = payload(), origin = env.APP_ORIGIN!, authorization = 'Bearer test-jwt') => new Request('https://edge.example/send-client-telegram', { method: 'POST', headers: { origin, authorization }, body: JSON.stringify(body) });
test('Telegram endpoint rejects unconfigured, foreign-origin/user, invalid PDF and group recipients before sending', async () => {
  let sends = 0;
  const transport = (async (url: RequestInfo | URL) => { if (String(url).includes('/auth/')) return Response.json({ id: 'owner' }); sends++; return Response.json({ ok: true }); }) as typeof fetch;
  assert.equal((await createTelegramHandler({ APP_ORIGIN: env.APP_ORIGIN }, transport)(req())).status, 501);
  const handler = createTelegramHandler(env, transport);
  assert.equal((await handler(req(payload(), 'https://evil.example'))).status, 403); assert.equal((await handler(req(payload(), env.APP_ORIGIN, ''))).status, 401);
  assert.equal((await createTelegramHandler(env, (async () => Response.json({ id: 'foreign' })) as typeof fetch)(req())).status, 401);
  for (const bad of [{ ...payload(), chatId: '-10012345678' }, { ...payload(), chatId: '@channel' }, { ...payload(), text: 'a'.repeat(1025) }, { ...payload(), attachment: { filename: 'fake.pdf', content: btoa('fake') } }, { ...payload(), attachment: { ...payload().attachment, filename: '../x.pdf' } }]) assert.equal((await handler(req(bad))).status, 400);
  assert.equal(sends, 0); assert.equal(validTelegramChat('-123'), false);
});
test('Telegram sends one selected PDF with literal caption, no retries, and confirms only a matching private-chat receipt', async () => {
  let sends = 0;
  const handler = createTelegramHandler(env, (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).includes('/auth/')) return Response.json({ id: 'owner' }); sends++;
    assert.equal(String(url), 'https://api.telegram.org/bottest-only/sendDocument');
    const form = init!.body as FormData; assert.equal(form.get('caption'), payload().text); assert.equal(form.get('parse_mode'), null); assert.equal(await (form.get('document') as Blob).text(), '%PDF-1.7\ntest');
    return Response.json({ ok: true, result: { message_id: 42, date: 1792584000, chat: { id: 123456789, type: 'private' } } });
  }) as typeof fetch);
  const result = await handler(req()); assert.equal(result.status, 200); assert.equal((await result.json()).messageId, 42); assert.equal(sends, 1);
  let failed = 0;
  const uncertain = createTelegramHandler(env, (async (url: RequestInfo | URL) => { if (String(url).includes('/auth/')) return Response.json({ id: 'owner' }); failed++; throw new Error('timeout'); }) as typeof fetch);
  assert.equal((await uncertain(req())).status, 502); assert.equal(failed, 1);
});
test('browser Telegram transport requires authentication and a real receipt', async () => {
  const delivery: TelegramDelivery = { id: uid(), recipient: '123456789', requestedAt: new Date().toISOString(), text: 'Рахунок' }; const file = { blobId: 'b', fileName: 'invoice.pdf', mimeType: 'application/pdf', size: 10 };
  let calls = 0; overrideCloud({ auth: { getUser: async () => ({ data: { user: null }, error: null }) }, functions: { invoke: async () => { calls++; } } });
  await assert.rejects(() => sendInvoiceTelegram(delivery, file, new Blob(['%PDF-1.7'])), /authError/); assert.equal(calls, 0);
  overrideCloud({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) }, functions: { invoke: async (_: string, { body }: { body: any }) => { assert.equal(body.chatId, delivery.recipient); assert.equal(atob(body.attachment.content), '%PDF-1.7'); return { data: {}, error: null }; } } });
  await assert.rejects(() => sendInvoiceTelegram(delivery, file, new Blob(['%PDF-1.7'])), /telegramSendError/); assert.equal(delivery.acceptedAt, undefined); overrideCloud(null);
});
