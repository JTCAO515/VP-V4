-- VPJ-19 slice (#363): give canonical_pois real identity fields and a
-- provider-ID mapping table. canonical_pois stayed intentionally opaque in
-- v4.11 ("no provider geometry or inferred POI identity"); this slice fills
-- that in for the first time, with no auto-merge and explicit unknowns.

alter table public.canonical_pois
  add column primary_name_zh text,
  add column primary_name_en text,
  add column name_pinyin text,
  add column category text check (category in ('airport_terminal', 'station_exit', 'scenic_entrance', 'business_branch', 'other')),
  add column parent_poi_id uuid references public.canonical_pois(id) on delete restrict,
  add column entrance_lat double precision,
  add column entrance_lng double precision,
  add column coordinate_system text check (coordinate_system in ('gcj02', 'wgs84', 'unknown')),
  add column entrance_source text check (entrance_source in ('provider_geocode', 'operator_verified', 'unknown')),
  add constraint canonical_pois_names_required check (primary_name_zh is not null and char_length(btrim(primary_name_zh)) between 1 and 160 and primary_name_en is not null and char_length(btrim(primary_name_en)) between 1 and 160),
  add constraint canonical_pois_entrance_pair check ((entrance_lat is null and entrance_lng is null and coordinate_system is null and entrance_source = 'unknown') or (entrance_lat is not null and entrance_lng is not null and coordinate_system is not null and coordinate_system <> 'unknown' and entrance_source is not null and entrance_source <> 'unknown')),
  alter column entrance_source set default 'unknown';

create index canonical_pois_parent_idx on public.canonical_pois(parent_poi_id) where parent_poi_id is not null;

-- Multiple provider POI ids can map to one canonical place (search-result
-- dedupe target); a canonical place can have at most one mapping per
-- provider. Never the reverse (one provider id -> many canonicals) --
-- that would be an ambiguous merge, which this slice forbids.
create table public.provider_poi_mappings (
  id uuid primary key default gen_random_uuid(),
  canonical_poi_id uuid not null references public.canonical_pois(id) on delete cascade,
  provider text not null check (provider in ('amap', 'tencent')),
  provider_poi_id text not null check (char_length(provider_poi_id) between 1 and 128),
  raw_name text not null check (char_length(btrim(raw_name)) between 1 and 200),
  matched_at timestamptz not null default now(),
  unique (canonical_poi_id, provider),
  unique (provider, provider_poi_id)
);

alter table public.provider_poi_mappings enable row level security;
revoke all on public.provider_poi_mappings from anon, authenticated;
grant select, insert, update, delete on public.provider_poi_mappings to service_role;
