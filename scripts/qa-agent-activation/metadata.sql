-- READ ONLY. Execute ONLY through official Go2China link
-- link_6acdbe0471c081919ff47de24ca53b0f; project ONLY from the current shared operator target package, dzqdzetcctkhbrhlxxgn.
-- Run post-upgrade query only AFTER all155 reviewed migrations; no target upgrade is performed here.
-- Project identity comes from the connector invocation, not current_database().
-- No text, credentials, consent creation, DDL or DML.
select
 clock_timestamp() as observed_at,
 jsonb_build_object('signature','public.qa_ready_groups_v2(integer,text,text,text)',
  'serviceRoleExecute',coalesce(has_function_privilege('service_role',to_regprocedure('public.qa_ready_groups_v2(integer,text,text,text)'),'EXECUTE'),false),
  'anonExecute',coalesce(has_function_privilege('anon',to_regprocedure('public.qa_ready_groups_v2(integer,text,text,text)'),'EXECUTE'),false),
  'authenticatedExecute',coalesce(has_function_privilege('authenticated',to_regprocedure('public.qa_ready_groups_v2(integer,text,text,text)'),'EXECUTE'),false),
  'publicExecute',exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid=to_regprocedure('public.qa_ready_groups_v2(integer,text,text,text)') and a.grantee=0 and a.privilege_type='EXECUTE')) as qa_ready_groups_acl,
 (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations) as migrations,
 to_regnamespace('turn_data_private') is not null as turn_data_private_present,
 (select jsonb_agg(p.oid::regprocedure::text order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'qa_%') as qa_rpc_signatures,
 (select jsonb_agg(id order by id) from turn_private.text_policies) as existing_policy_ids,
 (select jsonb_agg(notice_version order by id) from turn_private.text_policies) as existing_notice_versions,
 (select jsonb_agg(notice_hash order by id) from turn_private.text_policies) as existing_notice_hashes,
 (select jsonb_agg(id order by id) from public.model_budget_scopes) as existing_scope_ids,
 (select count(*) from turn_private.text_policies where revoked_at is null and effective_at<=now() and expires_at>now() and terms_recheck_at>now()) as currently_effective_policies,
 (select count(*) from public.model_budget_scopes where enabled and not frozen and expires_at>now()) as currently_usable_scopes;
