CREATE OR REPLACE FUNCTION export_private.profile_provenance_immutable_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if TG_OP='UPDATE' or exists(select 1 from export_private.core_jobs_v1 where request_id=OLD.request_id) then
  raise exception 'IMMUTABLE_PROFILE_EXPORT_PROVENANCE';
 end if;
 return OLD;
end$function$

