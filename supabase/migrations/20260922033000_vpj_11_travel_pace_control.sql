-- VPJ-11: the existing Profile field remains the only travel-pace authority.
-- No old/default value acquires consent. No provider/model recipient is authorized.
alter table public.user_profiles
  add column pace_revision bigint not null default 0 check (pace_revision between 0 and 9007199254740990),
  add column pace_state text not null default 'unset' check (pace_state in ('unset','explicit','paused','revoked')),
  add column pace_notice text check (pace_notice is null or pace_notice = 'local-planning-cross-trip-v1'),
  add column pace_operation uuid,
  add column pace_request jsonb,
  add column pace_undo jsonb;
alter table public.user_profiles add constraint pace_consent_required
  check (pace_state not in ('explicit','paused') or pace_notice is not null);

create schema if not exists memory_private;
revoke all on schema memory_private from public, anon, authenticated;

-- The legacy Web writer cannot silently change a consented value. It does not
-- update pace_revision; a real correction through the new RPC always does.
create function memory_private.invalidate_legacy_pace()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.travel_pace is distinct from old.travel_pace and new.pace_revision = old.pace_revision then
    new.pace_revision := old.pace_revision + 1;
    new.pace_state := 'unset'; new.pace_notice := null;
    new.pace_operation := null; new.pace_request := null; new.pace_undo := null;
  end if;
  return new;
end $$;
revoke all on function memory_private.invalidate_legacy_pace() from public,anon,authenticated;
create trigger pace_legacy_invalidation before update on public.user_profiles
  for each row execute function memory_private.invalidate_legacy_pace();

create function memory_private.pace_json(p public.user_profiles)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('schemaVersion','travel-pace/1',
    'revision',coalesce(p.pace_revision,0), 'state',coalesce(p.pace_state,'unset'),
    'travelPace',case when p.pace_state in ('explicit','paused') then p.travel_pace else null end,
    'scope',case when p.pace_notice is not null then 'account' else null end,
    'purpose',case when p.pace_notice is not null then 'local_trip_planning' else null end,
    'noticeVersion',p.pace_notice, 'operationId',p.pace_operation);
$$;
revoke all on function memory_private.pace_json(public.user_profiles) from public,anon,authenticated;

create function public.native_travel_pace_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  p public.user_profiles%rowtype;
  op uuid; expected bigint; action text := p_input->>'action';
  before_value jsonb;
