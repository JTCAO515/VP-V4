-- Append-only repair verified against the isolated 11 -> 13 migration rehearsal.
-- No original migration, table grants, user data or RPC signatures change.
-- PostgreSQL has jsonb_object_keys, not jsonb_object_length.
create or replace function public.apply_trip_content_patch(p_current jsonb, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare
  next_content jsonb := p_current;
  operation jsonb;
  item jsonb;
  op_kind text;
  op_day_id text;
  op_item_id text;
  op_title text;
  op_date date;
  op_timezone text;
  op_starts timestamptz;
  op_ends timestamptz;
  next_days jsonb;
begin
  if jsonb_typeof(p_current) <> 'object' or jsonb_typeof(p_current->'days') <> 'array' then raise exception 'INVALID_PATCH'; end if;
  if jsonb_typeof(p_patch) = 'object' and p_patch ? 'title' and not p_patch ? 'operations' then
    if (select count(*) from pg_catalog.jsonb_object_keys(p_patch)) <> 1 or jsonb_typeof(p_patch->'title') <> 'string' or char_length(btrim(p_patch->>'title')) not between 1 and 160 then raise exception 'INVALID_PATCH'; end if;
    return jsonb_set(next_content, '{title}', to_jsonb(btrim(p_patch->>'title')));
  end if;
  if jsonb_typeof(p_patch) <> 'object' or (select count(*) from pg_catalog.jsonb_object_keys(p_patch)) <> 2 or jsonb_typeof(p_patch->'expectedVersion') <> 'number' or p_patch->>'expectedVersion' !~ '^\d{1,9}$' or jsonb_typeof(p_patch->'operations') <> 'array' or jsonb_array_length(p_patch->'operations') = 0 then raise exception 'INVALID_PATCH'; end if;
  for operation in select value from jsonb_array_elements(p_patch->'operations') loop
    if jsonb_typeof(operation) <> 'object' or jsonb_typeof(operation->'kind') <> 'string' then raise exception 'INVALID_PATCH'; end if;
    op_kind := operation->>'kind';
    if op_kind = 'set_title' then
      if (select count(*) from pg_catalog.jsonb_object_keys(operation)) <> 2 or jsonb_typeof(operation->'title') <> 'string' or char_length(btrim(operation->>'title')) not between 1 and 160 then raise exception 'INVALID_PATCH'; end if;
      next_content := jsonb_set(next_content, '{title}', to_jsonb(btrim(operation->>'title')));
    elsif op_kind = 'upsert_day' then
      if (select count(*) from pg_catalog.jsonb_object_keys(operation)) not between 3 and 4 or exists(select 1 from jsonb_object_keys(operation) key where key not in ('kind', 'dayId', 'date', 'timeZone')) or not (operation ? 'dayId' and operation ? 'date') or jsonb_typeof(operation->'dayId') <> 'string' or jsonb_typeof(operation->'date') <> 'string' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or operation->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_PATCH'; end if;
      begin op_date := (operation->>'date')::date; exception when others then raise exception 'INVALID_PATCH'; end;
      op_day_id := operation->>'dayId'; op_timezone := operation->>'timeZone';
      if (operation ? 'timeZone' and (jsonb_typeof(operation->'timeZone') <> 'string' or not exists(select 1 from pg_timezone_names where name = op_timezone))) then raise exception 'INVALID_PATCH'; end if;
      select coalesce(jsonb_agg(value), '[]'::jsonb) into next_days from jsonb_array_elements(next_content->'days') where value->>'id' <> op_day_id;
      next_days := next_days || jsonb_build_array(jsonb_build_object('id', op_day_id, 'date', to_char(op_date, 'YYYY-MM-DD'), 'items', coalesce((select value->'items' from jsonb_array_elements(next_content->'days') where value->>'id' = op_day_id), '[]'::jsonb)) || case when op_timezone is null then '{}'::jsonb else jsonb_build_object('timeZone', op_timezone) end);
      next_content := jsonb_set(next_content, '{days}', next_days);
    elsif op_kind = 'delete_day' then
      if (select count(*) from pg_catalog.jsonb_object_keys(operation)) <> 2 or jsonb_typeof(operation->'dayId') <> 'string' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or not exists(select 1 from jsonb_array_elements(next_content->'days') where value->>'id' = operation->>'dayId') then raise exception 'INVALID_PATCH'; end if;
      select coalesce(jsonb_agg(value), '[]'::jsonb) into next_days from jsonb_array_elements(next_content->'days') where value->>'id' <> operation->>'dayId';
      next_content := jsonb_set(next_content, '{days}', next_days);
    elsif op_kind = 'upsert_item' then
      if (select count(*) from pg_catalog.jsonb_object_keys(operation)) not between 4 and 6 or exists(select 1 from jsonb_object_keys(operation) key where key not in ('kind', 'itemId', 'dayId', 'title', 'startsAt', 'endsAt')) or not (operation ? 'itemId' and operation ? 'dayId' and operation ? 'title') or jsonb_typeof(operation->'itemId') <> 'string' or jsonb_typeof(operation->'dayId') <> 'string' or jsonb_typeof(operation->'title') <> 'string' or operation->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or char_length(btrim(operation->>'title')) not between 1 and 160 then raise exception 'INVALID_PATCH'; end if;
      if not exists(select 1 from jsonb_array_elements(next_content->'days') where value->>'id' = operation->>'dayId') then raise exception 'INVALID_PATCH'; end if;
      begin op_starts := nullif(operation->>'startsAt', '')::timestamptz; op_ends := nullif(operation->>'endsAt', '')::timestamptz; exception when others then raise exception 'INVALID_PATCH'; end;
      if (operation ? 'startsAt' and (jsonb_typeof(operation->'startsAt') <> 'string' or operation->>'startsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$')) or (operation ? 'endsAt' and (jsonb_typeof(operation->'endsAt') <> 'string' or operation->>'endsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$')) or (op_starts is not null and op_ends is not null and op_ends <= op_starts) then raise exception 'INVALID_PATCH'; end if;
      op_day_id := operation->>'dayId'; op_item_id := operation->>'itemId'; op_title := btrim(operation->>'title');
      select coalesce(jsonb_agg(case when value->>'id' = op_day_id then jsonb_set(value, '{items}', (select coalesce(jsonb_agg(candidate), '[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', op_item_id, 'dayId', op_day_id, 'title', op_title) || case when operation ? 'startsAt' then jsonb_build_object('startsAt', operation->'startsAt') else '{}'::jsonb end || case when operation ? 'endsAt' then jsonb_build_object('endsAt', operation->'endsAt') else '{}'::jsonb end) from jsonb_array_elements(value->'items') candidate where candidate->>'id' <> op_item_id)) else value end), '[]'::jsonb) into next_days from jsonb_array_elements(next_content->'days');
      next_content := jsonb_set(next_content, '{days}', next_days);
    elsif op_kind = 'delete_item' then
      if (select count(*) from pg_catalog.jsonb_object_keys(operation)) <> 3 or jsonb_typeof(operation->'itemId') <> 'string' or jsonb_typeof(operation->'dayId') <> 'string' or operation->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or not exists(select 1 from jsonb_array_elements(next_content->'days') day, jsonb_array_elements(day.value->'items') candidate where day.value->>'id' = operation->>'dayId' and candidate->>'id' = operation->>'itemId') then raise exception 'INVALID_PATCH'; end if;
      select coalesce(jsonb_agg(case when value->>'id' = operation->>'dayId' then jsonb_set(value, '{items}', (select coalesce(jsonb_agg(candidate), '[]'::jsonb) from jsonb_array_elements(value->'items') candidate where candidate->>'id' <> operation->>'itemId')) else value end), '[]'::jsonb) into next_days from jsonb_array_elements(next_content->'days');
      next_content := jsonb_set(next_content, '{days}', next_days);
    else raise exception 'INVALID_PATCH'; end if;
  end loop;
  if exists(select 1 from (select value->>'date' as trip_date, count(*) from jsonb_array_elements(next_content->'days') group by value->>'date' having count(*) > 1) duplicates) then raise exception 'INVALID_PATCH'; end if;
  if exists(select 1 from (select item.value->>'id' as item_id, count(*) from jsonb_array_elements(next_content->'days') day, jsonb_array_elements(day.value->'items') item group by item.value->>'id' having count(*) > 1) duplicates) then raise exception 'INVALID_PATCH'; end if;
  select jsonb_set(next_content, '{days}', coalesce(jsonb_agg(jsonb_set(day.value, '{items}', coalesce((select jsonb_agg(item.value order by item.value->>'id') from jsonb_array_elements(day.value->'items') item), '[]'::jsonb)) order by day.value->>'date', day.value->>'id'), '[]'::jsonb)) into next_content from jsonb_array_elements(next_content->'days') day;
  return next_content;
