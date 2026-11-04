import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { emptyVault, normalizeVault, uid, type InvoiceLogo, type VaultData } from '../src/lib/types';
import { defaultInvoiceLogo, INVOICE_LOGO_MAX_BYTES, readInvoicePng, validateInvoiceLogo, validateInvoicePng } from '../src/lib/invoiceLogo';
import { attachInvoice, buildInvoice, reviseInvoice } from '../src/lib/invoice';
import { invoicePdf } from '../src/lib/invoicePdf';
import { encryptVault, decryptVault, encryptBytes, decryptBytes, randomSalt } from '../src/lib/crypto';
import { recordSnapshot, readSnapshot, historyBlobIds } from '../src/lib/history';
import { referencedBlobs } from '../src/lib/blobs';
import { deleteClient, orphanedBlobs } from '../src/lib/records';
import { mergeVaults, stampChanges } from '../src/lib/merge';
import { stateOf, syncConflicts, resolveConflict } from '../src/lib/crdt';
import { clientExport } from '../src/lib/clientExport';

const png = new Uint8Array(await readFile('src/assets/nadiia-logo-en.png'));
const custom = (id = 'private-logo'): InvoiceLogo => ({ enabled: true, source: 'custom', file: { blobId: id, fileName: 'PRIVATE PRACTICE.png', mimeType: 'image/png', size: png.byteLength } });
function sample() {
  const data = emptyVault();
  data.clients.push({ id: 'client', name: 'PRIVATE CLIENT', language: 'de', createdAt: '2026-01-01', contact: '', preparation: '', telegramChatId: '', reminderConsent: false });
  data.sessions.push({ id: 'session', clientId: 'client', date: '2026-11-01', time: '14:00', feeCents: 8500, paidAt: null, notes: 'CLINICAL SECRET', tags: [] });
  return data;
}
function issue(data: VaultData, id = uid()) { const invoice = buildInvoice(data, data.clients[0], data.sessions, '2026-11-04', 'de', id); attachInvoice(data, invoice); return invoice; }

test('PNG upload validates signatures, dimensions, MIME and limits before decoding', async () => {
  assert.deepEqual(validateInvoicePng(png), { width: 1774, height: 887 });
  assert.throws(() => validateInvoicePng(new Uint8Array()), /invoiceLogoTooLarge/);
  assert.throws(() => validateInvoicePng(new Uint8Array(INVOICE_LOGO_MAX_BYTES + 1)), /invoiceLogoTooLarge/);
  assert.throws(() => validateInvoicePng(new Uint8Array([60, 115, 118, 103])), /invoiceLogoInvalid/);
  for (const dimension of [0,4097]) { const bytes = png.slice(); new DataView(bytes.buffer).setUint32(16, dimension); assert.throws(() => validateInvoicePng(bytes), /invoiceLogoDimensions/); }
  const fake = png.slice(); new DataView(fake.buffer).setUint32(12, 0); assert.throws(() => validateInvoicePng(fake), /invoiceLogoInvalid/);
  await assert.rejects(() => readInvoicePng(new File([png], 'logo.svg', { type: 'image/svg+xml' })), /invoiceLogoInvalid/);
  await assert.rejects(() => readInvoicePng(new File([png], 'logo.jpg', { type: 'image/png' })), /invoiceLogoInvalid/);
  assert.throws(() => validateInvoiceLogo({ enabled: true, source: 'custom', file: { blobId: 'x', fileName: 'x.png', size: 100, mimeType: 'image/svg+xml' } }), /invalidBackup/);
  assert.throws(() => validateInvoiceLogo({ enabled: 'yes', source: 'nadiia' }), /invalidBackup/);
});

test('legacy settings gain the built-in choice without rewriting existing invoices', () => {
  const data = sample(), invoice = issue(data); delete data.settings.invoiceLogo; delete invoice.logo;
  const previous = structuredClone(data.invoices); const normalized = normalizeVault(data);
  assert.deepEqual(normalized.settings.invoiceLogo, defaultInvoiceLogo()); assert.deepEqual(normalized.invoices, previous);
  assert.throws(() => normalizeVault({ ...data, settings: { ...data.settings, invoiceLogo: { enabled: true, source: 'unknown' } as unknown as InvoiceLogo } }), /invalidBackup/);
});

test('issued logos stay immutable, cancellation keeps the original and a replacement uses the current choice', () => {
  const data = sample(); data.settings.invoiceLogo = custom(); const invoice = issue(data);
  data.settings.invoiceLogo = { enabled: false, source: 'nadiia' }; assert.deepEqual(invoice.logo, custom());
  const result = reviseInvoice(data, invoice.id, { issuedAt: '2026-11-05', reason: 'Correct address', cancellationId: uid(), replacement: { id: uid(), dueOn: '2026-11-05', language: invoice.language, sender: invoice.sender, recipient: invoice.recipient, paymentAccount: invoice.paymentAccount!, lines: invoice.lines } });
  assert.deepEqual(result.cancellation.logo, custom()); assert.deepEqual(result.replacement?.logo, { enabled: false, source: 'nadiia' }); assert.deepEqual(invoice.logo, custom());
});

