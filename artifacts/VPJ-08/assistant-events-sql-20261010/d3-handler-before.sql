CREATE OR REPLACE FUNCTION public.privacy_linked_trip_delete_v1(p_action text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare keys text[];actor jsonb;u uuid;trip uuid;version integer;plan privacy_private.linked_delete_plans_v1%rowtype;j privacy_private.linked_delete_jobs_v1%rowtype;
 request uuid;operation uuid;lease uuid;g jsonb;s jsonb;digest text;retained jsonb:='["FINANCIAL_LEDGER_MINIMUM","TASK_CAPACITY_MINIMUM","EXTERNAL_DOWNLOADED_COPIES","PROVIDER_COPIES_NOT_ERASED","BACKUP_ERASURE_NOT_VERIFIED"]';
 name text;ids uuid[];turns uuid[];messages uuid[];goals uuid[];tasks uuid[];artifacts uuid[];threads uuid[];exports uuid[];count_n integer;erased jsonb;worker privacy_private.linked_delete_worker_settings_v1%rowtype;r privacy_private.trip_deletions%rowtype;
begin
 keys:=case p_action when 'preview' then array['tripId','expectedVersion'] when 'confirm' then array['requestId','planId','scopeDigest','expectedVersion','confirmed','selection'] when 'read' then array['requestId'] when 'claim' then array['requestId','operationId'] when 'execute' then array['requestId','leaseId'] when 'purge' then array['operationId','limit'] else null end;
 if keys is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& keys) or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(keys))) then raise exception 'INVALID_INPUT';end if;
 if p_action in ('claim','execute','purge') then if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 else actor:=privacy_private.linked_delete_actor_v1(p_action<>'read');u:=(actor->>'subject')::uuid;end if;
 if p_input ? 'requestId' then if jsonb_typeof(p_input->'requestId') is distinct from 'string' or p_input->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;request:=(p_input->>'requestId')::uuid;end if;
 if p_action='purge' then
  if jsonb_typeof(p_input->'operationId') is distinct from 'string' or p_input->>'operationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(p_input->'limit') is distinct from 'number' or p_input->>'limit' !~ '^[1-9][0-9]{0,2}$' or (p_input->>'limit')::integer>100 then raise exception 'INVALID_INPUT';end if;
  delete from privacy_private.linked_delete_plans_v1 where id in(select p.id from privacy_private.linked_delete_plans_v1 p where p.expires_at<=clock_timestamp() and not exists(select 1 from privacy_private.linked_delete_jobs_v1 q where q.plan_id=p.id) order by p.id limit (p_input->>'limit')::integer for update of p skip locked);get diagnostics count_n=row_count;
  return jsonb_build_object('kind','linked_trip_delete_purge/1','removedPlans',count_n);
 end if;
 if p_action='preview' then
  if jsonb_typeof(p_input->'tripId') is distinct from 'string' or p_input->>'tripId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' or p_input->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,8})$' then raise exception 'INVALID_INPUT';end if;
  trip:=(p_input->>'tripId')::uuid;version:=(p_input->>'expectedVersion')::integer;
  perform 1 from public.trips where id=trip and owner_id=u and head_version=version for share nowait;if not found then raise exception 'STALE_TRIP_VERSION';end if;
  if exists(select 1 from privacy_private.trip_deletions where trip_id=trip) then raise exception 'DELETION_ALREADY_REQUESTED';end if;
  g:=privacy_private.linked_delete_graph_v1(u,trip);digest:=encode(sha256(convert_to(jsonb_build_array(u,trip,version,g->'graph',g->'selection',g->'conflicts')::text,'UTF8')),'hex');
  insert into privacy_private.linked_delete_plans_v1(owner_id,session_id,session_epoch,trip_id,head_version,scope_digest,graph,selection,counts,conflicts,retained,expires_at)
   values(u,(actor->>'sessionId')::uuid,(actor->>'mobileEpoch')::bigint,trip,version,digest,g->'graph',g->'selection',g->'counts',g->'conflicts',retained,clock_timestamp()+interval '5 minutes') returning * into plan;
  return jsonb_build_object('kind','linked_trip_delete_plan/1','planId',plan.id,'tripId',trip,'title',(select title from public.trips where id=trip),'expectedVersion',version,'scopeDigest',digest,'expiresAt',export_private.ms_v1(plan.expires_at),'selection',plan.selection,'counts',plan.counts,'conflicts',plan.conflicts,'retained',plan.retained);
 end if;
 if p_action='confirm' then
  if p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'planId') is distinct from 'string' or p_input->>'planId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;
  select * into plan from privacy_private.linked_delete_plans_v1 where id=(p_input->>'planId')::uuid and owner_id=u;
  if not found then raise exception 'FORBIDDEN';end if;
  if p_input->>'scopeDigest' is distinct from plan.scope_digest or p_input->'expectedVersion' is distinct from to_jsonb(plan.head_version) then raise exception 'SCOPE_CHANGED';end if;
  if p_input->'selection' is distinct from plan.selection then raise exception 'SCOPE_NOT_COMPLETE';end if;
  select * into j from privacy_private.linked_delete_jobs_v1 where request_id=request;
  if found then if j.owner_id<>u or j.plan_id<>plan.id then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;return privacy_private.linked_delete_receipt_v1(j);end if;
  if plan.expires_at<=clock_timestamp() then raise exception 'PLAN_EXPIRED';end if;
  if plan.session_id is distinct from (actor->>'sessionId')::uuid or plan.session_epoch is distinct from (actor->>'mobileEpoch')::bigint then raise exception 'SESSION_REPLACED';end if;
  if plan.conflicts<>'[]'::jsonb then raise exception 'SCOPE_CONFLICT';end if;
  perform privacy_private.linked_delete_lock_graph_v1(u,plan.trip_id,plan.selection);
  if not exists(select 1 from public.trips where id=plan.trip_id and owner_id=u and head_version=plan.head_version) then raise exception 'STALE_TRIP_VERSION';end if;
  g:=privacy_private.linked_delete_graph_v1(u,plan.trip_id);
  if g->'graph' is distinct from plan.graph or g->'selection' is distinct from plan.selection or g->'conflicts'<>'[]'::jsonb then raise exception 'SCOPE_CHANGED';end if;
  if exists(select 1 from privacy_private.trip_deletions where trip_id=plan.trip_id) then raise exception 'DELETION_ALREADY_REQUESTED';end if;
  insert into privacy_private.trip_deletions(request_id,owner_id,trip_id,expected_version) values(request,u,plan.trip_id,plan.head_version);
  insert into privacy_private.linked_delete_jobs_v1(request_id,plan_id,owner_id,trip_id,expected_graph) values(request,plan.id,u,plan.trip_id,'{}') returning * into j;
  for name in select unnest(array['thread','turn','task','goal','message','artifact']) loop
   ids:=privacy_private.linked_delete_array_v1(plan.selection->case name when 'thread' then 'threadIds' when 'turn' then 'turnIds' when 'task' then 'taskIds' when 'goal' then 'goalIds' when 'message' then 'messageIds' else 'artifactIds' end);
   insert into privacy_private.linked_delete_fences_v1(entity_kind,entity_id,request_id,owner_id) select name,id,request,u from unnest(ids) id;
  end loop;
  exports:=privacy_private.linked_delete_array_v1(plan.selection->'exportRequestIds');
  update export_private.core_jobs_v1 set state='expired',lease_id=null,lease_expires_at=null,artifact_digest=null,artifact_bytes=null,artifact_expires_at=null,modules='[]' where request_id=any(exports) and owner_id=u;
  get diagnostics count_n=row_count;update privacy_private.linked_delete_jobs_v1 set invalidated_exports=count_n,erased_tickets=(select count(*) from export_private.core_tickets_v1 where request_id=any(exports) and owner_id=u) where request_id=request;
  delete from export_private.core_artifacts_v1 where request_id=any(exports) and owner_id=u;
  g:=privacy_private.linked_delete_graph_v1(u,plan.trip_id,plan.selection);
  update privacy_private.linked_delete_jobs_v1 set expected_graph=g->'graph' where request_id=request returning * into j;
  return privacy_private.linked_delete_receipt_v1(j);
 end if;
 select * into j from privacy_private.linked_delete_jobs_v1 where request_id=request;
 if not found or u is not null and j.owner_id<>u then raise exception 'FORBIDDEN';end if;
 if p_action='read' then return privacy_private.linked_delete_receipt_v1(j);end if;
 if exists(select 1 from privacy_private.trip_deletions where request_id=request and state='completed') then
  if p_action='execute' and p_input->>'leaseId' is distinct from j.lease_id::text then raise exception 'FORBIDDEN';end if;return privacy_private.linked_delete_receipt_v1(j);
 end if;
 select * into worker from privacy_private.linked_delete_worker_settings_v1 where singleton and enabled for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into plan from privacy_private.linked_delete_plans_v1 where id=j.plan_id;
 perform privacy_private.linked_delete_lock_graph_v1(j.owner_id,j.trip_id,plan.selection);
 select * into j from privacy_private.linked_delete_jobs_v1 where request_id=request for update;
 select * into r from privacy_private.trip_deletions where request_id=request for update;
 if r.state='completed' then return privacy_private.linked_delete_receipt_v1(j);end if;
 if p_action='claim' then
  if jsonb_typeof(p_input->'operationId') is distinct from 'string' or p_input->>'operationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;operation:=(p_input->>'operationId')::uuid;
  if j.lease_operation=operation and j.lease_expires_at>clock_timestamp() then return jsonb_build_object('kind','leased','requestId',request,'leaseId',j.lease_id,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',true,'scopeDigest',plan.scope_digest,'selection',plan.selection);end if;
  if j.lease_expires_at>clock_timestamp() then return jsonb_build_object('kind','blocked');end if;
  update privacy_private.linked_delete_jobs_v1 set lease_id=gen_random_uuid(),lease_operation=operation,lease_expires_at=clock_timestamp()+worker.max_lease_ms*interval '1 millisecond' where request_id=request returning * into j;
  return jsonb_build_object('kind','leased','requestId',request,'leaseId',j.lease_id,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',false,'scopeDigest',plan.scope_digest,'selection',plan.selection);
 end if;
 if jsonb_typeof(p_input->'leaseId') is distinct from 'string' or p_input->>'leaseId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;lease:=(p_input->>'leaseId')::uuid;
 if j.lease_id is distinct from lease or j.lease_expires_at<=clock_timestamp() then return jsonb_build_object('kind','blocked');end if;
 g:=privacy_private.linked_delete_graph_v1(j.owner_id,j.trip_id,plan.selection);
 if g->'graph' is distinct from j.expected_graph or g->'conflicts'<>'[]'::jsonb then raise exception 'SCOPE_CHANGED';end if;
 update privacy_private.linked_delete_jobs_v1 set execution_xid=pg_current_xact_id(),execution_action='erase',execution_digest=plan.scope_digest where request_id=request;
 threads:=privacy_private.linked_delete_array_v1(plan.selection->'threadIds');turns:=privacy_private.linked_delete_array_v1(plan.selection->'turnIds');tasks:=privacy_private.linked_delete_array_v1(plan.selection->'taskIds');goals:=privacy_private.linked_delete_array_v1(plan.selection->'goalIds');messages:=privacy_private.linked_delete_array_v1(plan.selection->'messageIds');artifacts:=privacy_private.linked_delete_array_v1(plan.selection->'artifactIds');
 erased:=jsonb_build_object('threads',0,'turns',0,'goals',0,'messages',0,'artifacts',0,'textBodies',0,'groundedRows',0,'planningRows',0,'consumerReferences',0,'exports',j.invalidated_exports,'tickets',j.erased_tickets);
 delete from turn_private.result_artifacts where id=any(artifacts) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{artifacts}',to_jsonb(count_n));
 delete from turn_private.planning_comparisons where task_id=any(tasks) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{planningRows}',to_jsonb(count_n));
 delete from turn_private.planning_action_receipts where turn_id=any(turns) and owner_id=j.owner_id;
 delete from turn_private.grounded_turns where turn_id=any(turns) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{groundedRows}',to_jsonb(count_n));
 -- Parent edges are RESTRICT; erase leaves in the approved set only.
 loop
  delete from turn_private.assistant_messages m where m.id=any(messages) and m.owner_id=j.owner_id and not exists(select 1 from turn_private.assistant_messages child where child.parent_message_id=m.id);get diagnostics count_n=row_count;
  erased:=jsonb_set(erased,'{messages}',to_jsonb((erased->>'messages')::integer+count_n));exit when count_n=0;
 end loop;
 if exists(select 1 from turn_private.assistant_messages where id=any(messages)) then raise exception 'SCOPE_CHANGED';end if;
 delete from turn_private.assistant_goals where id=any(goals) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{goals}',to_jsonb(count_n));
 update turn_private.text_content set input_text='[deleted by scoped Trip request]',output_kind=null,output_text=null,hidden_at=coalesce(hidden_at,clock_timestamp()) where turn_id=any(turns) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{textBodies}',to_jsonb(count_n));
 delete from public.memory_consumer_receipts where turn_id=any(turns) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{consumerReferences}',to_jsonb(count_n));
 delete from public.turns where id=any(turns) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{turns}',to_jsonb(count_n));
 delete from public.chat_threads where id=any(threads) and owner_id=j.owner_id;get diagnostics count_n=row_count;erased:=jsonb_set(erased,'{threads}',to_jsonb(count_n));
 perform public.execute_trip_deletion_v1(request);
 update privacy_private.linked_delete_jobs_v1 set erased_counts=erased,completed_at=clock_timestamp(),expected_graph='{}'::jsonb,execution_xid=null,execution_action=null,execution_digest=null where request_id=request returning * into j;
 update privacy_private.linked_delete_plans_v1 set graph='{}'::jsonb where id=j.plan_id;
 return privacy_private.linked_delete_receipt_v1(j);
end $function$;
