-- AI-14: minimal durable actor/RLS probe schema. No public Explore or model route is created.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  head_version integer not null default 0 check (head_version >= 0),
  title text not null check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trips_owner_id_idx on public.trips(owner_id);
alter table public.trips enable row level security;
revoke all on public.trips from anon;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trips to service_role;

create policy "trip owner selects"
on public.trips for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "trip owner inserts"
on public.trips for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy "trip owner updates"
on public.trips for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
create policy "trip owner deletes"
on public.trips for delete to authenticated
using ((select auth.uid()) = owner_id);

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  status text not null check (status in ('accepted', 'completed', 'unavailable', 'failed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index turns_owner_id_idx on public.turns(owner_id);
alter table public.turns enable row level security;
revoke all on public.turns from anon;
grant select, insert on public.turns to authenticated;
grant select, insert, delete on public.turns to service_role;

create policy "turn owner selects"
on public.turns for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "turn owner inserts"
on public.turns for insert to authenticated
with check ((select auth.uid()) = owner_id);

create table public.fact_records (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('candidate', 'draft', 'reviewed', 'deprecated')),
  expires_at timestamptz not null,
  licence_allowed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.fact_records enable row level security;
revoke all on public.fact_records from anon, authenticated;
grant select, insert, update, delete on public.fact_records to service_role;

create table private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

alter table private.audit_events enable row level security;
revoke all on private.audit_events from public, anon, authenticated;
grant select, insert on private.audit_events to service_role;

create function private.ai14_fault_probe(p_owner_id uuid, p_fail boolean)
returns void
language plpgsql
security invoker
set search_path = private, public
as $$
declare
  created_trip_id uuid;
begin
  insert into public.trips(owner_id, title) values (p_owner_id, 'AI-14 fault probe') returning id into created_trip_id;
  insert into public.turns(owner_id, trip_id, status) values (p_owner_id, created_trip_id, 'accepted');
  if p_fail then
    raise exception 'AI14_FAULT_PROBE';
  end if;
  insert into private.audit_events(actor_id, action, entity_type, entity_id)
    values (p_owner_id, 'fault_probe_committed', 'trip', created_trip_id);
end;
$$;

revoke all on function private.ai14_fault_probe(uuid, boolean) from public;
grant execute on function private.ai14_fault_probe(uuid, boolean) to service_role;
