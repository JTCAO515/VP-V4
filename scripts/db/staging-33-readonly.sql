-- Metadata only. Explicit project-ref must first match the uniquely selected VP - V4/Singapore Staging.
-- No user rows, function source, credentials, statements or database connection details are returned.
begin read only;
select jsonb_build_object(
  'authAccountCount',(select count(*) from auth.users),
  'tripCount',(select count(*) from public.trips),
  'migrations',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations),
  'authenticatedPublicDefiners',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'sourceMd5',md5(p.prosrc),'returnType',p.prorettype::regtype::text,'language',(select lanname from pg_language where oid=p.prolang),'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE'),'acl',p.proacl::text) order by p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE')),
  'authenticatedTripUpdate',has_table_privilege('authenticated','public.trips','UPDATE'),
  'nativeSessionTablePresent',to_regclass('identity_private.mobile_accounts') is not null,
  'textPolicyTablePresent',to_regclass('turn_private.text_policies') is not null,
  'budgetStopPresent',to_regprocedure('public.stop_model_budget(uuid,uuid)') is not null,
  'opsSnapshotPresent',to_regprocedure('public.read_ops_budget_scope_v1(uuid)') is not null
) as inventory;
rollback;