test('concurrent logo choices retain both encrypted files and merge independently of practice details', () => {
  const base = sample(); base.crdt = stateOf(base);
  const a = structuredClone(base), b = structuredClone(base); a.settings.invoiceLogo = custom('A'); b.settings.invoiceLogo = custom('B'); b.settings.practice.address = 'New address';
  stampChanges(base, a, 1, 'phone'); stampChanges(base, b, 2, 'laptop'); const merged = mergeVaults(a, b);
  assert.equal(merged.settings.practice.address, 'New address'); assert.deepEqual(referencedBlobs(merged).sort(), ['A','B']);
  const conflict = syncConflicts(merged).find(c => c.collection === 'settings' && c.field === 'invoiceLogo'); assert.ok(conflict);
  resolveConflict(merged, conflict, conflict.variants[0]); assert.equal(referencedBlobs(merged).length, 1);
  assert.deepEqual(mergeVaults(a, b), mergeVaults(b, a));
});

test('logo blobs round-trip in encrypted backup and remain attached to encrypted history', async () => {
  const data = sample(); data.settings.invoiceLogo = custom(); issue(data);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']), vaultId = uid();
  const context = `praxisraum-blob:v1:${vaultId}:private-logo`, payload = await encryptBytes(key, png, context);
  const envelope = await encryptVault(key, data, vaultId, randomSalt());
  const backup = JSON.stringify({ type: 'praxisraum-backup-v1', envelope, blobs: [{ id: 'private-logo', vaultId, payload }] });
  assert.doesNotMatch(backup, /PRIVATE CLIENT|PRIVATE PRACTICE|CLINICAL SECRET|iVBORw0KGgo/);
  const restored = JSON.parse(backup), plain = await decryptVault(key, restored.envelope);
  assert.deepEqual(plain.settings.invoiceLogo, custom()); assert.deepEqual(plain.invoices[0].logo, custom());
  assert.deepEqual(await decryptBytes(key, restored.blobs[0].payload, context), png);
  await recordSnapshot(envelope, true, 100, referencedBlobs(data)); assert.deepEqual([...(await historyBlobIds(vaultId))], ['private-logo']);
  assert.deepEqual((await decryptVault(key, (await readSnapshot(vaultId, 100))!)).invoices[0].logo, custom());
});

test('deleting one client keeps a shared practice logo and removes a logo used only by their invoices', async () => {
  const data = sample(); data.settings.invoiceLogo = custom('old-logo'); issue(data); data.settings.invoiceLogo = custom('current-logo');
  const before = referencedBlobs(data); assert.deepEqual(before.sort(), ['current-logo','old-logo']);
  const requested: string[] = [];
  const archive = unzipSync((await clientExport(data, 'client', 'de', async id => { requested.push(id); return new Blob([png], { type: 'image/png' }); })).bytes);
  assert.deepEqual(requested, ['old-logo']);
  const exported = JSON.parse(strFromU8(archive['daten.json'])); const path = exported.invoices[0].logo.path;
  assert.ok(path.startsWith('rechnungen/')); assert.deepEqual(archive[path], png); assert.ok(!Object.keys(archive).some(k => k.includes('current-logo')));
  deleteClient(data, 'client'); assert.deepEqual(orphanedBlobs(before, data), ['old-logo']); assert.deepEqual(referencedBlobs(data), ['current-logo']);
  data.settings.invoiceLogo = defaultInvoiceLogo(); assert.deepEqual(orphanedBlobs(['current-logo'], data), ['current-logo']);
});

test('PDF embeds the chosen PNG, omits disabled logos and refuses a missing or damaged logo', async () => {
  const data = sample(), invoice = issue(data); const [regular,bold] = await Promise.all([readFile('src/assets/DejaVuSans.ttf'),readFile('src/assets/DejaVuSans-Bold.ttf')]);
  const bytes = await invoicePdf(invoice, null, regular, bold, png); const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1); assert.ok((pdf.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict)).keys().length > 0);
  for (const logo of [{ enabled: false, source: 'nadiia' } as const, undefined]) {
    const disabled = await PDFDocument.load(await invoicePdf({ ...invoice, logo }, null, regular, bold)); const objects = disabled.getPage(0).node.Resources()!.lookupMaybe(PDFName.of('XObject'), PDFDict); assert.equal(objects?.keys().length ?? 0, 0);
  }
  await assert.rejects(() => invoicePdf(invoice, null, regular, bold), /invoiceLogoReadError/);
  await assert.rejects(() => invoicePdf(invoice, null, regular, bold, new Uint8Array([1,2,3])), /invoiceLogoReadError/);
});
