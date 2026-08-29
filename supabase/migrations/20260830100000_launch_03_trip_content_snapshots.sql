-- LAUNCH-03: durable, owner-scoped current Day/Item projection and full snapshots.
-- Legacy {"title": "..."} proposal patches remain valid while all new changes use
-- the closed { expectedVersion, operations } patch contract.
alter table public.trip_version_snapshots
  add column content jsonb not null default '{"days":[]}'::jsonb,
  add constraint trip_version_snapshots_content_object check (jsonb_typeof(content) = 'object');

create table public.trip_days (
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  day_id text not null check (day_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  trip_date date not null,
  time_zone text,
  primary key (trip_id, day_id),
  unique (trip_id, trip_date),
  check (time_zone is null or time_zone ~ '^[A-Za-z_+-]+/[A-Za-z_+-]+')
);
create index trip_days_owner_trip_date_idx on public.trip_days(owner_id, trip_id, trip_date);
alter table public.trip_days enable row level security;
revoke all on public.trip_days from anon, authenticated;
grant select on public.trip_days to authenticated;
grant select, insert, update, delete on public.trip_days to service_role;
create policy "trip day owner selects" on public.trip_days for select to authenticated using ((select auth.uid()) = owner_id);

create table public.trip_items (
  trip_id uuid not null,
  day_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null check (item_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  starts_at timestamptz,
  ends_at timestamptz,
  primary key (trip_id, item_id),
  foreign key (trip_id, day_id) references public.trip_days(trip_id, day_id) on delete cascade,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index trip_items_owner_trip_day_idx on public.trip_items(owner_id, trip_id, day_id);
alter table public.trip_items enable row level security;
revoke all on public.trip_items from anon, authenticated;
grant select on public.trip_items to authenticated;
grant select, insert, update, delete on public.trip_items to service_role;
create policy "trip item owner selects" on public.trip_items for select to authenticated using ((select auth.uid()) = owner_id);

alter table public.trip_proposals add column rollback_snapshot_version integer;
drop policy "proposal owner inserts pending" on public.trip_proposals;
create policy "proposal owner inserts pending" on public.trip_proposals for insert to authenticated
  with check ((select auth.uid()) = owner_id and status = 'pending' and rollback_snapshot_version is null);
drop policy "proposal owner resolves own" on public.trip_proposals;
create policy "proposal owner resolves own" on public.trip_proposals for update to authenticated
  using ((select auth.uid()) = owner_id and status = 'pending')
  with check ((select auth.uid()) = owner_id and status in ('applied', 'expired', 'conflicted', 'rejected', 'superseded') and rollback_snapshot_version is null);

create function public.trip_content_snapshot(p_trip_id uuid, p_title text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('title', p_title, 'days', coalesce(jsonb_agg(day_value order by trip_date, day_id), '[]'::jsonb))
  from (
    select d.trip_date, d.day_id,
      jsonb_build_object('id', d.day_id, 'date', to_char(d.trip_date, 'YYYY-MM-DD')) ||
      case when d.time_zone is null then '{}'::jsonb else jsonb_build_object('timeZone', d.time_zone) end ||
      jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('id', i.item_id, 'dayId', i.day_id, 'title', i.title) || case when i.starts_at is null then '{}'::jsonb else jsonb_build_object('startsAt', to_char(i.starts_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')) end || case when i.ends_at is null then '{}'::jsonb else jsonb_build_object('endsAt', to_char(i.ends_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')) end order by i.item_id) from public.trip_items i where i.trip_id = d.trip_id and i.day_id = d.day_id), '[]'::jsonb)) as day_value
    from public.trip_days d where d.trip_id = p_trip_id
  ) days;
$$;

