-- V4-11: opaque exact place references; no provider geometry or inferred POI identity.
create table public.canonical_pois (
  id uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.canonical_pois enable row level security;
revoke all on public.canonical_pois from anon, authenticated;
grant select, insert, update, delete on public.canonical_pois to service_role;

create table public.trip_place_references (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reference_kind text not null check (reference_kind in ('canonical', 'user')),
  canonical_poi_id uuid references public.canonical_pois(id) on delete restrict,
  user_label text,
  freshness text not null default 'current' check (freshness in ('current', 'recheck_required')),
  created_at timestamptz not null default now(),
  check ((reference_kind = 'canonical' and canonical_poi_id is not null and user_label is null) or (reference_kind = 'user' and canonical_poi_id is null and char_length(btrim(user_label)) between 1 and 160))
);

create index trip_place_references_trip_created_idx on public.trip_place_references(trip_id, created_at);
alter table public.trip_place_references enable row level security;
revoke all on public.trip_place_references from anon;
grant select on public.trip_place_references to authenticated;
grant select, insert, delete on public.trip_place_references to service_role;
create policy "trip place reference owner selects" on public.trip_place_references for select to authenticated using ((select auth.uid()) = owner_id);
