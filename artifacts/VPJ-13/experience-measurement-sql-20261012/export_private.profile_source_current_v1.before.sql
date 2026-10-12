CREATE OR REPLACE FUNCTION export_private.profile_source_current_v1(j export_private.core_jobs_v1)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare m jsonb;item jsonb;p export_private.profile_snapshot_provenance_v1;begin
 if j.modules='[]' then return not exists(select 1 from export_private.profile_snapshot_provenance_v1 where request_id=j.request_id and generation=j.generation);end if;
 if export_private.valid_modules_v1(j.modules,(j.policy_snapshot->>'max_pages')::integer) is not true then return false;end if;
 m:=j.modules->3;
 if m->'pages'='0' and m->'rows'='0' then return not exists(select 1 from export_private.profile_snapshot_provenance_v1 where request_id=j.request_id and generation=j.generation);end if;
 -- D2 order: job -> watermark -> Profile -> ordered operations -> provenance.
 item:=export_private.profile_source_v1(j.owner_id);
 if export_private.profile_managed_copy_v1(j.request_id,j.owner_id) is not true then return false;end if;
 select * into p from export_private.profile_snapshot_provenance_v1 where request_id=j.request_id and generation=j.generation for share nowait;
 return notification_private.hash(jsonb_build_object('snapshot',jsonb_build_array(item)))=p.source_digest
  and item->'sourceRows'=jsonb_build_object('profiles',p.source_profile_rows,'watermarks',p.source_watermark_rows,'operations',p.source_operation_rows)
  and (item->'watermark'->>'profileRevision')::bigint is not distinct from p.profile_revision
  and (item->'watermark'->>'paceRevision')::bigint is not distinct from p.pace_revision
  and (item->'watermark'->>'profileErasureFloor')::bigint is not distinct from p.profile_floor
  and (item->'watermark'->>'paceErasureFloor')::bigint is not distinct from p.pace_floor;
exception when lock_not_available then return false;end$function$

