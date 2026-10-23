-- Referral code reservation only. No names, referral relationships, payment dates,
-- amounts or payout data leave the end-to-end encrypted vault.
-- Run after supabase/schema.sql. Safe to run again.
begin;
create table if not exists public.referral_code_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  vault_id uuid not null,
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  code text not null unique check (code ~ '^PRX-[A-F0-9]{12}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (owner_id, vault_id, subject_hash)
);
alter table public.referral_code_registry enable row level security;
revoke all on public.referral_code_registry from anon, authenticated;
grant select on public.referral_code_registry to authenticated;
drop policy if exists referral_code_owner on public.referral_code_registry;
create policy referral_code_owner on public.referral_code_registry
  for select to authenticated using (owner_id = (select auth.uid()));

-- Authentication here is the EXISTING practice account, never a client account.
-- The hash is SHA-256(vault UUID + ':' + random client UUID); the mapping stays encrypted.
create or replace function public.issue_referral_code(p_vault_id uuid, p_subject_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_row public.referral_code_registry; v_try integer;
begin
  if v_owner is null or p_subject_hash is null or p_subject_hash !~ '^[a-f0-9]{64}$'
    then raise exception 'REFERRAL_INVALID'; end if;
  if not exists (select 1 from public.encrypted_vaults where user_id=v_owner and vault_id=p_vault_id)
    then raise exception 'REFERRAL_VAULT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text || p_vault_id::text || p_subject_hash, 0));
  select * into v_row from public.referral_code_registry
    where owner_id=v_owner and vault_id=p_vault_id and subject_hash=p_subject_hash;
  if found then
    if v_row.revoked_at is not null then raise exception 'REFERRAL_REVOKED'; end if;
    return jsonb_build_object('id',v_row.id,'code',v_row.code,'created_at',v_row.created_at);
  end if;
  -- A UNIQUE constraint is the authority even in the unlikely event of a random collision.
  for v_try in 1..10 loop
    begin
      insert into public.referral_code_registry(owner_id,vault_id,subject_hash,code)
        values(v_owner,p_vault_id,p_subject_hash,'PRX-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) returning * into v_row;
      return jsonb_build_object('id',v_row.id,'code',v_row.code,'created_at',v_row.created_at);
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'REFERRAL_RETRY';
end $$;
create or replace function public.revoke_referral_code(p_vault_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'REFERRAL_INVALID'; end if;
  update public.referral_code_registry set revoked_at=coalesce(revoked_at,now())
    where owner_id=auth.uid() and vault_id=p_vault_id and id=p_id;
  if not found then raise exception 'REFERRAL_INVALID'; end if;
end $$;
revoke all on function public.issue_referral_code(uuid,text) from public, anon;
revoke all on function public.revoke_referral_code(uuid,uuid) from public, anon;
grant execute on function public.issue_referral_code(uuid,text) to authenticated;
grant execute on function public.revoke_referral_code(uuid,uuid) to authenticated;
commit;