end;
$$;

-- Keep the public UUID contract and the existing text storage representation.
create or replace function public.start_chat_turn(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_digest text)
returns table(turn_id uuid, reused boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  thread public.chat_threads%rowtype;
  previous public.chat_turn_idempotency%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_digest <> 'chat-state-control-v1' then raise exception 'invalid state control digest'; end if;
  select * into thread from public.chat_threads where id = p_thread_id and owner_id = (select auth.uid()) for update;
  if not found or thread.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.chat_turn_idempotency
    where owner_id = (select auth.uid()) and thread_id = p_thread_id and idempotency_key = p_idempotency_key::text for update;
  if found then
    if previous.digest <> p_digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return query select previous.turn_id, true;
    return;
  end if;
  insert into public.turns(id, owner_id, thread_id, trip_id, status)
    values (p_turn_id, thread.owner_id, thread.id, thread.trip_id, 'accepted');
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (thread.owner_id, thread.id, p_turn_id, 'accepted', 1, 'turn-sse-v1', 'accepted', 'accepted');
  insert into public.chat_turn_idempotency(owner_id, thread_id, idempotency_key, digest, turn_id)
    values (thread.owner_id, thread.id, p_idempotency_key::text, p_digest, p_turn_id);
  update public.chat_threads set updated_at = now() where id = thread.id;
  return query select p_turn_id, false;
end;
$$;
revoke all on function public.start_chat_turn(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.start_chat_turn(uuid, uuid, uuid, text) to authenticated;

-- Direct authenticated UPDATE on trips stays revoked. This narrow RPC locks only
-- auth.uid()-owned parent/trip rows and can only create an unconfirmed child.
create or replace function public.revise_trip_proposal(
  p_proposal_id uuid,
  p_title text
)
returns table(outcome text, proposal_id uuid, revision integer, base_trip_version integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  parent public.trip_proposals%rowtype;
  child public.trip_proposals%rowtype;
  trip public.trips%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
    return query select 'invalid_patch'::text, null::uuid, null::integer, null::integer;
    return;
  end if;

  select * into parent from public.trip_proposals
    where id = p_proposal_id and owner_id = (select auth.uid()) for update;
  -- Preserve the old RLS WITH CHECK: rollback parents are never revisable here.
  if not found or parent.status <> 'pending' or parent.rollback_snapshot_version is not null then
    return query select 'proposal_not_confirmable'::text, null::uuid, null::integer, null::integer;
    return;
  end if;
  if parent.expires_at <= now() then
    update public.trip_proposals set status = 'expired' where id = parent.id;
    return query select 'proposal_expired'::text, null::uuid, null::integer, null::integer;
    return;
  end if;

  select * into trip from public.trips
    where id = parent.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> parent.base_trip_version then
    update public.trip_proposals set status = 'conflicted' where id = parent.id;
    return query select 'version_conflict'::text, null::uuid, null::integer, null::integer;
    return;
  end if;

  insert into public.trip_proposals(
    owner_id, trip_id, revision, base_trip_version, status, patch, expires_at, parent_proposal_id
  ) values (
    parent.owner_id, parent.trip_id, parent.revision + 1, parent.base_trip_version, 'pending',
    jsonb_build_object('title', btrim(p_title)), parent.expires_at, parent.id
  ) returning * into child;

  update public.trip_proposals set status = 'superseded' where id = parent.id;
  return query select 'revised'::text, child.id, child.revision, child.base_trip_version;
end;
$$;
revoke all on function public.revise_trip_proposal(uuid, text) from public, anon;
grant execute on function public.revise_trip_proposal(uuid, text) to authenticated;

-- Qualify columns that otherwise collide with RETURNS TABLE output variables.
create or replace function public.create_trip_proposal_patch(p_trip_id uuid, p_patch jsonb)
returns table(proposal_id uuid, revision integer, base_trip_version integer)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare trip public.trips%rowtype; next_revision integer; created public.trip_proposals%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into trip from public.trips where id = p_trip_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch->>'expectedVersion' !~ '^\d{1,9}$' or (p_patch->>'expectedVersion')::integer <> trip.head_version then raise exception 'STALE_TRIP_VERSION'; end if;
  perform public.apply_trip_content_patch(public.trip_content_snapshot(trip.id, trip.title), p_patch);
  if exists(select 1 from public.trip_proposals where trip_id = trip.id and status = 'pending') then raise exception 'PROPOSAL_NOT_CONFIRMABLE'; end if;
  select coalesce(max(p.revision), 0) + 1 into next_revision from public.trip_proposals p where p.trip_id = trip.id;
  insert into public.trip_proposals(owner_id, trip_id, revision, base_trip_version, status, patch, expires_at)
    values (trip.owner_id, trip.id, next_revision, trip.head_version, 'pending', p_patch, now() + interval '24 hours') returning * into created;
  return query select created.id, created.revision, created.base_trip_version;
end;
$$;

create or replace function public.cancel_chat_turn(p_turn_id uuid)
returns table(sequence integer, state text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  turn_row public.turns%rowtype;
  prior_sequence integer;
  cancel_sequence integer;
begin
  select * into turn_row from public.turns where id = p_turn_id and owner_id = (select auth.uid()) for update;
  if not found or turn_row.thread_id is null or not exists (
    select 1 from public.chat_threads where id = turn_row.thread_id and owner_id = (select auth.uid()) and status = 'active'
  ) then raise exception 'FORBIDDEN'; end if;
  select e.sequence into cancel_sequence from public.chat_turn_events e where e.turn_id = p_turn_id and e.state = 'cancelled' limit 1;
  if cancel_sequence is not null then return query select cancel_sequence, 'cancelled'::text; return; end if;
  if turn_row.status in ('completed', 'proposal_ready', 'unavailable', 'failed') then raise exception 'terminal turn cannot emit events'; end if;
  select e.sequence into prior_sequence from public.chat_turn_events e where e.turn_id = p_turn_id order by e.sequence desc limit 1;
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (turn_row.owner_id, turn_row.thread_id, p_turn_id, 'cancelled', prior_sequence + 1, 'turn-sse-v1', 'terminal', 'cancelled');
  update public.turns set status = 'cancelled', updated_at = now() where id = p_turn_id;
  update public.chat_threads set updated_at = now() where id = turn_row.thread_id;
  return query select prior_sequence + 1, 'cancelled'::text;
end;
$$;

-- The service-only writer has the same output-column collision. Preserve its grants.
create or replace function public.append_chat_turn_event(p_turn_id uuid, p_event_id text, p_event_type text, p_state text)
returns table(sequence integer, state text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  turn_row public.turns%rowtype;
  prior_sequence integer;
  prior_state text;
  next_sequence integer;
  terminal_states text[] := array['completed', 'proposal_ready', 'unavailable', 'failed', 'cancelled'];
  states text[] := array['accepted', 'planning', 'retrieving', 'generating', 'validating', 'completed', 'proposal_ready', 'unavailable', 'failed', 'cancelled'];
begin
  select * into turn_row from public.turns where id = p_turn_id and owner_id = (select auth.uid()) for update;
  if not found or turn_row.thread_id is null or not exists (
    select 1 from public.chat_threads where id = turn_row.thread_id and owner_id = (select auth.uid()) and status = 'active'
  ) then raise exception 'FORBIDDEN'; end if;
  if turn_row.status = any(terminal_states) then raise exception 'terminal turn cannot emit events'; end if;
  if (p_event_type = 'terminal') <> (p_state = any(terminal_states)) then raise exception 'invalid terminal event'; end if;
  select e.sequence, e.state into prior_sequence, prior_state from public.chat_turn_events e where e.turn_id = p_turn_id order by e.sequence desc limit 1;
  if prior_sequence is null then raise exception 'turn is missing accepted event'; end if;
  if array_position(states, p_state) < array_position(states, prior_state) then raise exception 'turn state must be monotonic'; end if;
  next_sequence := prior_sequence + 1;
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (turn_row.owner_id, turn_row.thread_id, p_turn_id, p_event_id, next_sequence, 'turn-sse-v1', p_event_type, p_state);
  update public.turns set status = p_state, updated_at = now() where id = p_turn_id;
  update public.chat_threads set updated_at = now() where id = turn_row.thread_id;
  return query select next_sequence, p_state;
end;
$$;

-- Name the existing unique constraint without shadowing output variables.
create or replace function public.save_user_profile(
  p_display_name text,
  p_travel_pace text,
  p_locale text,
  p_currency text,
  p_distance_unit text,
  p_temperature_unit text,
  p_default_departure_time time
)
returns table(owner_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(p_display_name), '') is not null and char_length(trim(p_display_name)) not between 1 and 80 then raise exception 'INVALID_PROFILE'; end if;
  if p_travel_pace not in ('relaxed', 'balanced', 'packed') or p_locale not in ('zh', 'en', 'es', 'ru', 'ar') or p_currency not in ('CNY', 'USD', 'EUR', 'RUB', 'SAR') or p_distance_unit not in ('kilometre', 'mile') or p_temperature_unit not in ('celsius', 'fahrenheit') then raise exception 'INVALID_PROFILE'; end if;
  insert into public.user_profiles(owner_id, display_name, travel_pace, locale, currency, distance_unit, temperature_unit, default_departure_time)
    values ((select auth.uid()), nullif(trim(p_display_name), ''), p_travel_pace, p_locale, p_currency, p_distance_unit, p_temperature_unit, p_default_departure_time)
  on conflict on constraint user_profiles_pkey do update set display_name = excluded.display_name, travel_pace = excluded.travel_pace, locale = excluded.locale, currency = excluded.currency, distance_unit = excluded.distance_unit, temperature_unit = excluded.temperature_unit, default_departure_time = excluded.default_departure_time, updated_at = now();
  return query select profile.owner_id, profile.updated_at from public.user_profiles profile where profile.owner_id = (select auth.uid());
end;
$$;

-- Name the existing unique constraint without shadowing output variables.
create or replace function public.request_privacy_action(p_request_id uuid, p_action text)
returns table(request_id uuid, action text, status text, execution_state text, created_at timestamptz, reused boolean)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
declare prior public.privacy_requests%rowtype;
declare inserted_count integer;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_action not in ('export', 'delete') then raise exception 'INVALID_PRIVACY_REQUEST'; end if;
  insert into public.privacy_requests(id, owner_id, action, scope_version, status, execution_state)
    values (p_request_id, (select auth.uid()), p_action, 'all-user-data-v1', 'requested', 'not_started')
    on conflict (id) do nothing;
  get diagnostics inserted_count = row_count;
  select * into prior from public.privacy_requests where id = p_request_id for update;
  if not found or prior.owner_id <> (select auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if prior.action <> p_action then raise exception 'PRIVACY_REQUEST_ID_REUSE'; end if;
  insert into public.privacy_receipts(owner_id, request_id, event_type)
    values ((select auth.uid()), p_request_id, 'requested')
    on conflict on constraint privacy_receipts_request_id_event_type_key do nothing;
  return query select prior.id, prior.action, prior.status, prior.execution_state, prior.created_at, inserted_count = 0;
end;
$$;
