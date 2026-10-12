CREATE OR REPLACE FUNCTION export_private.profile_natural_v1(v jsonb, max_n bigint DEFAULT '9007199254740991'::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$begin
 return coalesce(jsonb_typeof(v)='number' and (v#>>'{}')::numeric between 0 and max_n and (v#>>'{}')::numeric=trunc((v#>>'{}')::numeric),false);
exception when others then return false;end$function$
