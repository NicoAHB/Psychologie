import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { deriveKey, encryptVault, decryptVault, encryptBytes, decryptBytes, randomSalt, encryptReminder, validateEnvelope } from '../src/lib/crypto';
import { emptyVault, uid } from '../src/lib/types';
import { appointmentInstant, monthlyIncome, parseMoney, reminderExpiration, reminderInstant, tagsFrom } from '../src/lib/dates';
import { readVault, writeVault, readBlob, writeBlob, getRevision, setRevision } from '../src/lib/db';
import de from '../src/locales/de.json';
import uk from '../src/locales/uk.json';
// @ts-expect-error The Node worker is intentionally dependency-free JavaScript.
import { decryptJob, processJobs, reminderText } from '../scripts/send-reminders.mjs';

const salt = randomSalt();
const key = await deriveKey('a long and unique test passphrase', salt);

test('AES-GCM encrypts full practice records; salt-derived key recovers data', async () => {
  const data = emptyVault(); data.clients.push({ id: uid(), name: 'PRIVATE CLIENT NAME', contact: '', preparation: 'PRIVATE NOTE', telegramChatId: '', language: 'uk', reminderConsent: false, createdAt: '2026-01-01' });
  const envelope = await encryptVault(key, data, uid(), salt);
  assert.equal(JSON.stringify(envelope).includes('PRIVATE'), false);
  const derivedAgain = await deriveKey('a long and unique test passphrase', envelope.salt);
  assert.deepEqual(await decryptVault(derivedAgain, envelope), data);
  assert.equal(key.extractable, false);
  await assert.rejects(() => crypto.subtle.exportKey('raw', key));
});
test('wrong passphrase, modified ciphertext and substituted vault identity are rejected', async () => {
  const envelope = await encryptVault(key, emptyVault(), uid(), salt);
  const wrong = await deriveKey('another long passphrase', salt);
  await assert.rejects(() => decryptVault(wrong, envelope));
  await assert.rejects(() => decryptVault(key, { ...envelope, vaultId: uid() }));
  const altered = structuredClone(envelope); altered.payload.ciphertext = (altered.payload.ciphertext[0] === 'A' ? 'B' : 'A') + altered.payload.ciphertext.slice(1);
  await assert.rejects(() => decryptVault(key, altered));
});
test('fresh nonces and authenticated context protect encrypted images', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const a = await encryptBytes(key, bytes, 'image:one'); const b = await encryptBytes(key, bytes, 'image:one');
  assert.notEqual(a.iv, b.iv); assert.deepEqual(await decryptBytes(key, a, 'image:one'), bytes);
  await assert.rejects(() => decryptBytes(key, a, 'image:two'));
});
test('malformed and downgraded backup formats fail validation', () => {
  assert.throws(() => validateEnvelope({ format: 'praxisraum-v1', iterations: 1 }));
  assert.throws(() => validateEnvelope(null));
});
test('IndexedDB persists ciphertext and account-specific remote revisions', async () => {
  const envelope = await encryptVault(key, emptyVault(), uid(), salt); await writeVault(envelope);
  assert.deepEqual(await readVault(), envelope);
  const blob = { id: uid(), vaultId: envelope.vaultId, payload: await encryptBytes(key, new Uint8Array([42]), 'blob') };
  await writeBlob(blob); assert.deepEqual(await readBlob(blob.id), blob);
  await setRevision('account-one', envelope.vaultId, 3);
  assert.equal(await getRevision('account-one', envelope.vaultId), 3);
  assert.equal(await getRevision('account-two', envelope.vaultId), 0);
});
test('DE and UA dictionaries have identical keys and no empty translations', () => {
  assert.deepEqual(Object.keys(de).sort(), Object.keys(uk).sort());
  assert.ok(Object.values(de).every(value => value.trim())); assert.ok(Object.values(uk).every(value => value.trim()));
});
test('money parsing uses integer cents and rejects ambiguous or invalid input', () => {
  assert.equal(parseMoney('85,90'), 8590); assert.equal(parseMoney('0.01'), 1); assert.equal(parseMoney('100'), 10000);
  for (const invalid of ['-1', '1.234', '1,2,3', 'abc', '', 'NaN']) assert.throws(() => parseMoney(invalid));
});
test('income is grouped by payment date, not session date; open sessions excluded', () => {
  const base = { id: uid(), clientId: uid(), date: '2025-12-20', time: '10:00', feeCents: 8500, notes: '', tags: [] };
  const values = monthlyIncome([{ ...base, paidAt: '2026-02-03' }, { ...base, paidAt: null }, { ...base, paidAt: '2025-12-31' }], 2026);
  assert.equal(values[1], 8500); assert.equal(values.reduce((a, b) => a + b), 8500);
});
test('tags support Cyrillic, deduplication and hashtags', () => {
  assert.deepEqual(tagsFrom('#Fortschritt, #Ресурси, #Fortschritt'), ['Fortschritt', 'Ресурси']);
});
test('reminders use previous calendar day at 18:00 Berlin time, across DST and year boundary', () => {
  assert.equal(reminderInstant({ date: '2026-07-14', timeZone: 'Europe/Berlin' }), '2026-07-13T16:00:00Z');
  assert.equal(reminderInstant({ date: '2026-01-06', timeZone: 'Europe/Berlin' }), '2026-01-05T17:00:00Z');
  assert.equal(reminderInstant({ date: '2026-03-29', timeZone: 'Europe/Berlin' }), '2026-03-28T17:00:00Z');
  assert.equal(reminderInstant({ date: '2026-03-30', timeZone: 'Europe/Berlin' }), '2026-03-29T16:00:00Z');
  assert.equal(reminderInstant({ date: '2027-01-01', timeZone: 'Europe/Berlin' }), '2026-12-31T17:00:00Z');
});
test('reminders expire at local midnight before appointment day, preventing incorrect tomorrow messages', () => {
  assert.equal(reminderExpiration({ date: '2026-07-14', timeZone: 'Europe/Berlin' }), '2026-07-13T22:00:00Z');
  assert.equal(reminderExpiration({ date: '2026-01-06', timeZone: 'Europe/Kyiv' }), '2026-01-05T22:00:00Z');
});
test('Kyiv timezone and appointment expiration use timezone-aware instants', () => {
  assert.equal(reminderInstant({ date: '2026-07-14', timeZone: 'Europe/Kyiv' }), '2026-07-13T15:00:00Z');
  assert.equal(appointmentInstant({ date: '2026-07-14', time: '14:00', timeZone: 'Europe/Kyiv' }), '2026-07-14T11:00:00Z');
});
const keys = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['wrapKey', 'unwrapKey']);
const pem = (type: string, buffer: ArrayBuffer) => `-----BEGIN ${type}-----\n${Buffer.from(buffer).toString('base64')}\n-----END ${type}-----`;
const publicPem = pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', keys.publicKey));
const privatePem = pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', keys.privateKey));
const payload = { advisorChatId: '111', clientChatId: '222', language: 'uk', startsAt: '2026-07-14T12:00:00Z', advisorTimeZone: 'Europe/Berlin', clientTimeZone: 'Europe/Kyiv' };
const legacyPayload = { advisorChatId: '111', clientChatId: '222', language: 'uk', time: '14:00', timeZone: 'Europe/Berlin' };

