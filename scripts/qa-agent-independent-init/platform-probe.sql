-- CONTENT-FREE READ ONLY. No roles passwords/JWT/user values; no DDL/grants.
select jsonb_build_object(
 'engine',jsonb_build_object('versionNumber',current_setting('server_version_num'),'encoding',current_setting('server_encoding')),
 'functions',(select coalesce(jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('sourceMd5',md5(p.prosrc),
  'result',pg_get_function_result(p.oid),'language',l.lanname,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
  'config',p.proconfig,'owner',pg_get_userbyid(p.proowner))),'{}') from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='auth'),
 'roles',(select coalesce(jsonb_object_agg(rolname,jsonb_build_object('superuser',rolsuper,'login',rolcanlogin,'bypassRls',rolbypassrls)),'{}') from pg_roles where rolname in('anon','authenticated','service_role')),
 'authColumns',(select coalesce(jsonb_object_agg(name,cols),'{}') from(select n.nspname||'.'||c.relname name,
   jsonb_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||case when a.attnotnull then 'true' else 'false' end order by a.attnum) cols
  from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  where n.nspname='auth' and c.relkind in('r','p','v','m') group by n.nspname,c.relname)q));