create function public.apply_trip_content_patch(p_current jsonb, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
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
    if jsonb_object_length(p_patch) <> 1 or jsonb_typeof(p_patch->'title') <> 'string' or char_length(btrim(p_patch->>'title')) not between 1 and 160 then raise exception 'INVALID_PATCH'; end if;
    return jsonb_set(next_content, '{title}', to_jsonb(btrim(p_patch->>'title')));
  end if;
  if jsonb_typeof(p_patch) <> 'object' or jsonb_object_length(p_patch) <> 2 or jsonb_typeof(p_patch->'expectedVersion') <> 'number' or p_patch->>'expectedVersion' !~ '^\d{1,9}$' or jsonb_typeof(p_patch->'operations') <> 'array' or jsonb_array_length(p_patch->'operations') = 0 then raise exception 'INVALID_PATCH'; end if;
  for operation in select value from jsonb_array_elements(p_patch->'operations') loop
    if jsonb_typeof(operation) <> 'object' or jsonb_typeof(operation->'kind') <> 'string' then raise exception 'INVALID_PATCH'; end if;
    op_kind := operation->>'kind';
    if op_kind = 'set_title' then
      if jsonb_object_length(operation) <> 2 or jsonb_typeof(operation->'title') <> 'string' or char_length(btrim(operation->>'title')) not between 1 and 160 then raise exception 'INVALID_PATCH'; end if;
      next_content := jsonb_set(next_content, '{title}', to_jsonb(btrim(operation->>'title')));
    elsif op_kind = 'upsert_day' then
      if jsonb_object_length(operation) not between 3 and 4 or exists(select 1 from jsonb_object_keys(operation) key where key not in ('kind', 'dayId', 'date', 'timeZone')) or not (operation ? 'dayId' and operation ? 'date') or jsonb_typeof(operation->'dayId') <> 'string' or jsonb_typeof(operation->'date') <> 'string' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or operation->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_PATCH'; end if;
      begin op_date := (operation->>'date')::date; exception when others then raise exception 'INVALID_PATCH'; end;
      op_day_id := operation->>'dayId'; op_timezone := operation->>'timeZone';
      if (operation ? 'timeZone' and (jsonb_typeof(operation->'timeZone') <> 'string' or not exists(select 1 from pg_timezone_names where name = op_timezone))) then raise exception 'INVALID_PATCH'; end if;
      select coalesce(jsonb_agg(value), '[]'::jsonb) into next_days from jsonb_array_elements(next_content->'days') where value->>'id' <> op_day_id;
      next_days := next_days || jsonb_build_array(jsonb_build_object('id', op_day_id, 'date', to_char(op_date, 'YYYY-MM-DD'), 'items', coalesce((select value->'items' from jsonb_array_elements(next_content->'days') where value->>'id' = op_day_id), '[]'::jsonb)) || case when op_timezone is null then '{}'::jsonb else jsonb_build_object('timeZone', op_timezone) end);
      next_content := jsonb_set(next_content, '{days}', next_days);
    elsif op_kind = 'delete_day' then
      if jsonb_object_length(operation) <> 2 or jsonb_typeof(operation->'dayId') <> 'string' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or not exists(select 1 from jsonb_array_elements(next_content->'days') where value->>'id' = operation->>'dayId') then raise exception 'INVALID_PATCH'; end if;
      select coalesce(jsonb_agg(value), '[]'::jsonb) into next_days from jsonb_array_elements(next_content->'days') where value->>'id' <> operation->>'dayId';
      next_content := jsonb_set(next_content, '{days}', next_days);
    elsif op_kind = 'upsert_item' then
      if jsonb_object_length(operation) not between 4 and 6 or exists(select 1 from jsonb_object_keys(operation) key where key not in ('kind', 'itemId', 'dayId', 'title', 'startsAt', 'endsAt')) or not (operation ? 'itemId' and operation ? 'dayId' and operation ? 'title') or jsonb_typeof(operation->'itemId') <> 'string' or jsonb_typeof(operation->'dayId') <> 'string' or jsonb_typeof(operation->'title') <> 'string' or operation->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or char_length(btrim(operation->>'title')) not between 1 and 160 then raise exception 'INVALID_PATCH'; end if;
      if not exists(select 1 from jsonb_array_elements(next_content->'days') where value->>'id' = operation->>'dayId') then raise exception 'INVALID_PATCH'; end if;
      begin op_starts := nullif(operation->>'startsAt', '')::timestamptz; op_ends := nullif(operation->>'endsAt', '')::timestamptz; exception when others then raise exception 'INVALID_PATCH'; end;
      if (operation ? 'startsAt' and (jsonb_typeof(operation->'startsAt') <> 'string' or operation->>'startsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$')) or (operation ? 'endsAt' and (jsonb_typeof(operation->'endsAt') <> 'string' or operation->>'endsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$')) or (op_starts is not null and op_ends is not null and op_ends <= op_starts) then raise exception 'INVALID_PATCH'; end if;
      op_day_id := operation->>'dayId'; op_item_id := operation->>'itemId'; op_title := btrim(operation->>'title');
      select coalesce(jsonb_agg(case when value->>'id' = op_day_id then jsonb_set(value, '{items}', (select coalesce(jsonb_agg(candidate), '[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', op_item_id, 'dayId', op_day_id, 'title', op_title) || case when operation ? 'startsAt' then jsonb_build_object('startsAt', operation->'startsAt') else '{}'::jsonb end || case when operation ? 'endsAt' then jsonb_build_object('endsAt', operation->'endsAt') else '{}'::jsonb end) from jsonb_array_elements(value->'items') candidate where candidate->>'id' <> op_item_id)) else value end), '[]'::jsonb) into next_days from jsonb_array_elements(next_content->'days');
      next_content := jsonb_set(next_content, '{days}', next_days);
    elsif op_kind = 'delete_item' then
      if jsonb_object_length(operation) <> 3 or jsonb_typeof(operation->'itemId') <> 'string' or jsonb_typeof(operation->'dayId') <> 'string' or operation->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' or operation->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or not exists(select 1 from jsonb_array_elements(next_content->'days') day, jsonb_array_elements(day.value->'items') candidate where day.value->>'id' = operation->>'dayId' and candidate->>'id' = operation->>'itemId') then raise exception 'INVALID_PATCH'; end if;
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

