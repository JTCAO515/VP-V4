CREATE OR REPLACE FUNCTION result_data_private.schema_supported_v1()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select profile_data_private.schema_v1() and result_data_private.infrastructure_supported_v1() and result_data_private.digest_v1((select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations'))::text)='9b12fabfeed0f94c195fff2c51a49da1552ac4575f8e2eb720e4fb6f96a3bd72'
$function$
;
