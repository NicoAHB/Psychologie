-- Run once in the project's Supabase SQL editor. No patient data is stored here.
create extension if not exists supabase_vault with schema vault;
revoke all on vault.secrets, vault.decrypted_secrets from public, anon, authenticated;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.email_provider_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null unique references vault.secrets(id),
  sender_email text not null,
  sender_name text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table private.email_provider_settings add column if not exists provider text not null default 'resend' check (provider in ('resend','gmail'));
alter table private.email_provider_settings add column if not exists endpoint text not null default '';
alter table private.email_provider_settings enable row level security;
revoke all on private.email_provider_settings from public, anon, authenticated, service_role;

-- Only the authenticated-owner Edge Function holds the service-role credential.
-- The browser cannot call these RPCs, read the table or retrieve a saved API key.
create or replace function public.get_email_provider_settings(p_owner uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('apiKey', v.decrypted_secret, 'senderEmail', s.sender_email,
    'senderName', s.sender_name, 'enabled', s.enabled, 'updatedAt', s.updated_at,
    'provider', s.provider, 'endpoint', s.endpoint)
  from private.email_provider_settings s join vault.decrypted_secrets v on v.id = s.secret_id
  where s.owner_id = p_owner;
$$;

-- Replace the old signature to avoid ambiguous overloads when adding defaults.
drop function if exists public.save_email_provider_settings(uuid,text,text,boolean,text);
create or replace function public.save_email_provider_settings(
  p_owner uuid, p_email text, p_name text, p_enabled boolean, p_key text default null,
  p_provider text default 'resend', p_endpoint text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid; previous_provider text;
begin
  if p_owner is null or p_email is null or length(p_email) > 254
    or p_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or p_name is null or length(p_name) > 100 or p_name ~ '[[:cntrl:]<>]'
    or p_enabled is null or p_provider is null or p_provider not in ('resend','gmail') or p_endpoint is null
    or (p_provider = 'resend' and (p_endpoint <> '' or p_key is not null and p_key !~ '^re_[A-Za-z0-9_-]{10,200}$'))
    or (p_provider = 'gmail' and (p_email !~* '^[A-Za-z0-9._%+-]+@(gmail\.com|googlemail\.com)$'
      or p_endpoint !~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,160}/exec$'
      or p_key is not null and p_key !~ '^gmail_[0-9a-f]{64}$'))
    then raise exception 'INVALID_EMAIL_SETTINGS'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 741));
  select secret_id, provider into sid, previous_provider from private.email_provider_settings where owner_id = p_owner for update;
  if previous_provider is distinct from p_provider and p_key is null then raise exception 'EMAIL_KEY_REQUIRED'; end if;
  if sid is null then
    if p_key is null then raise exception 'EMAIL_KEY_REQUIRED'; end if;
    select vault.create_secret(p_key, 'praxisraum-email-' || p_owner::text) into sid;
  elsif p_key is not null then
    perform vault.update_secret(sid, p_key);
  end if;
  insert into private.email_provider_settings(owner_id, secret_id, sender_email, sender_name, enabled, provider, endpoint)
    values(p_owner, sid, case when p_provider = 'gmail' then lower(p_email) else p_email end, p_name, p_enabled, p_provider, p_endpoint)
    on conflict(owner_id) do update set sender_email = excluded.sender_email,
      sender_name = excluded.sender_name, enabled = excluded.enabled, provider = excluded.provider,
      endpoint = excluded.endpoint, updated_at = now();
end;
$$;

create or replace function private.delete_email_provider_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;
drop trigger if exists delete_email_provider_secret on private.email_provider_settings;
create trigger delete_email_provider_secret after delete on private.email_provider_settings
  for each row execute function private.delete_email_provider_secret();
revoke all on function private.delete_email_provider_secret() from public, anon, authenticated, service_role;
revoke all on function public.get_email_provider_settings(uuid) from public, anon, authenticated;
revoke all on function public.save_email_provider_settings(uuid,text,text,boolean,text,text,text) from public, anon, authenticated;
grant execute on function public.get_email_provider_settings(uuid) to service_role;
grant execute on function public.save_email_provider_settings(uuid,text,text,boolean,text,text,text) to service_role;
notify pgrst, 'reload schema';
