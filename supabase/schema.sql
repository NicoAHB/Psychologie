-- Run once in the SQL editor of your own Supabase project.
-- No plaintext practice records, tags, names or photographs are stored here.
create table if not exists public.encrypted_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_id uuid not null,
  salt text not null check (length(salt) = 24),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload ? 'iv' and payload ? 'ciphertext'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.encrypted_vaults enable row level security;
drop policy if exists "read own encrypted vault" on public.encrypted_vaults;
create policy "read own encrypted vault" on public.encrypted_vaults for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.encrypted_vaults from anon, authenticated;
grant select on public.encrypted_vaults to authenticated;
grant all on public.encrypted_vaults to service_role;

create or replace function public.save_encrypted_vault(p_expected_revision bigint, p_vault_id uuid, p_salt text, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  existing public.encrypted_vaults%rowtype;
  next_revision bigint;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  select * into existing from public.encrypted_vaults where user_id = caller for update;
  if coalesce(existing.revision, 0) <> p_expected_revision then raise exception 'SYNC_CONFLICT'; end if;
  if existing.vault_id is not null and existing.vault_id <> p_vault_id then raise exception 'DIFFERENT_VAULT'; end if;
  next_revision := coalesce(existing.revision, 0) + 1;
  insert into public.encrypted_vaults(user_id, vault_id, salt, payload, revision)
    values (caller, p_vault_id, p_salt, p_payload, next_revision)
    on conflict(user_id) do update set payload = excluded.payload, revision = excluded.revision, updated_at = now();
  return next_revision;
end;
$$;
revoke all on function public.save_encrypted_vault(bigint, uuid, text, jsonb) from public, anon;
grant execute on function public.save_encrypted_vault(bigint, uuid, text, jsonb) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('encrypted-notes', 'encrypted-notes', false, 16777216, array['application/json'])
on conflict(id) do update set public = false, file_size_limit = 16777216, allowed_mime_types = array['application/json'];
drop policy if exists "own encrypted image select" on storage.objects;
drop policy if exists "own encrypted image insert" on storage.objects;
drop policy if exists "own encrypted image update" on storage.objects;
drop policy if exists "own encrypted image delete" on storage.objects;
create policy "own encrypted image select" on storage.objects for select to authenticated using (bucket_id = 'encrypted-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own encrypted image insert" on storage.objects for insert to authenticated with check (bucket_id = 'encrypted-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own encrypted image update" on storage.objects for update to authenticated using (bucket_id = 'encrypted-notes' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'encrypted-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own encrypted image delete" on storage.objects for delete to authenticated using (bucket_id = 'encrypted-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- due_at and expires_at are minimal scheduling metadata visible to the server.
-- Everything required to deliver is hybrid RSA-OAEP / AES-GCM encrypted.
create table if not exists public.reminder_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null,
  expires_at timestamptz not null,
  payload jsonb not null check (payload->>'version' = '1' and payload ? 'wrappedKey' and payload ? 'iv' and payload ? 'ciphertext'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'uncertain')),
  advisor_sent boolean not null default false,
  client_sent boolean not null default false,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  sent_at timestamptz,
  check (due_at < expires_at)
);
-- Additive migration for installations that already have the reminder table.
alter table public.reminder_jobs add column if not exists claim_token uuid;
alter table public.reminder_jobs add column if not exists advisor_sending_at timestamptz;
alter table public.reminder_jobs add column if not exists client_sending_at timestamptz;
alter table public.reminder_jobs drop constraint if exists reminder_jobs_status_check;
alter table public.reminder_jobs add constraint reminder_jobs_status_check check (status in ('pending', 'processing', 'sent', 'failed', 'uncertain'));
create index if not exists reminder_jobs_pending on public.reminder_jobs(user_id, due_at) where status in ('pending', 'processing');
alter table public.reminder_jobs enable row level security;
drop policy if exists "read own reminders" on public.reminder_jobs;
create policy "read own reminders" on public.reminder_jobs for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.reminder_jobs from anon, authenticated;
grant select on public.reminder_jobs to authenticated;
grant all on public.reminder_jobs to service_role;

create or replace function public.replace_reminder_jobs(p_jobs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  job jsonb;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 1000 then raise exception 'INVALID_JOBS'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  delete from public.reminder_jobs r where r.user_id = caller and r.status <> 'processing'
    and not exists(select 1 from jsonb_array_elements(p_jobs) j where (j->>'id')::uuid = r.id);
  for job in select * from jsonb_array_elements(p_jobs) loop
    if exists (select 1 from public.reminder_jobs where id = (job->>'id')::uuid and user_id <> caller) then raise exception 'INVALID_JOB_OWNER'; end if;
    insert into public.reminder_jobs(id, user_id, due_at, expires_at, payload)
      values ((job->>'id')::uuid, caller, (job->>'due_at')::timestamptz, (job->>'expires_at')::timestamptz, job->'payload')
      on conflict(id) do update set due_at = excluded.due_at, expires_at = excluded.expires_at, payload = excluded.payload
      where public.reminder_jobs.user_id = caller and public.reminder_jobs.status in ('pending', 'failed');
  end loop;
end;
$$;
revoke all on function public.replace_reminder_jobs(jsonb) from public, anon;
grant execute on function public.replace_reminder_jobs(jsonb) to authenticated;

create or replace function public.claim_reminder_jobs(p_owner uuid, p_limit integer default 20)
returns setof public.reminder_jobs language plpgsql security definer set search_path = '' as $$
begin
  -- A timeout after Telegram may mean delivery succeeded. Never automatically resend this recipient.
  update public.reminder_jobs set status = 'uncertain', last_error = 'delivery_uncertain', lease_until = null
    where user_id = p_owner and status = 'processing' and lease_until < now()
      and (advisor_sending_at is not null or client_sending_at is not null);
  return query update public.reminder_jobs set status = 'processing', lease_until = now() + interval '2 minutes',
    claim_token = gen_random_uuid(), attempts = attempts + 1
  where id in (
    select id from public.reminder_jobs
    where user_id = p_owner and due_at <= now() and expires_at > now() and next_attempt_at <= now()
      and attempts < 5 and (status = 'pending' or (status = 'processing' and lease_until < now()))
    order by due_at for update skip locked limit greatest(1, least(p_limit, 100))
  ) returning *;
end;
$$;
revoke all on function public.claim_reminder_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_reminder_jobs(uuid, integer) to service_role;

create or replace function public.begin_reminder_delivery(p_owner uuid, p_job uuid, p_claim uuid, p_recipient text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient not in ('advisor', 'client') then return false; end if;
  update public.reminder_jobs set
    advisor_sending_at = case when p_recipient = 'advisor' then now() else advisor_sending_at end,
    client_sending_at = case when p_recipient = 'client' then now() else client_sending_at end,
    lease_until = now() + interval '2 minutes'
  where id = p_job and user_id = p_owner and claim_token = p_claim and status = 'processing'
    and lease_until > now() and expires_at > now() and due_at <= now()
    and case when p_recipient = 'advisor' then not advisor_sent and advisor_sending_at is null
      else not client_sent and client_sending_at is null end;
  return found;
end;
$$;
create or replace function public.complete_reminder_delivery(p_owner uuid, p_job uuid, p_claim uuid, p_recipient text, p_sent boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient not in ('advisor', 'client') then return false; end if;
  update public.reminder_jobs set
    advisor_sent = case when p_recipient = 'advisor' then p_sent else advisor_sent end,
    client_sent = case when p_recipient = 'client' then p_sent else client_sent end,
    advisor_sending_at = case when p_recipient = 'advisor' then null else advisor_sending_at end,
    client_sending_at = case when p_recipient = 'client' then null else client_sending_at end
  where id = p_job and user_id = p_owner and claim_token = p_claim and status = 'processing' and lease_until > now()
    and case when p_recipient = 'advisor' then advisor_sending_at is not null else client_sending_at is not null end;
  return found;
end;
$$;
create or replace function public.finish_reminder_job(p_owner uuid, p_job uuid, p_claim uuid, p_result text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_result not in ('sent', 'retry', 'expired') then return false; end if;
  update public.reminder_jobs set
    status = case when advisor_sending_at is not null or client_sending_at is not null then 'uncertain'
      when p_result = 'sent' then 'sent' when p_result = 'expired' or attempts >= 5 then 'failed' else 'pending' end,
    last_error = case when advisor_sending_at is not null or client_sending_at is not null then 'delivery_uncertain'
      when p_result = 'sent' then null when p_result = 'expired' then 'expired' else 'delivery_failed' end,
    sent_at = case when p_result = 'sent' and advisor_sending_at is null and client_sending_at is null then now() else sent_at end,
    lease_until = null, claim_token = null, next_attempt_at = now() + least(60, power(2, least(attempts, 6))) * interval '1 minute'
  where id = p_job and user_id = p_owner and claim_token = p_claim and status = 'processing' and lease_until > now();
  return found;
end;
$$;
revoke all on function public.begin_reminder_delivery(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_reminder_delivery(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.finish_reminder_job(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_reminder_delivery(uuid, uuid, uuid, text) to service_role;
grant execute on function public.complete_reminder_delivery(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.finish_reminder_job(uuid, uuid, uuid, text) to service_role;
