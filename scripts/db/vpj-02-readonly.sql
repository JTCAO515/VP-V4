-- VPJ-02: metadata-only inventory for the explicitly selected Staging project.
-- Invoke with: supabase db query --linked --file scripts/db/vpj-02-readonly.sql --output-format json
-- No account identities, credentials, user content, DDL or mutations are read or written.
begin read only;
select jsonb_build_object(
  'authAccountCount', (select count(*) from auth.users),
  'tripCount', (select count(*) from public.trips),
  'migrations', (select jsonb_agg(jsonb_build_object('version', version, 'name', name) order by version)
                 from supabase_migrations.schema_migrations),
  'tables', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname, 'rlsEnabled', c.relrowsecurity)
                            order by n.nspname, c.relname)
               from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where c.relkind='r' and n.nspname in ('public','private')),
  'authenticatedDirectTripUpdateGranted', has_table_privilege('authenticated','public.trips','UPDATE')
) as inventory;
rollback;
