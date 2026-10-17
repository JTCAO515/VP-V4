-- REQUEST ONLY: added object scope has not been authorized or executed.
BEGIN READ ONLY;
WITH roles AS (
 SELECT names.name,r.oid,r.rolsuper,r.rolinherit,r.rolbypassrls,r.rolcanlogin
 FROM (VALUES ('postgres'),('anon'),('authenticated'),('service_role')) names(name)
 LEFT JOIN pg_catalog.pg_roles r ON r.rolname=names.name
), functions AS (
 SELECT w.ns,w.name,p.oid,p.proowner,p.prosecdef,p.proconfig,p.prosrc,p.proacl
 FROM (VALUES ('public','claim_turn_work',''),('turn_private','lock_text_work','uuid, uuid'),('turn_private','bound_task_history',''),('turn_private','task_history','uuid')) w(ns,name,input_types)
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=w.ns
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=w.name AND pg_catalog.oidvectortypes(p.proargtypes)=w.input_types
)
SELECT jsonb_build_object(
 'readOnly',current_setting('transaction_read_only'),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',r.name,'exists',r.oid IS NOT NULL,'superuser',r.rolsuper,'inherit',r.rolinherit,'bypassRls',r.rolbypassrls,'canLogin',r.rolcanlogin) ORDER BY r.name) FROM roles r),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',f.ns||'.'||f.name,'exists',f.oid IS NOT NULL,'signature',pg_catalog.pg_get_function_identity_arguments(f.oid),'owner',pg_catalog.pg_get_userbyid(f.proowner),'securityDefiner',f.prosecdef,'searchPath',(SELECT jsonb_agg(x) FROM unnest(f.proconfig) x WHERE x LIKE 'search_path=%'),'bodyHash',encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),'acl',f.proacl::text,'effectiveExecute',(SELECT jsonb_object_agg(r.name,CASE WHEN r.oid IS NULL OR f.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE') END) FROM roles r)) ORDER BY f.ns,f.name,pg_catalog.pg_get_function_identity_arguments(f.oid)) FROM functions f),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('name',w.name,'exists',n.oid IS NOT NULL,'owner',pg_catalog.pg_get_userbyid(n.nspowner),'acl',n.nspacl::text,'effectivePrivileges',(SELECT jsonb_object_agg(r.name,jsonb_build_object('usage',CASE WHEN n.oid IS NULL OR r.oid IS NULL THEN NULL ELSE pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') END,'create',CASE WHEN n.oid IS NULL OR r.oid IS NULL THEN NULL ELSE pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') END)) FROM roles r)) ORDER BY w.name) FROM (VALUES ('public'),('turn_private'),('identity_private'),('auth')) w(name) LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=w.name),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,'name',t.tgname,'enabled',t.tgenabled,'function',fn.nspname||'.'||f.proname,'signature',pg_catalog.pg_get_function_identity_arguments(f.oid),'definitionHash',encode(sha256(convert_to(pg_catalog.pg_get_triggerdef(t.oid),'UTF8')),'hex')) ORDER BY c.relname,t.tgname) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid JOIN pg_catalog.pg_namespace fn ON fn.oid=f.pronamespace WHERE n.nspname='turn_private' AND c.relname IN ('service_task_turns','text_content') AND NOT t.tgisinternal)
) AS metadata;
ROLLBACK;
