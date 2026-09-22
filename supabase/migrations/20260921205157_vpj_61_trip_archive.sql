-- VPJ-61: an owner-confirmed archive receipt, separate from Trip content and services.
-- No backfill from dates, no deletion/cancellation and no preference copying.
create table public.trip_archives (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  archived_version integer not null check (archived_version > 0),
  archived_at timestamptz not null default clock_timestamp(),
  idempotency_key uuid not null,
  unique (owner_id, idempotency_key)
);
alter table public.trip_archives enable row level security;
revoke all on public.trip_archives from public, anon, authenticated;
grant select on public.trip_archives to authenticated;
grant select, delete on public.trip_archives to service_role;
create policy trip_archive_owner_read on public.trip_archives for select to authenticated
  using (owner_id = (select auth.uid()));
create policy native_mobile_access_v2 on public.trip_archives as restrictive to authenticated
  using (identity_private.mobile_access_v2()) with check (identity_private.mobile_access_v2());
create trigger native_mobile_write_v2 before insert or update or delete on public.trip_archives
  for each row execute function identity_private.guard_mobile_write_v2();

-- Existing definer RPC convention: exact owner + mobile epoch gate and a closed ACL.
-- Direct table writes are not granted; this RPC is the only user archive writer.
create function public.archive_trip_v1(p_trip_id uuid, p_expected_version integer, p_idempotency_key uuid, p_confirmed boolean)
returns table(trip_id uuid, archived_version integer, archived_at timestamptz, reused boolean)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  trip public.trips%rowtype;
  previous public.trip_archives%rowtype;
begin
  perform identity_private.guard_mobile_rpc_v2();
  if actor is null then raise exception 'FORBIDDEN'; end if;
  if p_confirmed is distinct from true or p_trip_id is null or p_idempotency_key is null
    or p_expected_version is null or p_expected_version < 1 then raise exception 'INVALID_INPUT'; end if;
  -- Same owner serializes key reuse across Trips; Trip lock serializes with confirm.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trip-archive:' || actor::text, 0));
  select * into trip from public.trips t where t.id=p_trip_id and t.owner_id=actor for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.trip_archives a where a.owner_id=actor and a.idempotency_key=p_idempotency_key;
  if found and (previous.trip_id <> p_trip_id or previous.archived_version <> p_expected_version) then
    raise exception 'IDEMPOTENCY_KEY_REUSE';
  end if;
  select * into previous from public.trip_archives a where a.trip_id=p_trip_id and a.owner_id=actor;
  if found then
    if previous.archived_version <> p_expected_version then raise exception 'STALE_TRIP_VERSION'; end if;
    return query select previous.trip_id, previous.archived_version, previous.archived_at, true;
    return;
  end if;
  if trip.head_version <> p_expected_version then raise exception 'STALE_TRIP_VERSION'; end if;
  if not exists(select 1 from public.trip_events e where e.trip_id=trip.id and e.owner_id=actor
      and e.resulting_version=trip.head_version and e.event_type='proposal_applied')
    or not exists(select 1 from public.trip_version_snapshots s where s.trip_id=trip.id and s.owner_id=actor
      and s.version=trip.head_version) then raise exception 'PROPOSAL_NOT_CONFIRMABLE'; end if;
  insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key)
    values(trip.id,actor,trip.head_version,p_idempotency_key) returning * into previous;
  insert into private.audit_events(actor_id,action,entity_type,entity_id)
    values(actor,'trip_archived','trip',trip.id);
  return query select previous.trip_id, previous.archived_version, previous.archived_at, false;
end $$;
revoke all on function public.archive_trip_v1(uuid,integer,uuid,boolean) from public,anon;
grant execute on function public.archive_trip_v1(uuid,integer,uuid,boolean) to authenticated;

-- Every existing confirmed writer updates the Trip head before changing content.
-- Preserve old RPC signatures and replay behavior, but reject new writes after archive.
create function private.guard_archived_trip_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.title,new.head_version,new.owner_id) is distinct from (old.title,old.head_version,old.owner_id)
    and exists(select 1 from public.trip_archives a where a.trip_id=old.id) then
    raise exception 'PROPOSAL_NOT_CONFIRMABLE';
  end if;
  return new;
end $$;
revoke all on function private.guard_archived_trip_content() from public,anon,authenticated;
create trigger guard_archived_trip_content before update on public.trips
  for each row execute function private.guard_archived_trip_content();
