-- AI-46 local-only PLAT-CONF-00 probe surface. It contains no product data.
create schema if not exists private;

create table public.connection_probe_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  label text not null check (char_length(label) <= 80)
);

alter table public.connection_probe_resources enable row level security;
revoke all on public.connection_probe_resources from anon;
grant select, insert on public.connection_probe_resources to authenticated;

create policy "probe owner reads own row"
on public.connection_probe_resources for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "probe owner inserts own row"
on public.connection_probe_resources for insert to authenticated
with check ((select auth.uid()) = owner_id);

create function private.connection_probe_worker_count()
returns integer
language sql
security invoker
set search_path = private, public
as $$ select count(*)::integer from public.connection_probe_resources $$;

revoke all on function private.connection_probe_worker_count() from public;
grant usage on schema private to service_role;
grant execute on function private.connection_probe_worker_count() to service_role;
