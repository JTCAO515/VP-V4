CREATE OR REPLACE FUNCTION public.privacy_core_export_v1(p_action text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare keys text[];role text:=auth.role();req uuid;op uuid;lease uuid;gen integer;actor jsonb;u uuid;
 policy export_private.core_policies_v1%rowtype;j export_private.core_jobs_v1%rowtype;ticket export_private.core_tickets_v1%rowtype;a export_private.core_artifacts_v1%rowtype;
 artifact jsonb;nonce bytea;tag bytea;cipher bytea;digest text;expires timestamptz;run_ms integer;ttl integer;limit_n integer;cursor uuid;page jsonb;more boolean;next_id uuid;all_complete boolean;
 profile_lease_deadline timestamptz;removed integer:=0;removed_tickets integer:=0;c record;old_intent public.privacy_requests%rowtype;
begin
 if p_action='memory_page' then return export_private.core_memory_page_v1(p_input);end if;
 if p_action='entitlement_page' then return export_private.entitlement_page_v1(p_input);end if;
 if p_action='profile_page' then return export_private.core_profile_page_v1(p_input);end if;
 keys:=case p_action
 when 'request' then array['requestId','confirmed'] when 'read' then array['requestId']
 when 'claim' then array['requestId','operationId','maxRunMs','expectedEnvironment','expectedKeyId']
 when 'validate' then array['requestId','leaseId','generation'] when 'trip_page' then array['requestId','leaseId','generation','afterTripId','limit']
 when 'commit' then array['requestId','leaseId','generation','artifact','modules','coverage']
 when 'execution_receipt' then array['requestId','leaseId','generation','expectedArtifactDigest']
 when 'fail' then array['requestId','leaseId','generation','reason']
 when 'ticket' then array['requestId','operationId','tokenHash','ticketTtlMs']
 when 'download_prepare' then array['requestId','operationId','tokenHash']
 when 'download_consume' then array['requestId','operationId','tokenHash','artifactDigest','generation']
 when 'purge' then array['operationId','limit'] else null end;
 if keys is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& keys) or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(keys))) then raise exception 'INVALID_INPUT';end if;
 if p_action in ('request','read','ticket','download_prepare','download_consume') then
  if role is distinct from 'authenticated' then raise exception 'FORBIDDEN';end if;
 else if role is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;end if;
 if p_input ? 'requestId' then
  if jsonb_typeof(p_input->'requestId') is distinct from 'string' or p_input->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;req:=(p_input->>'requestId')::uuid;
 end if;
 if p_input ? 'operationId' then
  if jsonb_typeof(p_input->'operationId') is distinct from 'string' or p_input->>'operationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;op:=(p_input->>'operationId')::uuid;
 end if;
 if p_input ? 'leaseId' then
  if jsonb_typeof(p_input->'leaseId') is distinct from 'string' or p_input->>'leaseId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;lease:=(p_input->>'leaseId')::uuid;
 end if;
 if p_input ? 'generation' then
  if jsonb_typeof(p_input->'generation') is distinct from 'number' or p_input->>'generation' !~ '^[1-3]$' then raise exception 'INVALID_INPUT';end if;gen:=(p_input->>'generation')::integer;
 end if;
 if p_input ? 'tokenHash' and (jsonb_typeof(p_input->'tokenHash') is distinct from 'string' or p_input->>'tokenHash' !~ '^[a-f0-9]{64}$') then raise exception 'INVALID_INPUT';end if;
 if p_action='request' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'INVALID_INPUT';end if;
  select * into policy from export_private.core_policies_v1 where enabled for share nowait;
  if not found or policy.revoked_at is not null or policy.valid_until<=clock_timestamp() then raise exception 'EXPORT_POLICY_UNCONFIGURED';end if;
  actor:=export_private.current_native_v1(true);u:=(actor->>'subject')::uuid;
  select * into old_intent from public.privacy_requests where id=req for update;
  if found and (old_intent.owner_id<>u or old_intent.action<>'export' or old_intent.scope_version<>'all-user-data-v1' or old_intent.status<>'requested' or old_intent.execution_state<>'not_started') then raise exception 'EXPORT_CONFLICT';end if;
  perform public.request_privacy_action(req,'export');
  select * into j from export_private.core_jobs_v1 where request_id=req for update;
  if found then if j.owner_id<>u or j.scope<>'core-export-d2/1' then raise exception 'EXPORT_CONFLICT';end if;return export_private.job_receipt_v1(j);end if;
  insert into export_private.core_jobs_v1(request_id,owner_id,session_id,session_epoch,policy_id,policy_snapshot,state,expires_at)
  values(req,u,(actor->>'sessionId')::uuid,(actor->>'mobileEpoch')::bigint,policy.id,to_jsonb(policy),'queued',least(policy.valid_until,clock_timestamp()+2*policy.artifact_ttl_ms*interval '1 millisecond')) returning * into j;
  return export_private.job_receipt_v1(j);
 end if;
 if p_action='purge' then
  if jsonb_typeof(p_input->'limit') is distinct from 'number' or p_input->>'limit' !~ '^[1-9][0-9]{0,2}$' or (p_input->>'limit')::integer>100 then raise exception 'INVALID_INPUT';end if;limit_n:=(p_input->>'limit')::integer;
  for c in select request_id,owner_id from export_private.core_jobs_v1 where expires_at<=clock_timestamp() or artifact_expires_at<=clock_timestamp() order by request_id limit limit_n loop
   begin
    perform 1 from auth.users where id=c.owner_id for key share nowait;
    perform 1 from identity_private.mobile_accounts where owner_id=c.owner_id for update nowait;
    select * into j from export_private.core_jobs_v1 where request_id=c.request_id for update nowait;
    delete from export_private.core_tickets_v1 where request_id=j.request_id;get diagnostics ttl=row_count;removed_tickets:=removed_tickets+ttl;
    delete from export_private.core_artifacts_v1 where request_id=j.request_id;get diagnostics ttl=row_count;removed:=removed+ttl;
    update export_private.core_jobs_v1 set state='expired',lease_id=null,lease_expires_at=null,artifact_digest=null,artifact_bytes=null,artifact_expires_at=null,modules='[]' where request_id=j.request_id;
   exception when lock_not_available then null;end;
  end loop;
  delete from export_private.core_tickets_v1 where operation_id in (select operation_id from export_private.core_tickets_v1 where expires_at<=clock_timestamp() order by operation_id limit limit_n);get diagnostics ttl=row_count;
  return jsonb_build_object('kind','privacy_export_purge/1','removedArtifacts',removed,'removedTickets',removed_tickets+ttl);
 end if;
 -- Pin job policy before native/current actor locks. Metadata lookup is not authority.
 select p.* into policy from export_private.core_policies_v1 p join export_private.core_jobs_v1 q on q.policy_id=p.id where q.request_id=req for share of p nowait;
 if not found then if p_action='execution_receipt' then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','unknown','receipt',null);else raise exception 'FORBIDDEN';end if;end if;
 if p_action in ('read','ticket','download_prepare','download_consume') then
  actor:=export_private.current_native_v1(p_action='ticket');u:=(actor->>'subject')::uuid;
 end if;
 if u is not null and not exists(select 1 from export_private.core_jobs_v1 where request_id=req and owner_id=u) then raise exception 'FORBIDDEN';end if;
 j:=export_private.lock_job_v1(req,p_action not in ('read','ticket','download_prepare','download_consume'));
 if j.request_id is null then
  if p_action='execution_receipt' then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','unknown','receipt',null);end if;
  if p_action='validate' then return jsonb_build_object('kind','privacy_export_lease_state/1','current',false);end if;
  return jsonb_build_object('kind','unavailable');
 end if;
 if u is not null and j.owner_id<>u then raise exception 'FORBIDDEN';end if;
 if p_action='read' then return export_private.job_receipt_v1(j);end if;
 if p_action='execution_receipt' then
  if jsonb_typeof(p_input->'expectedArtifactDigest') is distinct from 'string' or p_input->>'expectedArtifactDigest' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
  if j.committed_lease=lease and j.generation=gen and j.state in ('ready_partial','ready_complete') and j.artifact_digest=p_input->>'expectedArtifactDigest' and j.artifact_expires_at>clock_timestamp() then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','terminal','receipt',export_private.job_receipt_v1(j));end if;
  if j.committed_lease=lease and j.generation=gen and j.state='failed' then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','terminal','receipt',export_private.job_receipt_v1(j));end if;
  return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','unknown','receipt',null);
 end if;
 if p_action='claim' then
  if jsonb_typeof(p_input->'maxRunMs') is distinct from 'number' or p_input->>'maxRunMs' !~ '^[1-9][0-9]{0,4}$' or (p_input->>'maxRunMs')::integer>policy.max_run_ms or (p_input->>'maxRunMs')::integer>90000
  or jsonb_typeof(p_input->'expectedEnvironment') is distinct from 'string' or jsonb_typeof(p_input->'expectedKeyId') is distinct from 'string' or p_input->>'expectedEnvironment' is distinct from policy.environment or p_input->>'expectedKeyId' is distinct from policy.key_id then raise exception 'INVALID_INPUT';end if;run_ms:=(p_input->>'maxRunMs')::integer;
  digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  if j.claim_operation=op then
   if j.claim_digest<>digest then raise exception 'EXPORT_CONFLICT';end if;
   if j.state='running' and j.lease_expires_at>clock_timestamp() then return jsonb_build_object('kind','privacy_export_lease/1','requestId',req,'ownerId',j.owner_id,'leaseId',j.lease_id,'generation',j.generation,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',true);end if;
   return jsonb_build_object('kind','unavailable');
  end if;
  if j.expires_at<=clock_timestamp() or j.state not in ('queued','running') or j.state='running' and (j.lease_expires_at>clock_timestamp() or j.generation>=3) then return jsonb_build_object('kind','unavailable');end if;
  update export_private.core_jobs_v1 set generation=case when state='running' then generation+1 else generation end,state='running',claim_operation=op,claim_digest=digest,lease_id=gen_random_uuid(),lease_expires_at=least(clock_timestamp()+run_ms*interval '1 millisecond',expires_at,policy.valid_until) where request_id=req returning * into j;
  return jsonb_build_object('kind','privacy_export_lease/1','requestId',req,'ownerId',j.owner_id,'leaseId',j.lease_id,'generation',j.generation,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',false);
 end if;
 if p_action='validate' then return jsonb_build_object('kind','privacy_export_lease_state/1','current',export_private.live_lease_v1(j,lease,gen));end if;
 if p_action='trip_page' then
  if not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;
  if jsonb_typeof(p_input->'limit') is distinct from 'number' or p_input->>'limit' !~ '^[1-9][0-9]{0,2}$' or (p_input->>'limit')::integer>policy.page_size then raise exception 'INVALID_INPUT';end if;limit_n:=(p_input->>'limit')::integer;
  if p_input->'afterTripId'='null'::jsonb then cursor:=null;
  elsif jsonb_typeof(p_input->'afterTripId')='string' and p_input->>'afterTripId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then cursor:=(p_input->>'afterTripId')::uuid;
  else raise exception 'INVALID_INPUT';end if;
  if cursor is not null and not exists(select 1 from public.trips where id=cursor and owner_id=j.owner_id and not exists(select 1 from privacy_private.trip_deletions where trip_id=cursor)) then raise exception 'INVALID_EXPORT_CURSOR';end if;
  if exists(select 1 from public.trips t left join public.trip_version_snapshots s on s.trip_id=t.id and s.version=t.head_version and s.owner_id=t.owner_id where t.owner_id=j.owner_id and (cursor is null or t.id>cursor) and not exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) and (s.trip_id is null or s.title<>t.title) order by t.id limit limit_n+1) then raise exception 'SOURCE_UNAVAILABLE';end if;
  with candidates as (
   select t.id,jsonb_build_object('tripId',t.id,'title',t.title,'headVersion',t.head_version,'confirmationState',case when t.head_version=0 then 'initial' when exists(select 1 from public.trip_events e join public.trip_proposals p on p.id=e.proposal_id and p.owner_id=e.owner_id join public.trip_idempotency r on r.proposal_id=p.id and r.owner_id=p.owner_id and r.resulting_version=e.resulting_version where e.trip_id=t.id and e.owner_id=t.owner_id and e.resulting_version=t.head_version and p.status='applied' and p.base_trip_version+1=t.head_version) then 'confirmed' else 'unknown' end,'content',export_private.trip_content_v1(s.content)) as item
   from public.trips t join public.trip_version_snapshots s on s.trip_id=t.id and s.version=t.head_version and s.owner_id=t.owner_id where t.owner_id=j.owner_id and (cursor is null or t.id>cursor) and not exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) order by t.id limit limit_n+1
  ),delivered as(select * from candidates order by id limit limit_n)
  select coalesce((select jsonb_agg(item order by id) from delivered),'[]'),(select count(*)>limit_n from candidates),(select id from delivered order by id desc limit 1) into page,more,next_id;
  return jsonb_build_object('schemaVersion','trip-core-export/1','section','trips','items',page,'hasMore',more,'nextCursor',case when more then next_id else null end,'sectionComplete',not more);
 end if;
 if p_action='commit' then
  if export_private.memory_commit_progress_v1(j,p_input->'modules',lease,gen) is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  if export_private.entitlement_commit_progress_v1(j,p_input->'modules',lease,gen) is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  if pdf_intake_private.export_commit_v1(j,p_input->'modules',lease,gen) is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  if j.state='running' and export_private.profile_commit_qualifies_v1(j,p_input->'modules',lease,gen) is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  artifact:=p_input->'artifact';
  if jsonb_typeof(artifact) is distinct from 'object' or artifact-array['schemaVersion','keyId','nonce','tag','ciphertext','plaintextDigest','plaintextBytes','expiresAt']<>'{}' or (select count(*) from jsonb_object_keys(artifact))<>8
  or jsonb_typeof(artifact->'keyId') is distinct from 'string' or artifact->>'schemaVersion' is distinct from 'privacy-export-artifact/1' or artifact->>'keyId' is distinct from policy.key_id or jsonb_typeof(artifact->'plaintextDigest') is distinct from 'string' or artifact->>'plaintextDigest' !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(artifact->'plaintextBytes') is distinct from 'number' or artifact->>'plaintextBytes' !~ '^[1-9][0-9]{0,6}$' or (artifact->>'plaintextBytes')::integer>policy.max_bytes
  or turn_private.planning_v2_valid_ms_v1(artifact->'expiresAt') is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  nonce:=export_private.unb64_v1(artifact->>'nonce',12);tag:=export_private.unb64_v1(artifact->>'tag',16);cipher:=export_private.unb64_v1(artifact->>'ciphertext',policy.max_bytes);
  if nonce is null or tag is null or cipher is null or octet_length(nonce)<>12 or octet_length(tag)<>16 or octet_length(cipher)<>(artifact->>'plaintextBytes')::integer then raise exception 'INVALID_OUTPUT';end if;
  if export_private.valid_modules_v1(p_input->'modules',policy.max_pages) is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  select bool_and(m->>'status'='complete') into all_complete from jsonb_array_elements(p_input->'modules') m;
  if p_input->>'coverage' is distinct from (case when all_complete then 'complete' else 'partial' end) then raise exception 'INVALID_OUTPUT';end if;
  digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  if j.state in ('ready_partial','ready_complete') then
   if j.committed_lease=lease and j.generation=gen and j.commit_digest=digest and j.artifact_expires_at>clock_timestamp() then
    if export_private.profile_source_current_v1(j) is distinct from true then raise exception 'INVALID_OUTPUT';end if;
    return export_private.job_receipt_v1(j);end if;raise exception 'EXPORT_CONFLICT';
  end if;
  if not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;
  expires:=(artifact->>'expiresAt')::timestamptz;
  if expires<=clock_timestamp() or expires>clock_timestamp()+interval '24 hours' then raise exception 'INVALID_OUTPUT';end if;
  expires:=least(expires,clock_timestamp()+policy.artifact_ttl_ms*interval '1 millisecond',j.expires_at);
  if expires<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
  profile_lease_deadline:=j.lease_expires_at;
  insert into export_private.core_artifacts_v1(request_id,owner_id,generation,lease_id,key_id,nonce,tag,ciphertext,plaintext_digest,plaintext_bytes,ciphertext_digest,aad,expires_at)
   values(req,j.owner_id,gen,lease,policy.key_id,nonce,tag,cipher,artifact->>'plaintextDigest',(artifact->>'plaintextBytes')::integer,encode(sha256(cipher),'hex'),'["privacy-core-export/1",'||turn_private.planning_v2_json_string_v1(req::text)||','||turn_private.planning_v2_json_string_v1(j.owner_id::text)||','||gen::text||']',expires);
  update export_private.core_jobs_v1 set state=case when all_complete then 'ready_complete' else 'ready_partial' end,modules=p_input->'modules',completed_at=clock_timestamp(),artifact_digest=artifact->>'plaintextDigest',artifact_bytes=(artifact->>'plaintextBytes')::integer,artifact_expires_at=expires,committed_lease=lease,commit_digest=digest,lease_id=null,lease_expires_at=null where request_id=req returning * into j;
  perform export_private.record_profile_provenance_v1(j,profile_lease_deadline);
  return export_private.job_receipt_v1(j);
 end if;
 if p_action='fail' then
  if p_input->>'reason' not in ('SOURCE_UNAVAILABLE','INVALID_OUTPUT') or p_input->>'reason' is null then raise exception 'INVALID_INPUT';end if;
  if not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;
  update export_private.core_jobs_v1 set state='failed',committed_lease=lease,completed_at=clock_timestamp(),lease_id=null,lease_expires_at=null where request_id=req returning * into j;return export_private.job_receipt_v1(j);
 end if;
 -- Owner-only protected download: no token/body in URLs or stored rows.
 select * into a from export_private.core_artifacts_v1 where request_id=req and owner_id=u for share;
 if not found or j.state not in ('ready_partial','ready_complete') or a.expires_at<=clock_timestamp() or j.expires_at<=clock_timestamp() or a.generation<>j.generation or a.plaintext_digest<>j.artifact_digest then return jsonb_build_object('kind','unavailable');end if;
 if p_action='ticket' then
  if jsonb_typeof(p_input->'ticketTtlMs') is distinct from 'number' or p_input->>'ticketTtlMs' !~ '^[1-9][0-9]{0,5}$' or (p_input->>'ticketTtlMs')::integer>policy.ticket_ttl_ms or (p_input->>'ticketTtlMs')::integer>300000 then raise exception 'INVALID_INPUT';end if;ttl:=(p_input->>'ticketTtlMs')::integer;
  select * into ticket from export_private.core_tickets_v1 where operation_id=op for update;
  if found then
   if ticket.request_id<>req or ticket.owner_id<>u or ticket.token_hash<>p_input->>'tokenHash' then raise exception 'EXPORT_CONFLICT';end if;
   if ticket.session_id<>(actor->>'sessionId')::uuid or ticket.session_epoch<>(actor->>'mobileEpoch')::bigint or ticket.generation<>a.generation or ticket.artifact_digest<>a.plaintext_digest or ticket.revoked_at is not null or ticket.consumed_at is not null or ticket.expires_at<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
  else
   update export_private.core_tickets_v1 set revoked_at=clock_timestamp() where request_id=req and owner_id=u and consumed_at is null and revoked_at is null;
   insert into export_private.core_tickets_v1(operation_id,request_id,owner_id,session_id,session_epoch,generation,artifact_digest,token_hash,expires_at)
    values(op,req,u,(actor->>'sessionId')::uuid,(actor->>'mobileEpoch')::bigint,a.generation,a.plaintext_digest,p_input->>'tokenHash',least(clock_timestamp()+ttl*interval '1 millisecond',a.expires_at,j.expires_at)) returning * into ticket;
  end if;
  return jsonb_build_object('kind','privacy_export_ticket/1','requestId',req,'operationId',op,'generation',ticket.generation,'artifactDigest',ticket.artifact_digest,'expiresAt',export_private.ms_v1(ticket.expires_at));
 end if;
 select * into ticket from export_private.core_tickets_v1 where operation_id=op and request_id=req and owner_id=u for update;
 if not found or ticket.token_hash<>p_input->>'tokenHash' or ticket.session_id<>(actor->>'sessionId')::uuid or ticket.session_epoch<>(actor->>'mobileEpoch')::bigint or ticket.generation<>a.generation or ticket.artifact_digest<>a.plaintext_digest or ticket.revoked_at is not null or ticket.consumed_at is not null or ticket.expires_at<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
 if p_action='download_prepare' then return jsonb_build_object('kind','privacy_export_download/1','requestId',req,'operationId',op,'generation',a.generation,'ownerId',u,'artifactDigest',a.plaintext_digest,'artifact',export_private.artifact_wire_v1(a),'ticketExpiresAt',export_private.ms_v1(ticket.expires_at));end if;
 if p_action='download_consume' then
  if jsonb_typeof(p_input->'artifactDigest') is distinct from 'string' or p_input->>'artifactDigest' is distinct from a.plaintext_digest or gen is distinct from a.generation then return jsonb_build_object('kind','unavailable');end if;
  update export_private.core_tickets_v1 set consumed_at=clock_timestamp() where operation_id=op;
  return jsonb_build_object('kind','privacy_export_download_consumed/1','requestId',req,'operationId',op,'generation',a.generation,'artifactDigest',a.plaintext_digest);
 end if;
 raise exception 'INVALID_INPUT';
end $function$
