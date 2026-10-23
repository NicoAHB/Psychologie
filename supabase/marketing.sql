-- Run after schema.sql. No cleartext names, addresses, birthdays or messages.
-- title/content/name/encrypted_payload contain client-side AES-GCM ciphertext.

create table if not exists public.message_templates (
  owner_id uuid not null references auth.users(id) on delete cascade,
  vault_id uuid not null, id uuid not null,
  title jsonb not null, content jsonb not null, category text not null check(category in ('info','greeting','organization')),
  created_at timestamptz not null, primary key (owner_id, vault_id, id),
  check(coalesce(jsonb_typeof(title->'iv')='string' and length(title->>'iv')=16 and jsonb_typeof(title->'ciphertext')='string' and length(title->>'ciphertext')>=24 and jsonb_typeof(content->'iv')='string' and length(content->>'iv')=16 and jsonb_typeof(content->'ciphertext')='string' and length(content->>'ciphertext')>=24,false))
);
create table if not exists public.marketing_campaigns (
  owner_id uuid not null references auth.users(id) on delete cascade,
  vault_id uuid not null, id uuid not null, name jsonb not null,
  type text not null check (type in ('birthday','welcome','holiday')),
  -- No FK: an offline deletion may arrive before the retained inactive campaign.
  template_id uuid not null, channel text not null check (channel in ('email','telegram')),
  is_active boolean not null default false, trigger_days integer not null default 0 check (trigger_days between 0 and 365),
  target_date date, created_at timestamptz not null, encrypted_payload jsonb not null,
  primary key (owner_id, vault_id, id), check(coalesce(jsonb_typeof(name->'iv')='string' and length(name->>'iv')=16 and jsonb_typeof(name->'ciphertext')='string' and length(name->>'ciphertext')>=24 and jsonb_typeof(encrypted_payload->'iv')='string' and length(encrypted_payload->>'iv')=16 and jsonb_typeof(encrypted_payload->'ciphertext')='string' and length(encrypted_payload->>'ciphertext')>=24,false))
);
create table if not exists public.newsletters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  vault_id uuid not null, id uuid not null, title jsonb not null, content jsonb not null,
  channel text not null check (channel in ('email','telegram')),
  -- Opaque reference to an AES-GCM object in the existing private bucket, never a public image URL.
  image_url text check(image_url is null or image_url ~ '^private:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), recipient_count integer not null check (recipient_count >= 0),
  status text not null check (status in ('sending','sent','partial','failed','unknown')),
  created_at timestamptz not null, primary key (owner_id, vault_id, id),
  check(coalesce(jsonb_typeof(title->'iv')='string' and length(title->>'iv')=16 and jsonb_typeof(title->'ciphertext')='string' and length(title->>'ciphertext')>=24 and jsonb_typeof(content->'iv')='string' and length(content->>'iv')=16 and jsonb_typeof(content->'ciphertext')='string' and length(content->>'ciphertext')>=24,false))
);

