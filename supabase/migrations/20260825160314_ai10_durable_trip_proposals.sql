-- AI-10 R1 durable title-patch tracer. Day/block operations remain AI-09 contract fixtures.
create table public.trip_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  revision integer not null check (revision > 0),
  base_trip_version integer not null check (base_trip_version >= 0),
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'expired', 'conflicted', 'superseded')),
  patch jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, revision)
);

create index trip_proposals_owner_pending_idx on public.trip_proposals(owner_id, status);
alter table public.trip_proposals enable row level security;
revoke all on public.trip_proposals from anon;
grant select, insert, update on public.trip_proposals to authenticated;
grant select, insert, update, delete on public.trip_proposals to service_role;
create policy "proposal owner selects" on public.trip_proposals for select to authenticated using ((select auth.uid()) = owner_id);
create policy "proposal owner inserts pending" on public.trip_proposals for insert to authenticated with check ((select auth.uid()) = owner_id and status = 'pending');
create policy "proposal owner resolves own" on public.trip_proposals for update to authenticated using ((select auth.uid()) = owner_id and status = 'pending') with check ((select auth.uid()) = owner_id and status in ('applied', 'expired', 'conflicted', 'rejected'));

create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  resulting_version integer not null check (resulting_version > 0),
  proposal_id uuid not null references public.trip_proposals(id) on delete restrict,
  event_type text not null check (event_type = 'proposal_applied'),
  created_at timestamptz not null default now(),
  unique (trip_id, resulting_version),
  unique (proposal_id)
);

alter table public.trip_events enable row level security;
revoke all on public.trip_events from anon;
grant select, insert on public.trip_events to authenticated;
grant select, insert, delete on public.trip_events to service_role;
create policy "trip event owner selects" on public.trip_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy "trip event owner inserts" on public.trip_events for insert to authenticated with check ((select auth.uid()) = owner_id);

create table public.trip_idempotency (
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  digest text not null check (char_length(digest) between 1 and 160),
  outcome text not null check (outcome in ('applied', 'already_applied')),
  resulting_version integer not null check (resulting_version > 0),
  created_at timestamptz not null default now(),
  primary key (owner_id, idempotency_key)
);

alter table public.trip_idempotency enable row level security;
revoke all on public.trip_idempotency from anon;
grant select, insert on public.trip_idempotency to authenticated;
grant select, insert, delete on public.trip_idempotency to service_role;
create policy "idempotency owner selects" on public.trip_idempotency for select to authenticated using ((select auth.uid()) = owner_id);
create policy "idempotency owner inserts" on public.trip_idempotency for insert to authenticated with check ((select auth.uid()) = owner_id);

create table public.trip_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action = 'proposal_applied'),
  trip_id uuid not null references public.trips(id) on delete cascade,
  proposal_id uuid not null references public.trip_proposals(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.trip_audit_events enable row level security;
revoke all on public.trip_audit_events from anon;
grant select, insert on public.trip_audit_events to authenticated;
grant select, insert, delete on public.trip_audit_events to service_role;
create policy "trip audit owner selects" on public.trip_audit_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy "trip audit owner inserts" on public.trip_audit_events for insert to authenticated with check ((select auth.uid()) = owner_id);

create function public.confirm_and_apply_trip_proposal(
  p_proposal_id uuid,
  p_idempotency_key text,
  p_digest text
)
returns table(outcome text, resulting_version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  proposal public.trip_proposals%rowtype;
  trip public.trips%rowtype;
  previous public.trip_idempotency%rowtype;
  next_title text;
begin
  select * into previous from public.trip_idempotency
    where owner_id = (select auth.uid()) and idempotency_key = p_idempotency_key;
  if found then
    if previous.digest <> p_digest then
      raise exception 'IDEMPOTENCY_KEY_REUSE';
    end if;
    return query select 'already_applied'::text, previous.resulting_version;
    return;
  end if;

  select * into proposal from public.trip_proposals
    where id = p_proposal_id and owner_id = (select auth.uid()) for update;
  if not found or proposal.status <> 'pending' then
    raise exception 'PROPOSAL_NOT_CONFIRMABLE';
  end if;
  if proposal.expires_at <= now() then
    update public.trip_proposals set status = 'expired' where id = proposal.id;
    raise exception 'PROPOSAL_NOT_CONFIRMABLE';
  end if;
  if jsonb_typeof(proposal.patch) <> 'object' or jsonb_typeof(proposal.patch->'title') <> 'string' then
    raise exception 'INVALID_PATCH';
  end if;
  next_title := proposal.patch->>'title';

  select * into trip from public.trips
    where id = proposal.trip_id and owner_id = (select auth.uid()) for update;
  if not found or trip.head_version <> proposal.base_trip_version then
    update public.trip_proposals set status = 'conflicted' where id = proposal.id;
    raise exception 'STALE_TRIP_VERSION';
  end if;

  update public.trips set title = next_title, head_version = head_version + 1, updated_at = now()
    where id = trip.id and head_version = proposal.base_trip_version
    returning * into trip;
  if not found then
    raise exception 'STALE_TRIP_VERSION';
  end if;

  insert into public.trip_events(trip_id, owner_id, resulting_version, proposal_id, event_type)
    values (trip.id, trip.owner_id, trip.head_version, proposal.id, 'proposal_applied');
  update public.trip_proposals set status = 'applied' where id = proposal.id;
  insert into public.trip_idempotency(owner_id, idempotency_key, digest, outcome, resulting_version)
    values (trip.owner_id, p_idempotency_key, p_digest, 'applied', trip.head_version);
  insert into public.trip_audit_events(owner_id, action, trip_id, proposal_id)
    values (trip.owner_id, 'proposal_applied', trip.id, proposal.id);
  return query select 'applied'::text, trip.head_version;
end;
$$;

revoke all on function public.confirm_and_apply_trip_proposal(uuid, text, text) from public;
grant execute on function public.confirm_and_apply_trip_proposal(uuid, text, text) to authenticated;
