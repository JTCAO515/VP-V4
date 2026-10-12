CREATE OR REPLACE FUNCTION export_private.profile_copies_valid_v1(v jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$declare k text;n integer:=0;begin
 if notification_private.exact(v,array['briefPreviews','sharedBriefs','scopedEditContexts','scopedEditWork','recoveryContexts','coreExports']) is not true then return false;end if;
 for k in select jsonb_object_keys(v) loop if export_private.profile_ids_v1(v->k) is not true then return false;end if;n:=n+jsonb_array_length(v->k);end loop;return n<=10000;
end$function$