-- Only opaque receipt/consent IDs and delivery metadata. Destination hashes use
-- a secret server-side HMAC; they cannot be reversed as a public email hash.
create table if not exists public.marketing_consents (
  id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  channel text check (channel in ('email','telegram')),
  token_hash text, target_hash text, revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.marketing_delivery_receipts (
  id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  consent_id uuid not null references public.marketing_consents(id),
  newsletter_id uuid not null, message_id uuid not null,
  channel text not null check (channel in ('email','telegram')),
  status text not null check (status in ('sending','sent','failed','unknown')),
  created_at timestamptz not null default now(), accepted_at timestamptz,
  provider_id text, error_code text
);
create index if not exists marketing_receipts_owner_date on public.marketing_delivery_receipts(owner_id, created_at);
create index if not exists marketing_consents_owner on public.marketing_consents(owner_id);

do $$ declare tab text; begin
  foreach tab in array array['message_templates','marketing_campaigns','newsletters','marketing_consents','marketing_delivery_receipts'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('revoke all on public.%I from anon, authenticated', tab);
    execute format('grant select on public.%I to authenticated', tab);
    execute format('drop policy if exists marketing_owner_read on public.%I', tab);
    execute format('create policy marketing_owner_read on public.%I for select to authenticated using (auth.uid() = owner_id)', tab);
  end loop;
  foreach tab in array array['message_templates','marketing_campaigns','newsletters'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', tab);
    execute format('drop policy if exists marketing_owner_write on public.%I', tab);
    execute format('create policy marketing_owner_write on public.%I for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id)', tab);
  end loop;
end $$;

-- A sending marker is written BEFORE contacting the provider. A crash never
-- releases it for automatic retry: Telegram cannot guarantee exactly-once delivery.
create or replace function public.begin_marketing_delivery(p_owner uuid, p_id uuid, p_channel text, p_consent uuid, p_token_hash text, p_target_hash text, p_newsletter uuid, p_message uuid, p_granted_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt public.marketing_delivery_receipts; consent public.marketing_consents; barrier timestamptz;
begin
  if p_owner is null or p_id is null or p_consent is null or p_newsletter is null or p_message is null or p_granted_at is null or p_granted_at>now()+interval '5 minutes' or p_channel is null or p_token_hash is null or p_target_hash is null or p_channel not in ('email','telegram') or p_token_hash !~ '^[0-9a-f]{64}$' or p_target_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 817));
  select * into receipt from public.marketing_delivery_receipts where id = p_id;
  if found then
    if receipt.owner_id <> p_owner then return jsonb_build_object('claimed',false,'status','failed'); end if;
    return jsonb_build_object('claimed',false,'status',case when receipt.status='sending' and receipt.created_at < now()-interval '5 minutes' then 'unknown' else receipt.status end,'acceptedAt',receipt.accepted_at,'providerId',receipt.provider_id,'messageId',receipt.message_id,'channel',receipt.channel);
  end if;
  select max(revoked_at) into barrier from public.marketing_consents where owner_id=p_owner and channel=p_channel and target_hash=p_target_hash;
  insert into public.marketing_consents(id,owner_id,channel,token_hash,target_hash,revoked_at)
    values(p_consent,p_owner,p_channel,p_token_hash,p_target_hash,case when p_granted_at<=barrier then barrier else null end) on conflict(id) do nothing;
  select * into consent from public.marketing_consents where id=p_consent for update;
  if consent.owner_id <> p_owner or consent.revoked_at is not null or consent.channel is distinct from p_channel or consent.token_hash is distinct from p_token_hash or consent.target_hash is distinct from p_target_hash then
    return jsonb_build_object('claimed',false,'status','failed','errorCode','marketingConsentMissing');
  end if;
  if (select count(*) from public.marketing_delivery_receipts where owner_id=p_owner and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= 100 then
    return jsonb_build_object('claimed',false,'status','failed','errorCode','marketingDailyLimit');
  end if;
  insert into public.marketing_delivery_receipts(id,owner_id,consent_id,newsletter_id,message_id,channel,status) values(p_id,p_owner,p_consent,p_newsletter,p_message,p_channel,'sending');
  return jsonb_build_object('claimed',true,'status','sending');
end $$;
create or replace function public.finish_marketing_delivery(p_owner uuid,p_id uuid,p_status text,p_provider text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('sent','failed','unknown') or length(coalesce(p_provider,''))>200 or length(coalesce(p_error,''))>80 then raise exception 'invalid'; end if;
  update public.marketing_delivery_receipts set status=p_status,provider_id=p_provider,error_code=p_error,accepted_at=case when p_status='sent' then now() else null end
    where id=p_id and owner_id=p_owner and status='sending';
  return found;
end $$;
revoke all on function public.begin_marketing_delivery(uuid,uuid,text,uuid,text,text,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_marketing_delivery(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_marketing_delivery(uuid,uuid,text,uuid,text,text,uuid,uuid,timestamptz) to service_role;
grant execute on function public.finish_marketing_delivery(uuid,uuid,text,text,text) to service_role;

-- Revoking an as-yet unsent consent also blocks an older offline device from
-- creating that same consent later. A new opt-in must generate a new random ID.
create or replace function public.revoke_marketing_consent(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  insert into public.marketing_consents(id,owner_id,revoked_at) values(p_id,auth.uid(),now())
  on conflict(id) do update set revoked_at=coalesce(marketing_consents.revoked_at,now()) where marketing_consents.owner_id=auth.uid();
end $$;
create or replace function public.unsubscribe_marketing(p_id uuid,p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare consent public.marketing_consents;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  select * into consent from public.marketing_consents where id=p_id and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(consent.owner_id::text, 817));
  update public.marketing_consents set revoked_at=coalesce(revoked_at,now()) where owner_id=consent.owner_id and channel=consent.channel and target_hash=consent.target_hash;
  return true;
end $$;
revoke all on function public.revoke_marketing_consent(uuid) from public,anon,authenticated;
grant execute on function public.revoke_marketing_consent(uuid) to authenticated;
revoke all on function public.unsubscribe_marketing(uuid,text) from public,anon,authenticated;
grant execute on function public.unsubscribe_marketing(uuid,text) to anon,authenticated;
