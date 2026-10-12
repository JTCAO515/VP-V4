CREATE OR REPLACE FUNCTION export_private.profile_commit_qualifies_v1(j export_private.core_jobs_v1, modules jsonb, l uuid, g integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare m jsonb;item jsonb;begin
 if export_private.valid_modules_v1(modules,(j.policy_snapshot->>'max_pages')::integer) is not true then return false;end if;
 m:=modules->3;
 if m->'pages'='0' and m->'rows'='0' then return m->>'status' in('unavailable','failed','partial') and m->>'reason' in('HANDLER_MISSING','SOURCE_UNAVAILABLE','BOUNDED_LIMIT');end if;
 if m->>'status' is distinct from 'complete' or m->>'reason' is distinct from 'NONE' or m->'pages' is distinct from '1'::jsonb or m->'rows' is distinct from '1'::jsonb then return false;end if;
 if export_private.live_lease_v1(j,l,g) is not true then return false;end if;
 item:=export_private.profile_source_v1(j.owner_id);
 return notification_private.hash(jsonb_build_object('snapshot',jsonb_build_array(item)))=m->>'digest' and export_private.live_lease_v1(j,l,g);
exception when lock_not_available then return false;end$function$
