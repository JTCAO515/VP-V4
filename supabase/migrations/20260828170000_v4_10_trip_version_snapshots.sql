-- V4-10: owner-scoped, append-only title snapshots enable rollback as a new Proposal.
create table public.trip_version_snapshots (
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version >= 0),
  title text not null check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key (trip_id, version)
);

alter table public.trip_version_snapshots enable row level security;
revoke all on public.trip_version_snapshots from anon, authenticated;
grant select on public.trip_version_snapshots to authenticated;
grant select, insert, delete on public.trip_version_snapshots to service_role;
create policy "trip version snapshot owner selects" on public.trip_version_snapshots
  for select to authenticated using ((select auth.uid()) = owner_id);

create function public.capture_initial_trip_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_version_snapshots(trip_id, owner_id, version, title)
    values (new.id, new.owner_id, new.head_version, new.title);
  return new;
end;
$$;

create trigger capture_initial_trip_version
after insert on public.trips
for each row execute function public.capture_initial_trip_version();

-- Existing rows cannot yield historic titles that were never stored. Preserve only
-- their known current state and never claim unavailable historical rollback targets.
insert into public.trip_version_snapshots(trip_id, owner_id, version, title, created_at)
  select id, owner_id, head_version, title, updated_at from public.trips
  on conflict (trip_id, version) do nothing;

create or replace function public.confirm_and_apply_trip_proposal(
  p_proposal_id uuid,
  p_idempotency_key text,
  p_digest text
)
returns table(outcome text, resulting_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.trip_proposals%rowtype;
  trip public.trips%rowtype;
  previous public.trip_idempotency%rowtype;
  next_title text;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.trip_idempotency where owner_id = (select auth.uid()) and idempotency_key = p_idempotency_key;
  if found then
    if previous.digest <> p_digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return query select 'already_applied'::text, previous.resulting_version;
    return;
  end if;
  select * into proposal from public.trip_proposals where id = p_proposal_id and owner_id = (select auth.uid()) for update;
  if not found or proposal.status <> 'pending' then return query select 'proposal_not_confirmable'::text, null::integer; return; end if;
  if proposal.expires_at <= now() then update public.trip_proposals set status = 'expired' where id = proposal.id; return query select 'proposal_expired'::text, null::integer; return; end if;
  if jsonb_typeof(proposal.patch) <> 'object' or jsonb_typeof(proposal.patch->'title') <> 'string' then return query select 'invalid_patch'::text, null::integer; return; end if;
  next_title := proposal.patch->>'title';
  select * into trip from public.trips where id = proposal.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> proposal.base_trip_version then update public.trip_proposals set status = 'conflicted' where id = proposal.id; return query select 'version_conflict'::text, null::integer; return; end if;
  update public.trips set title = next_title, head_version = head_version + 1, updated_at = now() where id = trip.id and head_version = proposal.base_trip_version returning * into trip;
  if not found then return query select 'version_conflict'::text, null::integer; return; end if;
  insert into public.trip_version_snapshots(trip_id, owner_id, version, title) values (trip.id, trip.owner_id, trip.head_version, trip.title);
  insert into public.trip_events(trip_id, owner_id, resulting_version, proposal_id, event_type) values (trip.id, trip.owner_id, trip.head_version, proposal.id, 'proposal_applied');
  update public.trip_proposals set status = 'applied' where id = proposal.id;
  insert into public.trip_idempotency(owner_id, idempotency_key, digest, outcome, resulting_version) values (trip.owner_id, p_idempotency_key, p_digest, 'applied', trip.head_version);
  insert into public.trip_audit_events(owner_id, action, trip_id, proposal_id) values (trip.owner_id, 'proposal_applied', trip.id, proposal.id);
  return query select 'applied'::text, trip.head_version;
end;
$$;

create function public.create_trip_rollback_proposal(p_trip_id uuid, p_target_version integer)
returns table(proposal_id uuid, base_trip_version integer, target_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  trip public.trips%rowtype;
  target public.trip_version_snapshots%rowtype;
  next_revision integer;
  created public.trip_proposals%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into trip from public.trips where id = p_trip_id and owner_id = (select auth.uid()) for update;
  if not found or p_target_version < 0 or p_target_version >= trip.head_version then raise exception 'ROLLBACK_NOT_AVAILABLE'; end if;
  select * into target from public.trip_version_snapshots where trip_id = trip.id and owner_id = trip.owner_id and version = p_target_version;
  if not found then raise exception 'ROLLBACK_NOT_AVAILABLE'; end if;
  select coalesce(max(revision), 0) + 1 into next_revision from public.trip_proposals where trip_id = trip.id;
  insert into public.trip_proposals(owner_id, trip_id, revision, base_trip_version, status, patch, expires_at)
    values (trip.owner_id, trip.id, next_revision, trip.head_version, 'pending', jsonb_build_object('title', target.title), now() + interval '24 hours')
    returning * into created;
  return query select created.id, trip.head_version, p_target_version;
end;
$$;

revoke all on function public.capture_initial_trip_version() from public;
revoke all on function public.confirm_and_apply_trip_proposal(uuid, text, text) from public;
grant execute on function public.confirm_and_apply_trip_proposal(uuid, text, text) to authenticated;
revoke all on function public.create_trip_rollback_proposal(uuid, integer) from public;
grant execute on function public.create_trip_rollback_proposal(uuid, integer) to authenticated;

revoke update on public.trips from authenticated;
drop policy "trip owner updates" on public.trips;
