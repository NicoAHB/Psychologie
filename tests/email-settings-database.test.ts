import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { uid } from '../src/lib/types';
const db = new PGlite(), owner = uid();
// PGlite has no Supabase Vault extension. Only its SQL API is stubbed here;
// these tests verify our ownership, permissions, transactions and lifecycle,
// not the cryptography implemented by the deployed Supabase Vault extension.
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${owner}');
  create schema vault; create table vault.secrets(id uuid primary key default gen_random_uuid(), secret text, name text);
  create view vault.decrypted_secrets as select id, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(p_secret text,p_name text) returns uuid language plpgsql as $$ declare sid uuid; begin insert into vault.secrets(secret,name) values(p_secret,p_name) returning id into sid; return sid; end; $$;
  create function vault.update_secret(p_id uuid,p_secret text) returns void language sql as $$ update vault.secrets set secret=p_secret where id=p_id; $$;
  revoke all on schema vault from public; revoke all on all tables in schema vault from public;
  grant usage on schema public to anon,authenticated,service_role;`);
const migration = (await readFile(new URL('../supabase/email-settings.sql', import.meta.url), 'utf8')).replace('create extension if not exists supabase_vault with schema vault;', '');
await db.exec(migration);
const get = async () => (await db.query<{ result: Record<string, unknown> }>('select public.get_email_provider_settings($1) as result', [owner])).rows[0].result;
const save = (key: string | null, enabled = true, email = 'praxis@example.com') => db.query('select public.save_email_provider_settings($1,$2,$3,$4,$5)', [owner, email, 'Praxis', enabled, key]);
test('email migration is repeatable and browser roles cannot access settings, secrets or service RPCs', async () => {
  await db.exec(migration);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => get(), /permission denied/); await assert.rejects(() => save('re_synthetic_key_123'), /permission denied/);
    await assert.rejects(() => db.query('select * from private.email_provider_settings'), /permission denied/);
    await assert.rejects(() => db.query('select * from vault.decrypted_secrets'), /permission denied/);
    await db.exec('reset role');
  }
});
test('service-only saves preserve a blank key, rotate explicitly, pause, validate and remove the secret on account deletion', async () => {
  await db.exec('set role service_role'); assert.equal(await get(), null);
  await assert.rejects(() => save(null), /EMAIL_KEY_REQUIRED/);
  await save('re_synthetic_key_123'); await save(null, false, 'neu@example.com');
  let result = await get(); assert.equal(result.apiKey, 're_synthetic_key_123'); assert.equal(result.senderEmail, 'neu@example.com'); assert.equal(result.enabled, false);
  await save('re_rotated_key_456'); result = await get(); assert.equal(result.apiKey, 're_rotated_key_456');
  await assert.rejects(() => save('invalid'), /INVALID_EMAIL_SETTINGS/); await assert.rejects(() => save(null, true, 'bad'), /INVALID_EMAIL_SETTINGS/);
  const endpoint = 'https://script.google.com/macros/s/AKfycb_synthetic_deployment_123456789/exec', key = `gmail_${'a'.repeat(64)}`;
  const gmail = (secret: string | null, url = endpoint) => db.query('select public.save_email_provider_settings($1,$2,$3,true,$4,$5,$6)', [owner, 'Practice@Gmail.com', 'Praxis', secret, 'gmail', url]);
  await assert.rejects(() => gmail(null), /EMAIL_KEY_REQUIRED/);
  await assert.rejects(() => gmail(key, 'https://evil.example/'), /INVALID_EMAIL_SETTINGS/);
  await gmail(key); result = await get(); assert.equal(result.provider, 'gmail'); assert.equal(result.apiKey, key); assert.equal(result.senderEmail, 'practice@gmail.com');
  await gmail(null); assert.equal((await get()).apiKey, key);
  await assert.rejects(() => save(null), /EMAIL_KEY_REQUIRED/);
  await db.exec('reset role'); assert.equal((await db.query('select * from vault.secrets')).rows.length, 1);
  await db.query('delete from auth.users where id=$1', [owner]); assert.equal((await db.query('select * from vault.secrets')).rows.length, 0);
});
