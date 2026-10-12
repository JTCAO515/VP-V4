CREATE OR REPLACE FUNCTION export_private.profile_integer_v1(v jsonb, max_n bigint DEFAULT '9007199254740991'::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare n numeric;begin
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
 n:=(v#>>'{}')::numeric;
 if n<0 or n>max_n or n<>trunc(n) then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
 return to_jsonb(n::bigint);
end$function$