begin
  -- Locks the mobile epoch before the Profile row, including read/replay paths.
  perform identity_private.mobile_session_v2('session');
  if p_input is null or jsonb_typeof(p_input) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  if action = 'read' then
    if p_input <> '{"action":"read"}'::jsonb then raise exception 'INVALID_INPUT'; end if;
    select * into p from public.user_profiles where owner_id=u;
    return memory_private.pace_json(p);
  end if;
  if action is null or action not in ('save','pause','revoke','undo')
    or (p_input - array['action','operationId','expectedRevision','travelPace','noticeVersion']) <> '{}'::jsonb
    or jsonb_typeof(p_input->'operationId') is distinct from 'string'
    or (p_input->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'number'
    or (p_input->>'expectedRevision') !~ '^(0|[1-9][0-9]{0,15})$'
    then raise exception 'INVALID_INPUT'; end if;
  expected := (p_input->>'expectedRevision')::bigint;
  if expected > 9007199254740990 then raise exception 'INVALID_INPUT'; end if;
  if action='save' then
    if (p_input->>'travelPace') is null or p_input->>'travelPace' not in ('relaxed','balanced','packed')
      or p_input->>'noticeVersion' is distinct from 'local-planning-cross-trip-v1'
      then raise exception 'INVALID_INPUT'; end if;
  elsif p_input ? 'travelPace' or p_input ? 'noticeVersion' then raise exception 'INVALID_INPUT'; end if;
  op := (p_input->>'operationId')::uuid;
  insert into public.user_profiles(owner_id) values(u) on conflict on constraint user_profiles_pkey do nothing;
  select * into p from public.user_profiles where owner_id=u for update;
  if p.pace_operation=op then
    if p.pace_request is distinct from p_input then raise exception 'PACE_OPERATION_REUSE'; end if;
    return memory_private.pace_json(p) || '{"reused":true}'::jsonb;
  end if;
  -- An older operation after correction/revocation is rejected, never replayed.
  if expected <> p.pace_revision then raise exception 'PACE_CONFLICT'; end if;
  if action='pause' and p.pace_state <> 'explicit' then raise exception 'PACE_CONFLICT'; end if;
  if action='undo' and (p.pace_request->>'action' is distinct from 'save' or p.pace_undo is null)
    then raise exception 'PACE_CONFLICT'; end if;
  before_value := case when action='save' then jsonb_build_object(
    'travelPace',p.travel_pace,'state',p.pace_state,'noticeVersion',p.pace_notice) else null end;
  update public.user_profiles set
    travel_pace = case action when 'save' then p_input->>'travelPace'
      when 'revoke' then 'balanced' when 'undo' then p.pace_undo->>'travelPace' else p.travel_pace end,
    pace_state = case action when 'save' then 'explicit' when 'pause' then 'paused'
      when 'revoke' then 'revoked' else p.pace_undo->>'state' end,
    pace_notice = case action when 'save' then p_input->>'noticeVersion' when 'revoke' then null
      when 'undo' then p.pace_undo->>'noticeVersion' else p.pace_notice end,
    pace_revision = p.pace_revision + 1, pace_operation=op, pace_request=p_input,
    pace_undo=before_value, updated_at=clock_timestamp()
    where owner_id=u returning * into p;
  return memory_private.pace_json(p) || '{"reused":false}'::jsonb;
end $$;
revoke all on function public.native_travel_pace_v1(jsonb) from public,anon,service_role;
grant execute on function public.native_travel_pace_v1(jsonb) to authenticated;

-- Task-specific read. It never returns the profile management list, summary,
-- display name, units or any other preference. Re-read for every attempt.
create function public.native_task_travel_pace_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid(); p public.user_profiles%rowtype; trip uuid;
  pace text; source text := 'none'; rev bigint; operation uuid;
begin
  perform identity_private.mobile_session_v2('session');
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['tripId','currentPace','useSaved','expectedSourceRevision']) <> '{}'::jsonb
    or jsonb_typeof(p_input->'tripId') is distinct from 'string'
    or (p_input->>'tripId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'useSaved') is distinct from 'boolean'
    or not (p_input ? 'currentPace')
    or (p_input->'currentPace' <> 'null'::jsonb and p_input->>'currentPace' not in ('relaxed','balanced','packed'))
    or (p_input ? 'expectedSourceRevision' and (jsonb_typeof(p_input->'expectedSourceRevision') is distinct from 'number'
      or (p_input->>'expectedSourceRevision') !~ '^(0|[1-9][0-9]{0,15})$'))
    then raise exception 'INVALID_INPUT'; end if;
  trip := (p_input->>'tripId')::uuid;
  if not exists(select 1 from public.trips where id=trip and owner_id=u) then raise exception 'FORBIDDEN'; end if;
  select * into p from public.user_profiles where owner_id=u;
  if p_input->>'currentPace' is not null then
    pace := p_input->>'currentPace'; source := 'current_input';
  elsif (p_input->>'useSaved')::boolean and p.pace_state='explicit'
    and p.pace_notice='local-planning-cross-trip-v1' then
    pace := p.travel_pace; source := 'profile'; rev := p.pace_revision; operation := p.pace_operation;
  end if;
  if p_input ? 'expectedSourceRevision' and (source <> 'profile'
    or rev is distinct from (p_input->>'expectedSourceRevision')::bigint) then raise exception 'PACE_STALE_SOURCE'; end if;
  return jsonb_build_object('schemaVersion','task-travel-pace/1','tripId',trip,
    'travelPace',pace,'source',source,'sourceRevision',rev,'sourceOperationId',operation,
    'purpose','local_trip_planning');
end $$;
revoke all on function public.native_task_travel_pace_v1(jsonb) from public,anon,service_role;
grant execute on function public.native_task_travel_pace_v1(jsonb) to authenticated;