create or replace function public.confirm_and_apply_trip_proposal(p_proposal_id uuid, p_idempotency_key text, p_digest text)
returns table(outcome text, resulting_version integer) language plpgsql security definer set search_path = public as $$
declare proposal public.trip_proposals%rowtype; trip public.trips%rowtype; previous public.trip_idempotency%rowtype; target public.trip_version_snapshots%rowtype; next_content jsonb; next_title text; next_version integer;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.trip_idempotency where owner_id = (select auth.uid()) and idempotency_key = p_idempotency_key;
  if found then if previous.digest <> p_digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if; return query select 'already_applied'::text, previous.resulting_version; return; end if;
  select * into proposal from public.trip_proposals where id = p_proposal_id and owner_id = (select auth.uid()) for update;
  if not found or proposal.status <> 'pending' then return query select 'proposal_not_confirmable'::text, null::integer; return; end if;
  if proposal.expires_at <= now() then update public.trip_proposals set status = 'expired' where id = proposal.id; return query select 'proposal_expired'::text, null::integer; return; end if;
  select * into trip from public.trips where id = proposal.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> proposal.base_trip_version then update public.trip_proposals set status = 'conflicted' where id = proposal.id; return query select 'version_conflict'::text, null::integer; return; end if;
  if proposal.rollback_snapshot_version is not null then
    select * into target from public.trip_version_snapshots where trip_id = trip.id and owner_id = trip.owner_id and version = proposal.rollback_snapshot_version;
    if not found then raise exception 'ROLLBACK_NOT_AVAILABLE'; end if;
    next_content := target.content;
  else
    if proposal.patch ? 'operations' and ((proposal.patch->>'expectedVersion') !~ '^\d{1,9}$' or (proposal.patch->>'expectedVersion')::integer <> proposal.base_trip_version) then raise exception 'INVALID_PATCH'; end if;
    next_content := public.apply_trip_content_patch(public.trip_content_snapshot(trip.id, trip.title), proposal.patch);
  end if;
  next_title := next_content->>'title'; next_version := trip.head_version + 1;
  update public.trips set title = next_title, head_version = next_version, updated_at = now() where id = trip.id and head_version = proposal.base_trip_version;
  delete from public.trip_days where trip_id = trip.id;
  insert into public.trip_days(trip_id, owner_id, day_id, trip_date, time_zone) select trip.id, trip.owner_id, value->>'id', (value->>'date')::date, value->>'timeZone' from jsonb_array_elements(next_content->'days');
  insert into public.trip_items(trip_id, day_id, owner_id, item_id, title, starts_at, ends_at) select trip.id, day.value->>'id', trip.owner_id, item.value->>'id', item.value->>'title', nullif(item.value->>'startsAt', '')::timestamptz, nullif(item.value->>'endsAt', '')::timestamptz from jsonb_array_elements(next_content->'days') day, jsonb_array_elements(day.value->'items') item;
  insert into public.trip_version_snapshots(trip_id, owner_id, version, title, content) values (trip.id, trip.owner_id, next_version, next_title, next_content);
  insert into public.trip_events(trip_id, owner_id, resulting_version, proposal_id, event_type) values (trip.id, trip.owner_id, next_version, proposal.id, 'proposal_applied');
  update public.trip_proposals set status = 'applied' where id = proposal.id;
  insert into public.trip_idempotency(owner_id, idempotency_key, digest, outcome, resulting_version) values (trip.owner_id, p_idempotency_key, p_digest, 'applied', next_version);
  insert into public.trip_audit_events(owner_id, action, trip_id, proposal_id) values (trip.owner_id, 'proposal_applied', trip.id, proposal.id);
  return query select 'applied'::text, next_version;
