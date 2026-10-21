import { test, expect, type Page } from './fixtures';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAZElEQVR4nO3PQQ3AIADAQMC/CxJMYG4ieFyW9BS0c98z/mzpgFcNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaB+DmAKEfrnO0QAAAABJRU5ErkJggg==';
async function nav(page: Page, text: string) {
  await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Navigation öffnen' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: text, exact: true }).click();
}
async function create(page: Page, passphrase: string) {
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill(passphrase); await page.getByLabel('Passphrase wiederholen').fill(passphrase);
  await page.getByRole('button', { name: 'Meinen Praxisraum einrichten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
}
async function unlock(page: Page, passphrase: string) {
  await page.getByLabel('Tresor-Passphrase', { exact: true }).fill(passphrase); await page.getByRole('button', { name: 'Praxisraum öffnen', exact: true }).click();
}
async function lock(page: Page) { await page.getByRole('button', { name: 'Sperren', exact: true }).last().click(); await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible(); }

/** Write a vault exactly as the first release did (format v1: the PBKDF2 key encrypts the data directly). */
async function seedLegacyVault(page: Page, passphrase: string) {
  await page.evaluate(async ({ passphrase, png }) => {
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)); const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const enc = new TextEncoder(); const vaultId = crypto.randomUUID(); const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltBytes, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const seal = async (bytes: Uint8Array, aad: string) => { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, bytes); return { iv: b64(iv), ciphertext: b64(new Uint8Array(ct)) }; };
    const avatarId = crypto.randomUUID(); const clientId = crypto.randomUUID();
    const data = { schema: 1, clients: [{ id: clientId, name: 'Altbestand Person', createdAt: '2025-01-01', language: 'de', preparation: 'Notiz aus Version eins', contact: '', telegramChatId: '', reminderConsent: false, avatarId }], appointments: [], sessions: [{ id: crypto.randomUUID(), clientId, date: '2025-02-01', time: '10:00', feeCents: 9000, paidAt: '2025-02-02', notes: '', tags: [] }], notes: [], settings: { timeZone: 'Europe/Berlin', advisorChatId: '', autoSync: false, remindersEnabled: false } };
    const envelope = { format: 'praxisraum-v1', vaultId, salt: b64(saltBytes), iterations: 600000, payload: await seal(enc.encode(JSON.stringify(data)), `praxisraum:v1:${vaultId}`) };
    const blob = { id: avatarId, vaultId, payload: await seal(unb64(png), `praxisraum-blob:v1:${vaultId}:${avatarId}`) };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('praxisraum', 1); r.onupgradeneeded = () => { for (const n of ['vault', 'blobs', 'meta']) r.result.createObjectStore(n); }; r.onsuccess = () => resolve(r.result); r.onerror = reject; });
    await new Promise<void>(resolve => { const tx = db.transaction(['vault', 'blobs'], 'readwrite'); tx.objectStore('vault').put(envelope, 'primary'); tx.objectStore('blobs').put(blob, avatarId); tx.oncomplete = () => resolve(); });
    db.close();
  }, { passphrase, png: PNG });
}

test('a vault from the first release opens, upgrades, and can be recovered after a forgotten passphrase', async ({ page }) => {
  const problems: string[] = []; page.on('pageerror', e => problems.push(e.message));
  await page.goto('/'); await seedLegacyVault(page, 'legacy passphrase 1234'); await page.reload();
  await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Wiederherstellungsschlüssel verwenden/ })).toHaveCount(0);
  await unlock(page, 'legacy passphrase 1234'); await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();

  await nav(page, 'Einstellungen'); const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Wiederherstellungsschlüssel erstellen' }).click();
  await dialog.getByLabel('Zur Bestätigung die Passphrase eingeben').fill('wrong passphrase!!'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('nicht geöffnet');
  await dialog.getByLabel('Zur Bestätigung die Passphrase eingeben').fill('legacy passphrase 1234'); await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  const recoveryKey = (await page.getByTestId('recovery-key').textContent())!.trim();
  expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/);
  const close = dialog.locator('.form-actions').getByRole('button', { name: 'Schließen' }); await expect(close).toBeDisabled(); await dialog.getByLabel('Ich habe den Schlüssel sicher aufbewahrt.').check(); await close.click();
  await expect(page.locator('.ok-text')).toHaveText('Eingerichtet');
  await lock(page);

  // The old passphrase still works after the upgrade; then pretend it is forgotten.
  await unlock(page, 'legacy passphrase 1234'); await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible(); await lock(page);
  await page.getByRole('button', { name: /Wiederherstellungsschlüssel verwenden/ }).click();
  await page.getByLabel('Wiederherstellungsschlüssel', { exact: true }).fill(recoveryKey.replace(/^(....)/, c => (c[0] === 'A' ? 'B' : 'A') + c.slice(1)));
  await page.getByRole('button', { name: 'Mit Schlüssel entsperren' }).click(); await expect(page.getByRole('alert')).toContainText('Schlüssel ist nicht korrekt');
  await page.getByLabel('Wiederherstellungsschlüssel', { exact: true }).fill(recoveryKey.toLowerCase().replaceAll('-', ' '));
  await page.getByRole('button', { name: 'Mit Schlüssel entsperren' }).click();
  await expect(dialog.getByRole('heading', { name: 'Neue Passphrase festlegen' })).toBeVisible();
  await dialog.getByLabel('Neue Passphrase (mind. 12 Zeichen)').fill('brand new passphrase 5678'); await dialog.getByLabel('Passphrase wiederholen').fill('brand new passphrase 5678');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Klienten'); await page.locator('.directory-list').getByRole('button', { name: /Altbestand Person/ }).click();
  await expect(page.getByRole('textbox', { name: 'Vorbereitung für die nächste Sitzung' })).toHaveValue('Notiz aus Version eins');
  await expect(page.locator('.profile-heading .avatar img')).toBeVisible(); // the old image still decrypts
  await lock(page);
  await unlock(page, 'legacy passphrase 1234'); await expect(page.getByRole('alert')).toContainText('nicht geöffnet');
  await unlock(page, 'brand new passphrase 5678'); await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('passkey unlock with a virtual authenticator (WebAuthn PRF), including removal', async ({ page, context }) => {
  test.skip(test.info().project.name === 'mobile', 'The virtual authenticator is exercised once, on desktop.');
  const cdp = await context.newCDPSession(page); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } as never });
  await page.goto('http://localhost:4173/'); await create(page, 'passkey test passphrase');
  await nav(page, 'Einstellungen'); const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Passkey hinzufügen' }).click();
  await dialog.getByLabel('Bezeichnung (z. B. „iPad“)').fill('Testgerät'); await dialog.getByLabel('Zur Bestätigung die Passphrase eingeben').fill('passkey test passphrase');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Testgerät')).toBeVisible();
  await lock(page);
  await page.getByRole('button', { name: 'Mit Passkey entsperren' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Tag. Mit gutem Überblick.' })).toBeVisible();
  await nav(page, 'Einstellungen'); await page.getByRole('button', { name: 'Passkey entfernen: Testgerät' }).click();
  await expect(page.getByText('Testgerät')).toHaveCount(0); await lock(page);
  await expect(page.getByRole('button', { name: 'Mit Passkey entsperren' })).toHaveCount(0);
});
