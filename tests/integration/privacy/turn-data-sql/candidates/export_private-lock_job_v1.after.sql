CREATE OR REPLACE FUNCTION export_private.lock_job_v1(p_request uuid, worker boolean)
 RETURNS export_private.core_jobs_v1
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j export_private.core_jobs_v1;p export_private.core_policies_v1%rowtype;
begin
 select * into j from export_private.core_jobs_v1 where request_id=p_request;if not found then return null;end if;
 select * into p from export_private.core_policies_v1 where id=j.policy_id for share nowait;
 if not found or not p.enabled or p.revoked_at is not null or p.valid_until<=clock_timestamp() or to_jsonb(p) is distinct from j.policy_snapshot then return null;end if;
 perform 1 from auth.users where id=j.owner_id for key share nowait;if not found then return null;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=j.owner_id for update;if not found then return null;end if;
 if worker then
  if not exists(select 1 from identity_private.mobile_accounts where owner_id=j.owner_id and session_id=j.session_id and epoch=j.session_epoch) then return null;end if;
  perform 1 from auth.sessions where id=j.session_id and user_id=j.owner_id for key share;if not found then return null;end if;
 end if;
 perform 1 from public.privacy_requests where id=p_request and owner_id=j.owner_id and action='export' and scope_version='all-user-data-v1' and status='requested' and execution_state='not_started' for share nowait;if not found then return null;end if;
 select * into j from export_private.core_jobs_v1 where request_id=p_request for update nowait;
 if export_private.memory_source_current_v1(j) is distinct from true then return null;end if;
 if export_private.entitlement_source_current_v1(j) is distinct from true then return null;end if;
 if pdf_intake_private.export_current_v1(j) is distinct from true then return null;end if;
 if export_private.profile_source_current_v1(j) is distinct from true then return null;end if;
 if export_private.turn_source_current_v1(j) is distinct from true then return null;end if;
 return j;
exception when lock_not_available then return null;
end $function$
