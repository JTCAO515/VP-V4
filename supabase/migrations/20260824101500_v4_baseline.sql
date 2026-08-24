-- AI-08 V4 lineage marker. Domain tables and RLS are owned by later issues.
create table if not exists public.v4_migration_baseline (
  id boolean primary key default true check (id),
  created_at timestamptz not null default now()
);
revoke all on public.v4_migration_baseline from anon, authenticated;
