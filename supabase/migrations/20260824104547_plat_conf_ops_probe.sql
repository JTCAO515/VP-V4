create policy "probe ops reads scoped rows"
on public.connection_probe_resources for select to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'ops_probe');

create function public.connection_probe_ops_visible_count()
returns integer
language sql
security invoker
set search_path = public
as $$ select count(*)::integer from public.connection_probe_resources $$;

revoke all on function public.connection_probe_ops_visible_count() from public;
grant execute on function public.connection_probe_ops_visible_count() to authenticated;
