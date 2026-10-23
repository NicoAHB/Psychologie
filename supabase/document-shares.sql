-- Optional additive migration. Only individually encrypted files and opaque capabilities.
-- No patient names, filenames, document IDs, link keys or passwords on this server.
create table if not exists public.document_shares (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists document_shares_owner on public.document_shares(owner_id);
alter table public.document_shares enable row level security;
revoke all on public.document_shares from public, anon, authenticated;
grant all on public.document_shares to service_role;

create or replace function public.create_document_share(p_id uuid, p_token_hash text, p_expires_at timestamptz, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days'
    or p_payload is null or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'protected') is distinct from 'boolean'
    or p_payload - array['version', 'salt', 'protected', 'iv', 'ciphertext'] is distinct from '{}'::jsonb
    or coalesce(p_payload->>'salt', '') !~ '^[A-Za-z0-9+/]{22}==$'
    or coalesce(p_payload->>'iv', '') !~ '^[A-Za-z0-9+/]{16}$'
    or length(coalesce(p_payload->>'ciphertext', '')) not between 24 and 13986500
    or p_payload->>'ciphertext' !~ '^[A-Za-z0-9+/]*={0,2}$'
    or octet_length(p_payload::text) > 14000000 then raise exception 'INVALID_SHARE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 592));
  delete from public.document_shares where owner_id = caller and expires_at <= now();
  if (select count(*) from public.document_shares where owner_id = caller) >= 30
    or coalesce((select sum(octet_length(payload::text)) from public.document_shares where owner_id = caller), 0) + octet_length(p_payload::text) > 33554432 then raise exception 'SHARE_LIMIT'; end if;
  insert into public.document_shares(id, owner_id, token_hash, payload, expires_at) values (p_id, caller, p_token_hash, p_payload, p_expires_at);
  return p_id;
end; $$;
revoke all on function public.create_document_share(uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.create_document_share(uuid, text, timestamptz, jsonb) to authenticated;

create or replace function public.read_document_share(p_id uuid, p_token text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'expires_at', to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'payload', payload)
  from public.document_shares where id = p_id and expires_at > now()
    and p_token ~ '^[A-Za-z0-9_-]{43}$' and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;
revoke all on function public.read_document_share(uuid, text) from public;
grant execute on function public.read_document_share(uuid, text) to anon, authenticated;

create or replace function public.revoke_document_share(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.document_shares where id = p_id and owner_id = auth.uid();
$$;
revoke all on function public.revoke_document_share(uuid) from public, anon;
grant execute on function public.revoke_document_share(uuid) to authenticated;

-- Optional daily physical cleanup. Access expires immediately regardless of the job.
-- Enable the free pg_cron extension first if your project does not have it yet.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('praxisraum-expired-document-shares', '17 3 * * *', 'delete from public.document_shares where expires_at <= now()');
  end if;
end $$;
