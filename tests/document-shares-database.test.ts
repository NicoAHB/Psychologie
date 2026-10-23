import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomShareSecret, shareTokenHash } from '../src/lib/documentShareCrypto';
import { uid } from '../src/lib/types';
const db = new PGlite(), owner = uid(), other = uid(), id = uid(), token = randomShareSecret();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${owner}'), ('${other}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema auth, public to anon, authenticated;`);
const migration = await readFile(new URL('../supabase/document-shares.sql', import.meta.url), 'utf8'); await db.exec(migration);
const packet = { version: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA==', protected: false, iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAA' };
async function login(user: string, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]); await db.exec(`set role ${role}`); }
test('share migration is repeatable and only an authenticated owner creates bounded encrypted shares', async () => {
  await db.exec(migration); const hash = await shareTokenHash(token);
  await login('', 'anon'); await assert.rejects(() => db.query('select public.create_document_share($1,$2,$3,$4)', [id, hash, new Date(Date.now() + 864e5).toISOString(), packet]), /permission denied/);
  await login(owner); await db.query('select public.create_document_share($1,$2,$3,$4)', [id, await shareTokenHash(token), new Date(Date.now() + 864e5).toISOString(), packet]);
  await assert.rejects(() => db.query('select * from public.document_shares'), /permission denied/);
  await assert.rejects(() => db.query('select public.create_document_share($1,$2,$3,$4)', [uid(), 'a'.repeat(64), new Date(Date.now() + 8 * 864e5).toISOString(), packet]), /INVALID_SHARE/);
});
test('anonymous download needs the complete capability; another account cannot revoke it or list files', async () => {
  await login('', 'anon'); assert.equal((await db.query<{ file: unknown }>('select public.read_document_share($1,$2) as file', [id, randomShareSecret()])).rows[0].file, null);
  assert.ok((await db.query<{ file: unknown }>('select public.read_document_share($1,$2) as file', [id, token])).rows[0].file);
  await login(other); await db.query('select public.revoke_document_share($1)', [id]);
  assert.ok((await db.query<{ file: unknown }>('select public.read_document_share($1,$2) as file', [id, token])).rows[0].file); await assert.rejects(() => db.query('select * from public.document_shares'), /permission denied/);
});
test('server time expiration and owner revocation prevent all further fetches', async () => {
  await db.exec('reset role'); await db.query("update public.document_shares set expires_at = now() - interval '1 second' where id = $1", [id]);
  await login('', 'anon'); assert.equal((await db.query<{ file: unknown }>('select public.read_document_share($1,$2) as file', [id, token])).rows[0].file, null);
  await db.exec('reset role'); await db.query("update public.document_shares set expires_at = now() + interval '1 day' where id = $1", [id]);
  await login(owner); await db.query('select public.revoke_document_share($1)', [id]); await login('', 'anon'); assert.equal((await db.query<{ file: unknown }>('select public.read_document_share($1,$2) as file', [id, token])).rows[0].file, null);
});
