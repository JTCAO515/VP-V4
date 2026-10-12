CREATE OR REPLACE FUNCTION export_private.profile_ids_v1(v jsonb, cap integer DEFAULT 10000)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare x jsonb;last_n text:='';begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>cap then return false;end if;
 for x in select value from jsonb_array_elements(v) loop
  if notification_private.uuid(x) is not true or (x#>>'{}') collate "C"<=last_n collate "C" then return false;end if;last_n:=x#>>'{}';
 end loop;return true;
end$function$
