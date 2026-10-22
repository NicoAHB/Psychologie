-- Optional, additive migration. No names, client ids, notes, SDP or ICE candidates are stored.
-- Run in your Supabase SQL editor, then disable public Realtime channels in project settings.
create table if not exists public.video_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  closed boolean not null default false
);
alter table public.video_rooms enable row level security;
revoke all on public.video_rooms from public, anon, authenticated;
grant all on public.video_rooms to service_role;

create or replace function public.create_video_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.video_rooms%rowtype; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 391));
  delete from public.video_rooms where owner_id = caller and (expires_at < now() or closed);
  if (select count(*) from public.video_rooms where owner_id = caller) >= 3 then raise exception 'ROOM_LIMIT'; end if;
  insert into public.video_rooms(owner_id, expires_at) values (caller, now() + interval '2 hours') returning * into room;
  return jsonb_build_object('id', room.id, 'expires_at', room.expires_at);
end; $$;
revoke all on function public.create_video_room() from public, anon;
grant execute on function public.create_video_room() to authenticated;

create or replace function public.close_video_room(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.video_rooms set closed = true where id = p_id and owner_id = auth.uid();
$$;
revoke all on function public.close_video_room(uuid) from public, anon;
grant execute on function public.close_video_room(uuid) to authenticated;

-- A random 128-bit room id is an unguessable rendezvous capability. The separate 256-bit
-- encryption secret lives ONLY in the URL fragment / peer memory, never in this database.
create or replace function public.get_video_room(p_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'expires_at', expires_at) from public.video_rooms
    where id = p_id and not closed and expires_at > now();
$$;
revoke all on function public.get_video_room(uuid) from public;
grant execute on function public.get_video_room(uuid) to anon, authenticated;

create or replace function public.video_can_signal(p_topic text)
returns boolean language sql security definer set search_path = '' as $$
  select exists(select 1 from public.video_rooms r
    where p_topic = 'praxisraum-video:' || r.id::text and not r.closed and r.expires_at > now()
      and (auth.role() = 'anon' or r.owner_id = auth.uid()));
$$;
revoke all on function public.video_can_signal(text) from public;
grant execute on function public.video_can_signal(text) to anon, authenticated;

drop policy if exists "video encrypted broadcast receive" on realtime.messages;
create policy "video encrypted broadcast receive" on realtime.messages for select to anon, authenticated
  using (extension = 'broadcast' and public.video_can_signal((select realtime.topic())));
drop policy if exists "video encrypted broadcast send" on realtime.messages;
create policy "video encrypted broadcast send" on realtime.messages for insert to anon, authenticated
  with check (extension = 'broadcast' and public.video_can_signal((select realtime.topic())));
