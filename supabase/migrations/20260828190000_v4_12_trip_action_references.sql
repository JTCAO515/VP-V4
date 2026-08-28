-- V4-12: owner-scoped action projections. Service workflows may attach verified Trip/artifact references;
-- authenticated users can read their projection but cannot create orders, payments, inventory or action facts.
create table public.trip_action_references (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action_kind text not null check (action_kind in ('user_ticket', 'reservation', 'official_handoff', 'preparation')),
  source_kind text not null check (source_kind = 'trip'),
  action_status text not null check (action_status in ('current', 'recheck_required', 'unavailable')),
  label text not null check (char_length(btrim(label)) between 1 and 160),
  external_link_url text null check (external_link_url is null or external_link_url ~ '^https://'),
  created_at timestamptz not null default now()
);

create index trip_action_references_trip_created_idx on public.trip_action_references(trip_id, created_at);
alter table public.trip_action_references enable row level security;
revoke all on public.trip_action_references from anon, authenticated;
grant select on public.trip_action_references to authenticated;
grant select, insert, update, delete on public.trip_action_references to service_role;
create policy "trip action reference owner selects" on public.trip_action_references for select to authenticated using ((select auth.uid()) = owner_id);