test('browser public-key reminder encryption interoperates with the private-key Node worker', async () => {
  const id = uid(); const encrypted = await encryptReminder(publicPem, payload, id);
  assert.equal(JSON.stringify(encrypted).includes('222'), false);
  assert.deepEqual(await decryptJob(privatePem, encrypted, id), payload);
  await assert.rejects(() => decryptJob(privatePem, encrypted, uid()));
});
test('Telegram messages name date, place and UTC offset so no time zone can be misread', () => {
  assert.equal(reminderText('client', payload), 'Нагадування про Вашу зустріч: вівторок, 14 липня 2026 р., 15:00 (Київ, UTC+3). Для довідки — Берлін: 14:00 (UTC+2).');
  assert.equal(reminderText('client', { ...payload, language: 'de' }), 'Erinnerung an Ihren Termin: Dienstag, 14. Juli 2026, 15:00 Uhr (Kiew, UTC+3). Zur Orientierung — Berlin: 14:00 Uhr (UTC+2).');
  assert.equal(reminderText('advisor', payload), 'Erinnerung an einen Termin: Dienstag, 14. Juli 2026, 14:00 Uhr (Berlin, UTC+2). Klient — Kiew: 15:00 Uhr (UTC+3).');
  assert.equal(reminderText('client', { ...payload, clientTimeZone: 'Europe/Berlin', language: 'de' }), 'Erinnerung an Ihren Termin: Dienstag, 14. Juli 2026, 14:00 Uhr (Berlin, UTC+2).');
});
test('a time that falls on another calendar day for the client says so explicitly', () => {
  const late = reminderText('client', { ...payload, startsAt: '2026-07-14T21:40:00Z', language: 'de' });
  assert.match(late, /Mittwoch, 15\. Juli 2026, 00:40 Uhr \(Kiew, UTC\+3\)\. Zur Orientierung — Berlin: 23:40 Uhr \(UTC\+2\), Dienstag, 14\. Juli 2026\./);
});
test('reminders queued by an older app version (bare clock time) are still delivered', async () => {
  const id = uid(); const encrypted = await encryptReminder(publicPem, legacyPayload, id);
  assert.deepEqual(await decryptJob(privatePem, encrypted, id), legacyPayload);
  assert.equal(reminderText('client', legacyPayload), 'Нагадування про Вашу зустріч завтра о 14:00');
  assert.equal(reminderText('advisor', legacyPayload), 'Erinnerung: Morgen um 14:00 steht ein Termin an.');
});
test('the worker rejects payloads with unknown time zones or malformed instants', async () => {
  for (const bad of [{ ...payload, clientTimeZone: 'Mars/Olympus' }, { ...payload, startsAt: 'tomorrow' }, { ...payload, advisorTimeZone: '' }]) {
    const id = uid(); await assert.rejects(async () => decryptJob(privatePem, await encryptReminder(publicPem, bad, id), id), /invalid_payload/);
  }
});
test('worker honors successful recipient flags, claims only configured owner and logs only counts', async () => {
  const owner = uid(); const id = uid(); const encrypted = await encryptReminder(publicPem, payload, id);
  const calls: { url: string; body: Record<string, unknown> }[] = []; const logs: string[] = [];
  const request = async (url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body)); calls.push({ url, body });
    if (url.includes('claim_reminder_jobs')) { assert.equal(body.p_owner, owner); return new Response(JSON.stringify([{ id, user_id: owner, due_at: '2026-07-13T16:00:00Z', expires_at: '2026-07-14T12:00:00Z', payload: encrypted, advisor_sent: true, client_sent: false, attempts: 1 }])); }
    if (url.includes('telegram.org')) return new Response(JSON.stringify({ ok: true }));
    return new Response(null, { status: 204 });
  };
  const result = await processJobs({ env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key', TELEGRAM_BOT_TOKEN: 'fake-token', REMINDER_PRIVATE_KEY: privatePem, REMINDER_OWNER_ID: owner }, request, now: () => new Date('2026-07-13T16:02:00Z'), log: (line: string) => logs.push(line) });
  assert.equal(result.sent, 1);
  const telegram = calls.filter(call => call.url.includes('telegram.org'));
  assert.equal(telegram.length, 1); assert.equal(telegram[0].body.chat_id, '222');
  assert.match(String(telegram[0].body.text), /^Нагадування про Вашу зустріч: вівторок, 14 липня 2026 р\., 15:00 \(Київ, UTC\+3\)/);
  assert.ok(calls.some(call => call.body.client_sent === true));
  assert.deepEqual(logs, [JSON.stringify({ claimed: 1, sent: 1, failed: 0, expired: 0 })]);
});
test('worker does not deliver before the due time and records retry without sensitive details', async () => {
  const owner = uid(); const id = uid(); let deliveries = 0; const patches: Record<string, unknown>[] = [];
  const result = await processJobs({ env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake', TELEGRAM_BOT_TOKEN: 'fake', REMINDER_PRIVATE_KEY: privatePem, REMINDER_OWNER_ID: owner },
    request: async (url: string, options: RequestInit) => {
      if (url.includes('claim_reminder_jobs')) return new Response(JSON.stringify([{ id, user_id: owner, due_at: '2026-07-13T16:00:00Z', expires_at: '2026-07-14T12:00:00Z', attempts: 1 }]));
      if (url.includes('telegram.org')) deliveries++;
      patches.push(JSON.parse(String(options.body))); return new Response(null, { status: 204 });
    }, now: () => new Date('2026-07-13T15:59:00Z'), log: () => {} });
  assert.equal(deliveries, 0); assert.equal(result.failed, 1); assert.equal(patches[0].status, 'pending'); assert.equal(patches[0].last_error, 'delivery_failed');
});
test('worker never sends expired tomorrow reminders on appointment day', async () => {
  const owner = uid(); const id = uid(); let deliveries = 0; const patches: Record<string, unknown>[] = [];
  const result = await processJobs({ env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake', TELEGRAM_BOT_TOKEN: 'fake', REMINDER_PRIVATE_KEY: privatePem, REMINDER_OWNER_ID: owner },
    request: async (url: string, options: RequestInit) => {
      if (url.includes('claim_reminder_jobs')) return new Response(JSON.stringify([{ id, user_id: owner, due_at: '2026-07-13T16:00:00Z', expires_at: '2026-07-13T22:00:00Z', attempts: 1 }]));
      if (url.includes('telegram.org')) deliveries++;
      patches.push(JSON.parse(String(options.body))); return new Response(null, { status: 204 });
    }, now: () => new Date('2026-07-13T22:01:00Z'), log: () => {} });
  assert.equal(deliveries, 0); assert.equal(result.expired, 1); assert.equal(patches[0].last_error, 'expired');
});
