import { expect, type Page } from './fixtures';
import { addDays, today } from '../../src/lib/dates';
import { decryptVault, deriveKey, encryptBytes, encryptVault, randomSalt } from '../../src/lib/crypto';
import { emptyVault, uid, type Invoice, type VaultData, type VaultEnvelope } from '../../src/lib/types';

export function workflowData() {
  const data = emptyVault(); const client = { id: uid(), name: 'Олена Приклад', address: 'Київ', contact: '', preparation: '', language: 'uk' as const, currency: 'UAH' as const, email: 'olena@example.com', telegramChatId: '123456789', reminderConsent: false, createdAt: addDays(today(), -90) };
  data.clients.push(client); data.settings.exchangeRate = { micros: 48125600, date: today(), source: 'manual' }; Object.assign(data.settings.practice, { name: 'Praxis Beispiel', address: 'Musterweg 1\n10115 Berlin', iban: 'DE-TEST', ibanUa: 'UA-TEST', bankUa: 'Банк України' });
  for (const offset of [-45,-44]) data.sessions.push({ id: uid(), clientId: client.id, date: addDays(today(), offset), time: '14:00', feeCents: 8500, paidAt: null, notes: 'Sitzungsnotiz bleibt erhalten', tags: [] });
  const issuedAt = addDays(today(), -40); const invoice: Invoice = { id: uid(), number: `${issuedAt.slice(0,4)}-001`, clientId: client.id, issuedAt, dueOn: addDays(issuedAt, 14), language: 'uk', currency: 'UAH', recipient: { name: client.name, address: client.address }, sender: structuredClone(data.settings.practice), paymentAccount: { holder: '', iban: 'UA-TEST', bank: 'Банк України', bic: '' }, lines: data.sessions.map(s => ({ sessionId: s.id, date: s.date, description: 'Консультаційна зустріч', amountCents: 409100, euroCents: 8500, rate: data.settings.exchangeRate })), totalCents: 818200, totalEuroCents: 17000 };
  data.invoices.push(invoice); for (const s of data.sessions) { s.invoiceId = invoice.id; s.billing = { currency: 'UAH', amountCents: 409100, rate: data.settings.exchangeRate }; } return { data, client, invoice };
}
export async function nav(page: Page, label: string) {
  // Demo entry/unlock completes asynchronously. isVisible() alone can return
  // false before the mobile menu is mounted and leave navigation off-screen.
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 });
  const ukrainian = await page.locator('html').getAttribute('lang') === 'uk';
  const menu = page.getByRole('button', { name: ukrainian ? 'Відкрити навігацію' : 'Navigation öffnen', exact: true });
  if (await menu.isVisible() && !(await page.locator('.sidebar').getAttribute('class'))?.includes('sidebar-open')) await menu.click();
  const primary = page.locator('.sidebar nav').getByRole('button', { name: label, exact: true });
  if (await primary.count()) await primary.click();
  else {
    await page.locator('.sidebar nav').getByRole('button', { name: ukrainian ? 'Ще' : 'Mehr', exact: true }).click();
    await page.locator('.more-navigation').getByRole('button', { name: label, exact: true }).click();
  }
}
export async function seedWorkflow(page: Page, data: VaultData) {
  const salt = randomSalt(); const key = await deriveKey('a very strong test passphrase', salt); const vaultId = uid(); const envelope = await encryptVault(key, data, vaultId, salt);
  const blobs = await Promise.all(data.documents.map(async d => ({ id: d.file.blobId, vaultId, payload: await encryptBytes(key, new TextEncoder().encode('Beispielaufgabe'), `praxisraum-blob:v1:${vaultId}:${d.file.blobId}`) })));
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Mit Beispieldaten entdecken' })).toBeVisible();
  await page.evaluate(async ({ envelope, blobs }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('praxisraum', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(['vault','blobs'], 'readwrite'); tx.objectStore('vault').put(envelope, 'primary'); for (const blob of blobs) tx.objectStore('blobs').put(blob, blob.id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); });
  }, { envelope, blobs });
  await page.reload(); await unlock(page);
  return async () => {
    const stored = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('praxisraum', 1); r.onsuccess = () => resolve(r.result); }); return new Promise<VaultEnvelope>(resolve => { const r = db.transaction('vault').objectStore('vault').get('primary'); r.onsuccess = () => { db.close(); resolve(r.result); }; }); });
    return decryptVault(key, stored);
  };
}
/** Key derivation, module startup and the first durable migration can exceed the
 * default five seconds on shared CI CPUs. Keep a bounded wait and surface real errors. */
export async function unlock(page: Page) {
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill('a very strong test passphrase');
  await page.getByRole('button', { name: 'Praxisraum öffnen', exact: true }).click();
  try { await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 }); }
  catch (error) {
    const alerts = await page.getByRole('alert').allTextContents().catch(() => []);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nUnlock alerts (synthetic fixture): ${JSON.stringify(alerts)}`);
  }
}
