import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { inspectDocument, MAX_DOCUMENT_BYTES, prepareDelivery, sendDocumentEmail } from '../src/lib/documents';
import { questionnairePdf } from '../src/lib/questionnairePdf';
import { emptyVault, normalizeVault, uid, type ClientDocument } from '../src/lib/types';
import { overrideCloud } from '../src/lib/cloud';
import { referencedBlobs } from '../src/lib/blobs';
import { deleteClient, orphanedBlobs } from '../src/lib/records';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { latestChange } from '../src/lib/backupState';
import { createEmailHandler, type EmailEnvironment } from '../supabase/functions/send-client-email/handler';

const document = (): ClientDocument => ({ id: uid(), clientId: 'client', title: 'Aufgabe', createdAt: '2026-10-21T09:00:00Z', file: { blobId: 'original', fileName: 'aufgabe.pdf', mimeType: 'application/pdf', size: 10 }, returnExpected: true, deliveries: [], returns: [] });
test('documents reject active web content, misleading extensions, empty and oversized files', async () => {
  const pdf = new File(['%PDF-1.7\nexample'], 'aufgabe.pdf'); assert.equal((await inspectDocument(pdf)).mimeType, 'application/pdf');
  assert.equal((await inspectDocument(new File(['Завдання'], 'завдання.txt'))).mimeType, 'text/plain');
  for (const file of [new File(['<script>'], 'bad.html'), new File(['<svg>'], 'bad.svg'), new File(['fake'], 'fake.pdf'), new File([''], 'empty.txt'), new File(['hello'], 'bad\nname.txt')]) await assert.rejects(() => inspectDocument(file));
  await assert.rejects(() => inspectDocument(new File([new Uint8Array(MAX_DOCUMENT_BYTES + 1)], 'large.pdf')), /documentSizeError/);
});
test('both questionnaires contain editable, initially unanswered fields in German and Ukrainian', async () => {
  const font = new Uint8Array(await readFile('src/assets/DejaVuSans.ttf'));
  for (const language of ['de', 'uk'] as const) for (const kind of ['phq9', 'gad7'] as const) {
    const bytes = await questionnairePdf(kind, language, font); const pdf = await PDFDocument.load(bytes); const form = pdf.getForm();
    assert.equal(pdf.getPageCount(), 2); assert.equal(form.getFields().length, (kind === 'phq9' ? 9 : 7) + 2);
    assert.equal(form.getTextField('client_name').getText(), undefined);
    for (let i = 1; i <= (kind === 'phq9' ? 9 : 7); i++) {
      const field = form.getRadioGroup(`answer_${i}`); assert.equal(field.getOptions().length, 4); assert.equal(field.getSelected(), undefined);
      field.select('2'); assert.equal(field.getSelected(), '2');
      for (const widget of field.acroField.getWidgets()) { const r = widget.getRectangle(); assert.ok(r.x >= 0 && r.y > 90 && r.x + r.width < 596 && r.y + r.height < 842); }
    }
    const roundTrip = await PDFDocument.load(await pdf.save({ updateFieldAppearances: false }));
    assert.equal(roundTrip.getForm().getRadioGroup('answer_1').getSelected(), '2');
    assert.equal(pdf.catalog.has((await import('pdf-lib')).PDFName.of('OpenAction')), false);
  }
});
test('documents and every return participate in encrypted storage references, stamping, merging and client deletion', () => {
  const data = emptyVault(); data.clients.push({ id: 'client', name: 'Test', contact: '', preparation: '', language: 'de', createdAt: '2026-01-01', telegramChatId: '', reminderConsent: false });
  const before = structuredClone(data); const doc = document(); data.documents.push(doc); stampChanges(before, data, 100);
  assert.equal(latestChange(data), 100); assert.deepEqual(referencedBlobs(data), ['original']);
  const remote = structuredClone(data); const delivery = prepareDelivery(doc, 'client@example.com', 'Unterlagen', 'Text');
  remote.documents[0].deliveries.push({ ...delivery, providerId: 'provider-1', acceptedAt: '2026-10-21T09:03:00Z' }); remote.documents[0].updatedAt = 200;
  doc.deliveries.push(delivery); doc.returns.push({ id: uid(), receivedOn: '2026-10-21', uploadedAt: '2026-10-21T15:00:00Z', file: { ...doc.file, blobId: 'returned' } }); doc.updatedAt = 300;
  const merged = mergeVaults(data, remote); assert.equal(merged.documents[0].deliveries[0].providerId, 'provider-1'); assert.equal(merged.documents[0].returns.length, 1);
  assert.equal(doc.deliveries[0].acceptedAt, undefined); assert.deepEqual(referencedBlobs(merged).sort(), ['original', 'returned']);
  deleteClient(merged, 'client'); assert.deepEqual(orphanedBlobs(['original', 'returned'], merged), ['original', 'returned']); assert.equal(merged.documents.length, 0);
  const legacy = emptyVault(); delete (legacy as Partial<typeof legacy>).documents; assert.deepEqual(normalizeVault(legacy).documents, []);
});
test('uncertain email retries keep their id; provider acceptance and expiry never silently resend', () => {
  const doc = document(); const delivery = prepareDelivery(doc, 'client@example.com', 'Unterlagen', 'Text', '2026-10-21T09:00:00Z'); doc.deliveries.push(delivery);
  assert.equal(prepareDelivery(doc, delivery.recipient, delivery.subject, delivery.body, '2026-10-21T10:00:00Z').id, delivery.id);
  assert.throws(() => prepareDelivery(doc, delivery.recipient, delivery.subject, delivery.body, '2026-10-22T10:00:00Z'), /emailRetryExpired/);
  delivery.acceptedAt = '2026-10-21T09:01:00Z'; assert.notEqual(prepareDelivery(doc, delivery.recipient, delivery.subject, delivery.body).id, delivery.id);
  assert.throws(() => prepareDelivery(doc, 'bad\r\nBcc:a@b.c', 'Test', ''), /invalidClientEmail/);
});
test('client email transport requires authentication and a real receipt; failures produce no accepted history', async () => {
  const doc = document(); const delivery = prepareDelivery(doc, 'client@example.com', 'Unterlagen', 'Text'); doc.deliveries.push(delivery);
  let invoked = false;
  overrideCloud({ auth: { getUser: async () => ({ data: { user: null }, error: null }) }, functions: { invoke: async () => { invoked = true; } } });
  await assert.rejects(() => sendDocumentEmail(delivery, doc.file, new Blob(['%PDF-1.7'])), /authError/); assert.equal(invoked, false);
  overrideCloud({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) }, functions: { invoke: async (_: string, { body }: { body: any }) => {
    assert.equal(body.requestId, delivery.id); assert.equal(body.to, delivery.recipient); assert.equal(atob(body.attachment.content), '%PDF-1.7');
    assert.equal(body.clientId, undefined); assert.equal(body.vaultId, undefined);
    return { data: null, error: { context: new Response(JSON.stringify({ error: 'emailRateLimited' })) } };
  } } });
  await assert.rejects(() => sendDocumentEmail(delivery, doc.file, new Blob(['%PDF-1.7'])), /emailRateLimited/); assert.equal(doc.deliveries[0].acceptedAt, undefined);
  overrideCloud({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) }, functions: { invoke: async () => ({ data: { providerId: 'provider-1', acceptedAt: '2026-10-21T09:01:00Z' }, error: null }) } });
  assert.equal((await sendDocumentEmail(delivery, doc.file, new Blob(['%PDF-1.7']))).providerId, 'provider-1');
});

