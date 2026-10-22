import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const vault = '33333333-3333-4333-8333-333333333333';
const job = '44444444-4444-4444-8444-444444444444';
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  insert into auth.users values ('${owner}'), ('${other}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id bigint generated always as identity, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant usage on all sequences in schema storage to authenticated;
`);
await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
async function login(id: string) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]); await db.exec('set role authenticated'); }
const payload = { iv: 'cipher-iv', ciphertext: 'encrypted-content' };
const save = (expected: number) => db.query<{ save_encrypted_vault: number }>('select public.save_encrypted_vault($1, $2, $3, $4::jsonb)', [expected, vault, '123456789012345678901234', JSON.stringify(payload)]);
test('Postgres schema installs repeatably', async () => {
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  const rows = await db.query<{ public: boolean }>("select public from storage.buckets where id = 'encrypted-notes'"); assert.equal(rows.rows[0].public, false);
});
test('authenticated RPC creates and revises ciphertext with optimistic concurrency', async () => {
  await login(owner); assert.equal((await save(0)).rows[0].save_encrypted_vault, 1);
  await assert.rejects(() => save(0), /SYNC_CONFLICT/);
  assert.equal((await save(1)).rows[0].save_encrypted_vault, 2);
  await assert.rejects(() => db.query('update public.encrypted_vaults set revision = 99'), /permission denied/);
});
test('RLS hides other accounts and forbids anonymous vault access', async () => {
  await login(other); assert.equal((await db.query('select * from public.encrypted_vaults')).rows.length, 0);
  await db.exec('reset role; set role anon');
  await assert.rejects(() => db.query('select * from public.encrypted_vaults'), /permission denied/);
  await assert.rejects(() => save(0), /permission denied/);
});
test('storage policies isolate encrypted object paths between accounts', async () => {
  await login(owner);
  await db.query('insert into storage.objects(bucket_id, name) values ($1, $2)', ['encrypted-notes', `${owner}/${vault}/image.json`]);
  await assert.rejects(() => db.query('insert into storage.objects(bucket_id, name) values ($1, $2)', ['encrypted-notes', `${other}/image.json`]), /row-level security/);
  await login(other); assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  await login(owner); assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
});
test('reminders require own authenticated account; only service role can claim jobs', async () => {
  await login(owner);
  const reminder = { id: job, due_at: '2020-01-01T17:00:00Z', expires_at: '2099-01-01T12:00:00Z', payload: { version: 1, wrappedKey: 'encrypted-key', ...payload } };
  await db.query('select public.replace_reminder_jobs($1::jsonb)', [JSON.stringify([reminder])]);
  await assert.rejects(() => db.query('select * from public.claim_reminder_jobs($1)', [owner]), /permission denied/);
  await login(other); assert.equal((await db.query('select * from public.reminder_jobs')).rows.length, 0);
  await assert.rejects(() => db.query('select public.replace_reminder_jobs($1::jsonb)', [JSON.stringify([reminder])]), /INVALID_JOB_OWNER/);
  await db.exec('reset role; set role service_role');
  assert.equal((await db.query('select * from public.claim_reminder_jobs($1)', [other])).rows.length, 0);
  const claimed = await db.query<{ status: string; attempts: number; id: string }>('select * from public.claim_reminder_jobs($1)', [owner]);
  assert.equal(claimed.rows[0].id, job); assert.equal(claimed.rows[0].status, 'processing'); assert.equal(claimed.rows[0].attempts, 1);
  assert.equal((await db.query('select * from public.claim_reminder_jobs($1)', [owner])).rows.length, 0);
});
test('sync preserves sent flags and removes cancelled pending jobs', async () => {
  await db.exec('reset role'); await db.query("update public.reminder_jobs set status = 'sent', advisor_sent = true, client_sent = true where id = $1", [job]);
  await login(owner);
  const reminder = { id: job, due_at: '2020-01-01T17:00:00Z', expires_at: '2099-01-01T12:00:00Z', payload: { version: 1, wrappedKey: 'encrypted-key', ...payload } };
  await db.query('select public.replace_reminder_jobs($1::jsonb)', [JSON.stringify([reminder])]);
  const rows = await db.query<{ status: string; client_sent: boolean }>('select status, client_sent from public.reminder_jobs');
  assert.equal(rows.rows[0].status, 'sent'); assert.equal(rows.rows[0].client_sent, true);
  await db.query('select public.replace_reminder_jobs($1::jsonb)', ['[]']);
  assert.equal((await db.query('select * from public.reminder_jobs')).rows.length, 0);
});
test('recipient sending markers survive a crashed worker; expired claims cannot send again or cross owners', async () => {
  await login(owner);
  const reminder = { id: job, due_at: '2020-01-01T17:00:00Z', expires_at: '2099-01-01T12:00:00Z', payload: { version: 1, wrappedKey: 'encrypted-key', ...payload } };
  await db.query('select public.replace_reminder_jobs($1::jsonb)', [JSON.stringify([reminder])]);
  await assert.rejects(() => db.query("select public.begin_reminder_delivery($1,$2,$3,'client')", [owner, job, other]), /permission denied/);
  await db.exec('reset role; set role service_role');
  const claim = (await db.query<{ claim_token: string }>('select * from public.claim_reminder_jobs($1)', [owner])).rows[0].claim_token;
  const begin = (account: string, token: string) => db.query<{ started: boolean }>("select public.begin_reminder_delivery($1,$2,$3,'client') as started", [account, job, token]);
  assert.equal((await begin(other, claim)).rows[0].started, false); assert.equal((await begin(owner, other)).rows[0].started, false);
  assert.equal((await begin(owner, claim)).rows[0].started, true); assert.equal((await begin(owner, claim)).rows[0].started, false);
  // Simulate the process disappearing after Telegram accepted, before the success acknowledgement.
  await db.query("update public.reminder_jobs set lease_until = now() - interval '1 minute' where id=$1", [job]);
  assert.equal((await db.query('select * from public.claim_reminder_jobs($1)', [owner])).rows.length, 0);
  const state = (await db.query<{ status: string; client_sending_at: string }>('select status,client_sending_at from public.reminder_jobs where id=$1', [job])).rows[0];
  assert.equal(state.status, 'uncertain'); assert.ok(state.client_sending_at); assert.equal((await begin(owner, claim)).rows[0].started, false);
  await login(owner); await db.query('select public.replace_reminder_jobs($1::jsonb)', [JSON.stringify([reminder])]);
  assert.equal((await db.query<{ status: string }>('select status from public.reminder_jobs where id=$1', [job])).rows[0].status, 'uncertain');
  await db.query('select public.replace_reminder_jobs($1::jsonb)', ['[]']);
});
test('a new claim fences stale workers and definite rejections remain retryable without duplicating confirmed recipients', async () => {
  await login(owner);
  const reminder = { id: job, due_at: '2020-01-01T17:00:00Z', expires_at: '2099-01-01T12:00:00Z', payload: { version: 1, wrappedKey: 'encrypted-key', ...payload } };
  await db.query('select public.replace_reminder_jobs($1::jsonb)', [JSON.stringify([reminder])]); await db.exec('reset role; set role service_role');
  const claim = async () => (await db.query<{ claim_token: string }>('select * from public.claim_reminder_jobs($1)', [owner])).rows[0].claim_token;
  const old = await claim(); await db.query("update public.reminder_jobs set lease_until=now()-interval '1 minute' where id=$1", [job]); const fresh = await claim(); assert.notEqual(old, fresh);
  assert.equal((await db.query<{ ok: boolean }>("select public.begin_reminder_delivery($1,$2,$3,'advisor') as ok", [owner, job, old])).rows[0].ok, false);
  await db.query("select public.begin_reminder_delivery($1,$2,$3,'advisor')", [owner, job, fresh]);
  await db.query("select public.complete_reminder_delivery($1,$2,$3,'advisor',true)", [owner, job, fresh]);
  await db.query("select public.begin_reminder_delivery($1,$2,$3,'client')", [owner, job, fresh]);
  await db.query("select public.complete_reminder_delivery($1,$2,$3,'client',false)", [owner, job, fresh]);
  await db.query("select public.finish_reminder_job($1,$2,$3,'retry')", [owner, job, fresh]);
  const state = (await db.query<{ status: string; advisor_sent: boolean; client_sent: boolean; client_sending_at: null }>('select * from public.reminder_jobs where id=$1', [job])).rows[0];
  assert.equal(state.status, 'pending'); assert.equal(state.advisor_sent, true); assert.equal(state.client_sent, false); assert.equal(state.client_sending_at, null);
});
test.after(async () => { await db.close(); });
