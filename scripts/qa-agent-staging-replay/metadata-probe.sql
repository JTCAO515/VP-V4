begin read only;
set local statement_timeout='10s';
set local lock_timeout='2s';
select jsonb_build_object(
 'session_user',session_user,'current_user',current_user,'database',current_database(),
 'read_only',current_setting('transaction_read_only'),
 'server_version',current_setting('server_version'),
 'tls',(select jsonb_build_object('ssl',ssl,'version',version) from pg_stat_ssl where pid=pg_backend_pid()),
 'can_set_postgres',pg_has_role(current_user,'postgres','SET'),
 'schemas',(select jsonb_agg(nspname order by nspname) from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema'),
 'schema_acl',(select jsonb_agg(jsonb_build_object('schema',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text,'usage',has_schema_privilege(current_user,oid,'USAGE')) order by nspname) from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema'),
 'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls,'login',rolcanlogin,'inherit',rolinherit,'create_role',rolcreaterole) order by rolname) from pg_roles),
 'memberships',(select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin',admin_option,'inherit',inherit_option,'set',set_option) order by roleid,member) from pg_auth_members),
 'default_acl',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'type',defaclobjtype,'acl',defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'select',case when c.relkind='S' then has_sequence_privilege(current_user,c.oid,'SELECT') else has_table_privilege(current_user,c.oid,'SELECT') end) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','S') and n.nspname in ('public','auth','storage','private','identity_private','knowledge_review_private','turn_private','supabase_migrations','community_private','ops_budget_private','place_quota_private','privacy_private','research_intake_private','service_cases_private')),
 'function_acl',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by n.nspname,p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'),
 'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion,'schema',n.nspname,'owner',pg_get_userbyid(extowner)) order by extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'event_triggers',(select jsonb_agg(jsonb_build_object('name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,'tags',e.evttags,'md5',md5(pg_get_functiondef(e.evtfoid))) order by e.evtname) from pg_event_trigger e)
);
rollback;
