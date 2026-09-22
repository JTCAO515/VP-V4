-- User-set reminders are retained, never represented as scheduled push delivery.
create table public.travel_reminders (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  session_id uuid not null,
  base_version integer not null check (base_version >= 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 240),
  due_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > due_at),
  time_zone text not null,
  purpose text not null default 'user_set_travel' check (purpose = 'user_set_travel'),
  consent_at timestamptz not null default now(),
  status text not null default 'saved' check (status in ('saved','cancelled','completed')),
  created_at timestamptz not null default now(),
  unique(owner_id,trip_id,base_version,due_at,reason)
);
create index travel_reminders_owner_trip on public.travel_reminders(owner_id,trip_id,created_at);
alter table public.travel_reminders enable row level security;
revoke all on public.travel_reminders from public,anon,authenticated;
grant select on public.travel_reminders to authenticated;
create policy reminder_owner on public.travel_reminders for select to authenticated
  using(owner_id=(select auth.uid()) and identity_private.mobile_access_v2());

-- Narrow definer RPC: direct writes are denied; identity, ownership and transitions
-- are checked here, including direct Data API callers. No worker/send grant exists.
create function public.travel_reminders_v1(p_trip uuid,p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid(); s uuid := (auth.jwt()->>'session_id')::uuid;
  t public.trips%rowtype; r public.travel_reminders%rowtype;
  rid uuid; due timestamptz; expiry timestamptz; zone text; why text; rev integer;
  rows jsonb; archived boolean := null; trip_end timestamptz;
begin
  perform identity_private.guard_mobile_rpc_v2();
  if u is null or s is null or auth.jwt()->>'role' is distinct from 'authenticated'
    or (auth.jwt()->>'is_anonymous')::boolean is distinct from false or not exists(select 1 from auth.sessions where id=s and user_id=u)
    or not exists(select 1 from identity_private.mobile_accounts where owner_id=u and session_id=s)
    then raise exception 'UNAUTHENTICATED'; end if;
  select * into t from public.trips where id=p_trip and owner_id=u for update;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;
  if p_action = 'create' then
    if jsonb_typeof(p_input) is distinct from 'object' or
      (select count(*) from jsonb_object_keys(p_input)) <> 8 or
      p_input->>'purpose' is distinct from 'user_set_travel' or p_input->'consent' is distinct from 'true'::jsonb
      then raise exception 'INVALID_INPUT'; end if;
    rid := (p_input->>'id')::uuid; rev := (p_input->>'baseVersion')::integer;
    due := (p_input->>'dueAt')::timestamptz; expiry := (p_input->>'expiresAt')::timestamptz;
    zone := p_input->>'timeZone'; why := btrim(p_input->>'reason');
    -- Closed request schema checked at both API and storage boundary.
    if rid is null or rev is null or due is null or expiry is null or zone is null or why is null
      or char_length(why) not between 1 and 240
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone)
      then raise exception 'INVALID_INPUT'; end if;
    select * into r from public.travel_reminders where id=rid;
    if found then
      if r.owner_id<>u or r.trip_id<>p_trip or r.base_version<>rev or r.due_at<>due or r.expires_at<>expiry or r.reason<>why or r.time_zone<>zone
        then raise exception 'INVALID_INPUT'; end if;
      -- A replay never resurrects a cancelled/completed reminder or changes session.
    else
      if rev<>t.head_version then raise exception 'STALE_TRIP_VERSION'; end if;
      if due<=now() or due>now()+interval '365 days' or expiry<=due or expiry>due+interval '24 hours'
        then raise exception 'INVALID_INPUT'; end if;
      if (select count(*) from public.travel_reminders where owner_id=u and trip_id=p_trip and status='saved') >= 50 then raise exception 'INVALID_INPUT'; end if;
      if exists(select 1 from public.travel_reminders where owner_id=u and trip_id=p_trip and base_version=rev and due_at=due and reason=why) then raise exception 'INVALID_INPUT'; end if;
      insert into public.travel_reminders(id,owner_id,trip_id,session_id,base_version,reason,due_at,expires_at,time_zone)
      values(rid,u,p_trip,s,rev,why,due,expiry,zone);
    end if;
  elsif p_action in ('cancel','complete') then
    if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>1
      or p_input->>'id' is null then raise exception 'INVALID_INPUT'; end if;
    update public.travel_reminders set status=case when p_action='cancel' then 'cancelled' else 'completed' end
      where id=(p_input->>'id')::uuid and owner_id=u and trip_id=p_trip and status='saved';
  elsif p_action is distinct from 'list' or p_input <> '{}'::jsonb then raise exception 'INVALID_INPUT'; end if;
  if pg_catalog.to_regclass('public.trip_archives') is not null then
    execute 'select exists(select 1 from public.trip_archives where trip_id=$1 and owner_id=$2)' into archived using p_trip,u;
  end if;
  if not exists(select 1 from public.trip_days d where d.trip_id=p_trip and (d.time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=d.time_zone))) then
    select max((trip_date+1)::timestamp at time zone time_zone) into trip_end from public.trip_days where trip_id=p_trip;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason,'dueAt',due_at,'expiresAt',expires_at,
    'timeZone',time_zone,'baseVersion',base_version,'status',status,
    'ownerId',owner_id,'tripId',trip_id,'sessionId',session_id,'purpose',purpose,
    'currentTimeZone',case when exists(select 1 from public.trip_days d where d.trip_id=p_trip and d.time_zone=q.time_zone) then time_zone else '' end) order by (status='saved') desc,created_at desc),'[]'::jsonb)
    into rows from (select * from public.travel_reminders where owner_id=u and trip_id=p_trip order by (status='saved') desc,created_at desc limit 100) q;
  return jsonb_build_object('version',1,'tripId',p_trip,'delivery','unavailable','watch','not_enabled','reminders',rows,'tripVersion',t.head_version,'archived',archived,'tripEndsAt',trip_end);
end $$;
revoke all on function public.travel_reminders_v1(uuid,text,jsonb) from public,anon;
grant execute on function public.travel_reminders_v1(uuid,text,jsonb) to authenticated;
