BEGIN READ ONLY;
SELECT jsonb_build_object(
 'dbTimeUTC',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'readOnly',current_setting('transaction_read_only'),'currentUser',current_user,'sessionUser',session_user,
 'name','public.native_prepare_v2','exists',p.oid IS NOT NULL,
 'signature',pg_catalog.pg_get_function_identity_arguments(p.oid),
 'owner',pg_catalog.pg_get_userbyid(p.proowner),
 'securityDefiner',p.prosecdef,
 'serviceRoleExecute',CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') END,
 'authenticatedExecute',CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') END,
 'anonExecute',CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') END
) AS qualification
FROM (VALUES (1)) anchor(x)
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname='native_prepare_v2' AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, uuid, uuid';
ROLLBACK;