end;
$$;

-- Preserve the legacy title-only initial snapshot content and the append-only rollback rule.
update public.trip_version_snapshots set content = jsonb_build_object('title', title, 'days', '[]'::jsonb) where content = '{"days":[]}'::jsonb;
create or replace function public.capture_initial_trip_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_version_snapshots(trip_id, owner_id, version, title, content)
    values (new.id, new.owner_id, new.head_version, new.title, jsonb_build_object('title', new.title, 'days', '[]'::jsonb));
  return new;
end;
$$;
create or replace function public.create_trip_rollback_proposal(p_trip_id uuid, p_target_version integer)
returns table(proposal_id uuid, base_trip_version integer, target_version integer) language plpgsql security definer set search_path = public as $$
declare trip public.trips%rowtype; target public.trip_version_snapshots%rowtype; next_revision integer; created public.trip_proposals%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into trip from public.trips where id = p_trip_id and owner_id = (select auth.uid()) for update;
  if not found or p_target_version < 0 or p_target_version >= trip.head_version then raise exception 'ROLLBACK_NOT_AVAILABLE'; end if;
  select * into target from public.trip_version_snapshots where trip_id = trip.id and owner_id = trip.owner_id and version = p_target_version;
  if not found then raise exception 'ROLLBACK_NOT_AVAILABLE'; end if;
  select coalesce(max(revision), 0) + 1 into next_revision from public.trip_proposals where trip_id = trip.id;
  insert into public.trip_proposals(owner_id, trip_id, revision, base_trip_version, status, patch, expires_at, rollback_snapshot_version)
    values (trip.owner_id, trip.id, next_revision, trip.head_version, 'pending', jsonb_build_object('title', target.title), now() + interval '24 hours', target.version)
    returning * into created;
  return query select created.id, trip.head_version, p_target_version;
end;
$$;

revoke all on function public.trip_content_snapshot(uuid, text) from public;
revoke all on function public.apply_trip_content_patch(jsonb, jsonb) from public;
revoke all on function public.capture_initial_trip_version() from public;
revoke all on function public.confirm_and_apply_trip_proposal(uuid, text, text) from public;
grant execute on function public.confirm_and_apply_trip_proposal(uuid, text, text) to authenticated;
revoke all on function public.create_trip_rollback_proposal(uuid, integer) from public;
grant execute on function public.create_trip_rollback_proposal(uuid, integer) to authenticated;