const env: EmailEnvironment = { APP_ORIGIN: 'https://app.example.com', EMAIL_OWNER_USER_ID: 'owner', EMAIL_FROM: 'Beratung <praxis@example.com>', RESEND_API_KEY: 'test-only', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public-test' };
const payload = () => ({ requestId: uid(), to: 'client@example.com', subject: 'Unterlagen', text: 'Guten Tag', attachment: { filename: 'aufgabe.pdf', contentType: 'application/pdf', content: btoa('%PDF-1.7\nexample') } });
const request = (body: object, origin = env.APP_ORIGIN!, authorization = 'Bearer test-jwt') => new Request('https://edge.example/send-client-email', { method: 'POST', headers: { origin, authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('email edge handler rejects unconfigured, cross-origin, unauthenticated, foreign-user and malformed requests', async () => {
  let emails = 0; const transport = (async (url: RequestInfo | URL) => { if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'foreign-user' }); emails++; return Response.json({ id: 'provider' }); }) as typeof fetch;
  assert.equal((await createEmailHandler({}, transport)(request(payload()))).status, 403);
  assert.equal((await createEmailHandler({ APP_ORIGIN: env.APP_ORIGIN }, transport)(request(payload()))).status, 501);
  const handler = createEmailHandler(env, transport);
  assert.equal((await handler(request(payload(), 'https://evil.example'))).status, 403);
  assert.equal((await handler(request(payload(), env.APP_ORIGIN, ''))).status, 401);
  assert.equal((await handler(request(payload()))).status, 401); assert.equal(emails, 0);
  const owner = createEmailHandler(env, (async (url: RequestInfo | URL) => { if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'owner' }); emails++; return Response.json({ id: 'provider' }); }) as typeof fetch);
  for (const invalid of [{ ...payload(), subject: 'Test\r\nBcc:evil@example.com' }, { ...payload(), to: 'bad' }, { ...payload(), attachment: { ...payload().attachment, filename: 'bad.html' } }, { ...payload(), attachment: { ...payload().attachment, content: btoa('fake PDF') } }]) assert.equal((await owner(request(invalid))).status, 400);
  assert.equal(emails, 0);
});
test('email edge handler forwards only the selected attachment, uses provider idempotency and acknowledges only success', async () => {
  const data = payload(); const seen: string[] = [];
  const transport = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'owner' });
    assert.equal(String(url), 'https://api.resend.com/emails'); const headers = init!.headers as Record<string, string>; seen.push(headers['Idempotency-Key']);
    const body = JSON.parse(init!.body as string); assert.equal(body.attachments.length, 1); assert.equal(body.attachments[0].content, data.attachment.content); assert.deepEqual(body.to, ['client@example.com']); assert.equal(body.from, env.EMAIL_FROM);
    return Response.json({ id: 'provider-1' });
  }) as typeof fetch;
  const handler = createEmailHandler(env, transport);
  for (let i = 0; i < 2; i++) { const response = await handler(request(data)); assert.equal(response.status, 200); const receipt = await response.json(); assert.equal(receipt.providerId, 'provider-1'); assert.ok(receipt.acceptedAt); }
  assert.equal(seen[0], seen[1]);
  const failed = createEmailHandler(env, (async (url: RequestInfo | URL) => String(url).includes('/auth/v1/user') ? Response.json({ id: 'owner' }) : new Response('', { status: 429 })) as typeof fetch);
  const error = await failed(request(data)); assert.equal(error.status, 429); assert.deepEqual(await error.json(), { error: 'emailRateLimited' });
});
