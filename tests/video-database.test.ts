import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${owner}'), ('${other}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
 create schema realtime; create table realtime.messages(id int, extension text); alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as $$ select current_setting('request.topic', true) $$;
 grant usage on schema auth, public, realtime to anon, authenticated; grant select, insert on realtime.messages to anon, authenticated;
`);
const migration = await readFile(new URL('../supabase/video.sql', import.meta.url), 'utf8'); await db.exec(migration);
async function login(id: string, role = 'authenticated') {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [id, role]); await db.exec(`set role ${role}`);
}
let room = '';
test('video migration is repeatable; only an authenticated therapist can create a bounded room', async () => {
  await db.exec(migration); await login('', 'anon'); await assert.rejects(() => db.query('select public.create_video_room()'), /permission denied/);
  await login(owner); const result = await db.query<{ room: { id: string; expires_at: string } }>('select public.create_video_room() as room'); room = result.rows[0].room.id;
  const ttl = Date.parse(result.rows[0].room.expires_at) - Date.now(); assert.ok(ttl > 7100000 && ttl <= 7200000);
  await assert.rejects(() => db.query('select * from public.video_rooms'), /permission denied/);
});
test('anonymous guests can signal only on an existing unexpired private topic, with no vault access', async () => {
  await login('', 'anon');
  const result = await db.query<{ room: unknown }>('select public.get_video_room($1) as room', [room]); assert.ok(result.rows[0].room);
  await db.query("select set_config('request.topic', $1, false)", [`praxisraum-video:${room}`]);
  await db.query("insert into realtime.messages values (1, 'broadcast')"); assert.equal((await db.query('select * from realtime.messages')).rows.length, 1);
  await db.query("select set_config('request.topic', 'unrelated-topic', false)"); assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
  await assert.rejects(() => db.query("insert into realtime.messages values (2, 'broadcast')"), /row-level security/);
});
test('a different authenticated account cannot signal or close another room', async () => {
  await login(other); assert.equal((await db.query<{ allowed: boolean }>('select public.video_can_signal($1) as allowed', [`praxisraum-video:${room}`])).rows[0].allowed, false);
  await db.query('select public.close_video_room($1)', [room]); await login('', 'anon'); assert.ok((await db.query<{ room: unknown }>('select public.get_video_room($1) as room', [room])).rows[0].room);
});
test('closing or expiring a room prevents guest admission and private channel authorization', async () => {
  await login(owner); await db.query('select public.close_video_room($1)', [room]);
  await login('', 'anon'); assert.equal((await db.query<{ room: unknown }>('select public.get_video_room($1) as room', [room])).rows[0].room, null);
  await db.query("select set_config('request.topic', $1, false)", [`praxisraum-video:${room}`]); await assert.rejects(() => db.query("insert into realtime.messages values (3, 'broadcast')"), /row-level security/);
  await db.exec('reset role'); await db.query("update public.video_rooms set closed = false, expires_at = now() - interval '1 second' where id = $1", [room]);
  await login('', 'anon'); assert.equal((await db.query<{ room: unknown }>('select public.get_video_room($1) as room', [room])).rows[0].room, null);
});
