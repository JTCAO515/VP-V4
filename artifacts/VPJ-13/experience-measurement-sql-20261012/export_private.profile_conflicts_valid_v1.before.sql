CREATE OR REPLACE FUNCTION export_private.profile_conflicts_valid_v1(v jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select coalesce(jsonb_typeof(v)='array' and v=(select coalesce(jsonb_agg(to_jsonb(k) order by ord),'[]') from unnest(array['SCOPE_TOO_LARGE','ACTIVE_PROFILE_USE','CORE_EXPORT_COPY','OTHER_DELETE_PENDING','SOURCE_UNSUPPORTED']) with ordinality f(k,ord) where v ? k),false)$function$
