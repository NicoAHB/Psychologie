import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { uid } from '../src/lib/types';
const db=new PGlite(),owner=uid(),other=uid(),vault=uid(),otherVault=uid(),subject='a'.repeat(64);
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated;create table public.encrypted_vaults(user_id uuid primary key,vault_id uuid);insert into public.encrypted_vaults values('${owner}','${vault}'),('${other}','${otherVault}');`);
const sql=await readFile(new URL('../supabase/migrations/20261023_referral_codes.sql',import.meta.url),'utf8');await db.exec(sql);
async function login(id:string,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
async function issue(vaultId=vault,hash=subject){return(await db.query<{code:{id:string;code:string;created_at:string}}>('select public.issue_referral_code($1,$2) as code',[vaultId,hash])).rows[0].code;}
test('migration is repeatable; server issues a unique stable code for an opaque subject and owner RLS isolates practices',async()=>{
  await db.exec(sql);await login(owner);const a=await issue(),b=await issue();assert.equal(a.code,b.code);assert.equal(a.id,b.id);assert.match(a.code,/^PRX-[A-F0-9]{12}$/);
  const c=await issue(vault,'b'.repeat(64));assert.notEqual(c.code,a.code);
  assert.equal((await db.query('select * from referral_code_registry')).rows.length,2);
  await assert.rejects(()=>db.query('delete from referral_code_registry'),/permission denied/);
  await login(other);assert.equal((await db.query('select * from referral_code_registry')).rows.length,0);await assert.rejects(()=>issue(),/REFERRAL_VAULT/);
  const d=await issue(otherVault);assert.notEqual(d.code,a.code);
});
test('malformed input, missing practice vault, anonymous access and direct code insertion are denied',async()=>{
  await login(owner);await assert.rejects(()=>issue(vault,'name or email'),/REFERRAL_INVALID/);await assert.rejects(()=>issue(otherVault),/REFERRAL_VAULT/);
  await assert.rejects(()=>db.query('insert into referral_code_registry(owner_id,vault_id,subject_hash,code) values($1,$2,$3,$4)',[owner,vault,subject,'PRX-123456ABCDEF']),/permission denied/);
  await login('', 'anon');await assert.rejects(()=>issue(),/permission denied/);await assert.rejects(()=>db.query('select * from referral_code_registry'),/permission denied/);
});
test('only owner can permanently revoke a code; revocation is idempotent and does not disclose mappings',async()=>{
  await login(owner);const a=await issue(vault,'c'.repeat(64));await login(other);await assert.rejects(()=>db.query('select public.revoke_referral_code($1,$2)',[vault,a.id]),/REFERRAL_INVALID/);
  await login(owner);await db.query('select public.revoke_referral_code($1,$2)',[vault,a.id]);await db.query('select public.revoke_referral_code($1,$2)',[vault,a.id]);await assert.rejects(()=>issue(vault,'c'.repeat(64)),/REFERRAL_REVOKED/);
  const columns=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name='referral_code_registry'")).rows.map(r=>r.column_name);assert.deepEqual(columns.sort(),['id','owner_id','vault_id','subject_hash','code','created_at','revoked_at'].sort());
});
