CREATE OR REPLACE FUNCTION export_private.profile_managed_copy_v1(req uuid, u uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j export_private.core_jobs_v1;p export_private.profile_snapshot_provenance_v1;a export_private.core_artifacts_v1;m jsonb;intent public.privacy_requests;begin
 if profile_data_private.schema_v1() is not true or export_private.profile_hooks_valid_v1() is not true then return false;end if;
 select * into j from export_private.core_jobs_v1 where request_id=req and owner_id=u;
 if not found or j.state not in('ready_partial','ready_complete') or export_private.valid_modules_v1(j.modules,(j.policy_snapshot->>'max_pages')::integer) is not true then return false;end if;
 select * into p from export_private.profile_snapshot_provenance_v1 where request_id=req and generation=j.generation for share nowait;
 if not found then return false;end if;
 select * into a from export_private.core_artifacts_v1 where request_id=req;
 if not found then return false;end if;
 select * into intent from public.privacy_requests where id=req;
 if not found or intent.owner_id<>u or intent.action<>'export' or intent.scope_version<>'all-user-data-v1'
  or intent.status<>'requested' or intent.execution_state<>'not_started' then return false;end if;
 m:=j.modules->3;
 return coalesce(m->>'module'='profile' and m->>'status'='complete' and m->>'reason'='NONE' and m->'pages'='1' and m->'rows'='1' and m->>'digest'=p.source_digest
  and p.owner_id=j.owner_id and p.session_id=j.session_id and p.session_epoch=j.session_epoch and p.committed_lease=j.committed_lease
  and p.commit_digest=j.commit_digest and p.artifact_digest=j.artifact_digest and p.artifact_bytes=j.artifact_bytes
  and p.completed_at=j.completed_at and p.artifact_expires_at=j.artifact_expires_at and p.key_id=j.policy_snapshot->>'key_id'
  and a.owner_id=j.owner_id and a.generation=j.generation and a.lease_id=j.committed_lease and a.key_id=p.key_id
  and octet_length(a.nonce)=12 and octet_length(a.tag)=16 and octet_length(a.ciphertext)=p.artifact_bytes and a.plaintext_bytes=p.artifact_bytes
  and a.plaintext_digest=p.artifact_digest and a.ciphertext_digest=encode(sha256(a.ciphertext),'hex')
  and a.aad='["privacy-core-export/1",'||turn_private.planning_v2_json_string_v1(req::text)||','||turn_private.planning_v2_json_string_v1(u::text)||','||j.generation::text||']'
  and a.expires_at=p.artifact_expires_at and a.expires_at<=j.expires_at and p.completed_at>=j.created_at
  and a.created_at<=p.completed_at and p.completed_at<a.expires_at,false);
exception when lock_not_available then return false;end$function$
