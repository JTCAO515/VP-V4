CREATE OR REPLACE FUNCTION export_private.record_profile_provenance_v1(committed export_private.core_jobs_v1, lease_deadline timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j export_private.core_jobs_v1;a export_private.core_artifacts_v1;item jsonb;m jsonb;begin
 select * into j from export_private.core_jobs_v1 where request_id=committed.request_id for update nowait;
 if not found or to_jsonb(j) is distinct from to_jsonb(committed) or j.state not in('ready_partial','ready_complete')
  or export_private.valid_modules_v1(j.modules,(j.policy_snapshot->>'max_pages')::integer) is not true then raise exception 'INVALID_OUTPUT';end if;
 m:=j.modules->3;
 if m->'pages'='0' and m->'rows'='0' then
  if exists(select 1 from export_private.profile_snapshot_provenance_v1 where request_id=j.request_id and generation=j.generation) then raise exception 'INVALID_OUTPUT';end if;return;
 end if;
 -- This path may insert only after the actual original atomic artifact/job writes.
 -- Exact commit replay never calls this function or reconstructs a missing proof.
 if exists(select 1 from export_private.profile_snapshot_provenance_v1 where request_id=j.request_id and generation=j.generation) then raise exception 'INVALID_OUTPUT';end if;
 item:=export_private.profile_source_v1(j.owner_id);
 if m->>'status' is distinct from 'complete' or m->>'reason' is distinct from 'NONE' or m->'pages' is distinct from '1'::jsonb or m->'rows' is distinct from '1'::jsonb
  or m->>'digest' is distinct from notification_private.hash(jsonb_build_object('snapshot',jsonb_build_array(item))) then raise exception 'INVALID_OUTPUT';end if;
 select * into a from export_private.core_artifacts_v1 where request_id=j.request_id for share nowait;
 if not found then raise exception 'INVALID_OUTPUT';end if;
 if lease_deadline is null or lease_deadline<=clock_timestamp() or j.expires_at<=clock_timestamp() or j.artifact_expires_at<=clock_timestamp() or (j.policy_snapshot->>'valid_until')::timestamptz<=clock_timestamp() then raise exception 'INVALID_OUTPUT';end if;
 insert into export_private.profile_snapshot_provenance_v1 values(j.request_id,j.generation,j.owner_id,j.session_id,j.session_epoch,j.committed_lease,m->>'digest',
  (item->'watermark'->>'profileRevision')::bigint,(item->'watermark'->>'paceRevision')::bigint,(item->'watermark'->>'profileErasureFloor')::bigint,(item->'watermark'->>'paceErasureFloor')::bigint,
  (item->'sourceRows'->>'profiles')::integer,(item->'sourceRows'->>'watermarks')::integer,(item->'sourceRows'->>'operations')::integer,
  j.artifact_digest,j.artifact_bytes,j.commit_digest,j.completed_at,j.artifact_expires_at,a.key_id);
 if export_private.profile_managed_copy_v1(j.request_id,j.owner_id) is not true or lease_deadline<=clock_timestamp() then raise exception 'INVALID_OUTPUT';end if;
end$function$
