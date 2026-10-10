-- Exact original D3 candidate; no public wire or financial behavior change.
CREATE OR REPLACE FUNCTION privacy_private.linked_delete_graph_v1(p_owner uuid, p_trip uuid, p_seed jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare threads uuid[];turns uuid[];tasks uuid[];goals uuid[];messages uuid[];artifacts uuid[];exports uuid[];conflicts jsonb:='[]';selection jsonb;graph jsonb;counts jsonb;pass integer;derived jsonb;derived_n integer;assistant_delivery_n jsonb;
begin
 select coalesce(array_agg(distinct g.id order by g.id),'{}') into goals from (select g.id from turn_private.assistant_goals g where exists(select 1 from turn_private.assistant_goal_trip_links l where l.goal_id=g.id and l.trip_id=p_trip) or g.id=any(privacy_private.linked_delete_array_v1(coalesce(p_seed->'goalIds','[]'))) order by g.id limit 1001) g;
 select coalesce(array_agg(h.id order by h.id),'{}') into threads from (select id from public.chat_threads h where h.trip_id=p_trip or exists(select 1 from public.turns t where t.thread_id=h.id and t.trip_id=p_trip) or exists(select 1 from turn_private.service_tasks st join turn_private.assistant_messages m on m.task_id=st.id where st.thread_id=h.id and m.goal_id=any(goals)) order by h.id limit 101) h;
 select coalesce(array_agg(t.id order by t.id),'{}') into turns from (select id from public.turns t where t.trip_id=p_trip or t.thread_id=any(threads) order by t.id limit 1001) t;
 select coalesce(array_agg(s.id order by s.id),'{}') into tasks from (select id from turn_private.service_tasks s where s.thread_id=any(threads) or exists(select 1 from turn_private.service_task_turns l where l.task_id=s.id and l.turn_id=any(turns)) order by s.id limit 1001) s;

 for pass in 1..2 loop
  select coalesce(array_agg(distinct g.id order by g.id),'{}') into goals from (select g.id from turn_private.assistant_goals g where g.id=any(goals) or exists(select 1 from turn_private.assistant_messages m where m.goal_id=g.id and (m.task_id=any(tasks) or m.turn_id=any(turns))) or exists(select 1 from turn_private.result_artifacts a where a.goal_id=g.id and a.trip_id=p_trip) order by g.id limit 1001) g;
  select coalesce(array_agg(m.id order by m.id),'{}') into messages from (select m.id from turn_private.assistant_messages m where m.goal_id=any(goals) or m.task_id=any(tasks) or m.turn_id=any(turns) order by m.id limit 1001) m;
  select coalesce(array_agg(s.id order by s.id),'{}') into tasks from (select s.id from turn_private.service_tasks s where s.id=any(tasks) or exists(select 1 from turn_private.assistant_messages m where m.id=any(messages) and m.task_id=s.id) order by s.id limit 1001) s;
 end loop;
 select coalesce(array_agg(a.id order by a.id),'{}') into artifacts from (select a.id from turn_private.result_artifacts a where a.trip_id=p_trip or a.task_id=any(tasks) or a.goal_id=any(goals) or a.input_message_id=any(messages) or a.source_turn_id=any(turns) order by a.id limit 1001) a;
 select coalesce(array_agg(e.request_id order by e.request_id),'{}') into exports from (select j.request_id from export_private.core_jobs_v1 j where j.owner_id=p_owner and (j.state in ('queued','running','ready_partial','ready_complete') or exists(select 1 from export_private.core_artifacts_v1 a where a.request_id=j.request_id) or j.request_id=any(privacy_private.linked_delete_array_v1(coalesce(p_seed->'exportRequestIds','[]')))) order by j.request_id limit 101) e;
 if cardinality(threads)>100 or cardinality(turns)>1000 or cardinality(tasks)>1000 or cardinality(goals)>1000 or cardinality(messages)>1000 or cardinality(artifacts)>1000 or cardinality(exports)>100 or cardinality(threads)+cardinality(turns)+cardinality(tasks)+cardinality(goals)+cardinality(messages)+cardinality(artifacts)+cardinality(exports)>4100 then
  return jsonb_build_object('selection',jsonb_build_object('threadIds','[]'::jsonb,'turnIds','[]'::jsonb,'taskIds','[]'::jsonb,'goalIds','[]'::jsonb,'messageIds','[]'::jsonb,'artifactIds','[]'::jsonb,'exportRequestIds','[]'::jsonb),'counts',jsonb_build_object('threads',0,'turns',0,'tasks',0,'goals',0,'messages',0,'artifacts',0,'exports',0),'conflicts','["SCOPE_TOO_LARGE"]'::jsonb,'graph','{}'::jsonb);
 end if;
 if exists(select 1 from public.chat_threads where id=any(threads) and (owner_id<>p_owner or trip_id is not null and trip_id<>p_trip)) or exists(select 1 from public.turns where id=any(turns) and (owner_id<>p_owner or trip_id is not null and trip_id<>p_trip or trip_id is null and not exists(select 1 from public.chat_threads h where h.id=thread_id and (h.trip_id=p_trip or exists(select 1 from turn_private.service_tasks st join turn_private.assistant_messages m on m.task_id=st.id where st.thread_id=h.id and m.goal_id=any(goals)))))) then conflicts:=conflicts||'"SHARED_OR_FOREIGN_CHAT"'::jsonb;end if;
 if exists(select 1 from turn_private.service_tasks where id=any(tasks) and owner_id<>p_owner) or exists(select 1 from turn_private.service_task_turns where task_id=any(tasks) and (owner_id<>p_owner or not(turn_id=any(turns)))) then conflicts:=conflicts||'"SHARED_TASK"'::jsonb;end if;
 if exists(select 1 from turn_private.assistant_goals where id=any(goals) and owner_id<>p_owner) or exists(select 1 from turn_private.assistant_goal_trip_links where goal_id=any(goals) and trip_id is not null and trip_id<>p_trip) or exists(select 1 from turn_private.assistant_goal_trip_receipts where goal_id=any(goals) and trip_id is not null and trip_id<>p_trip) then conflicts:=conflicts||'"SHARED_GOAL"'::jsonb;end if;
 if exists(select 1 from turn_private.assistant_messages where id=any(messages) and (owner_id<>p_owner or turn_id is not null and not(turn_id=any(turns)) or task_id is not null and not(task_id=any(tasks)))) or exists(select 1 from turn_private.assistant_messages where parent_message_id=any(messages) and not(id=any(messages))) then conflicts:=conflicts||'"SHARED_MESSAGE"'::jsonb;end if;
 if exists(select 1 from turn_private.result_artifacts where id=any(artifacts) and (owner_id<>p_owner or trip_id is not null and trip_id<>p_trip)) then conflicts:=conflicts||'"SHARED_ARTIFACT"'::jsonb;end if;
 if exists(select 1 from public.turns where id=any(turns) and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) or exists(select 1 from turn_private.work where turn_id=any(turns) and state in ('queued','leased')) or exists(select 1 from public.model_budget_attempts where task_id=any(tasks) and status in ('reserved','dispatched','pending')) or exists(select 1 from turn_private.service_task_capacity where task_id=any(tasks) and state='reserved') then conflicts:=conflicts||'"ACTIVE_WORK"'::jsonb;end if;
 if exists(select 1 from public.trip_proposals child join public.trip_proposals parent on parent.id=child.parent_proposal_id where parent.trip_id=p_trip and child.trip_id<>p_trip)
 or exists(select 1 from turn_private.result_revisions r join turn_private.result_artifacts a on a.id=r.artifact_id where not(a.id=any(artifacts)) and r.content->'comparisonRef'->>'artifactId'=any(artifacts::text[]))
 or exists(select 1 from turn_private.result_revisions where task_turn_id=any(turns) and not(artifact_id=any(artifacts))) then conflicts:=conflicts||'"CROSS_SCOPE_REFERENCE"'::jsonb;end if;
 selection:=jsonb_build_object('threadIds',to_jsonb(threads),'turnIds',to_jsonb(turns),'taskIds',to_jsonb(tasks),'goalIds',to_jsonb(goals),'messageIds',to_jsonb(messages),'artifactIds',to_jsonb(artifacts),'exportRequestIds',to_jsonb(exports));
 counts:=jsonb_build_object('threads',cardinality(threads),'turns',cardinality(turns),'tasks',cardinality(tasks),'goals',cardinality(goals),'messages',cardinality(messages),'artifacts',cardinality(artifacts),'exports',cardinality(exports));
 select coalesce(jsonb_agg(x.item order by x.kind,x.id),'[]'),count(*) into derived,derived_n from (select * from (
  select 'proposal'::text kind,id::text id,jsonb_build_array('proposal',id,revision,status,parent_proposal_id,encode(sha256(convert_to(patch::text,'UTF8')),'hex')) item from public.trip_proposals where trip_id=p_trip
  union all select 'grounded',turn_id::text,jsonb_build_array('grounded',turn_id,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex')) from turn_private.grounded_turns r where turn_id=any(turns)
  union all select 'planning',turn_id::text,jsonb_build_array('planning',turn_id,state,task_id,message_id,goal_id) from turn_private.planning_comparisons where task_id=any(tasks)
  union all select 'capacity',task_id::text,jsonb_build_array('capacity',task_id,state,settled_turn_id) from turn_private.service_task_capacity where task_id=any(tasks)
  union all select 'budget',attempt_id::text,jsonb_build_array('budget',scope_id,attempt_id,task_id,status,actual_micros) from public.model_budget_attempts where task_id=any(tasks)
  union all select 'export_ticket',operation_id::text,jsonb_build_array('export_ticket',operation_id,generation,artifact_digest,expires_at,consumed_at,revoked_at) from export_private.core_tickets_v1 where request_id=any(exports)
 ) all_derived order by kind,id limit 4101) x;
 assistant_delivery_n:=turn_private.assistant_delivery_source_v1(p_owner,selection);
 if jsonb_array_length(assistant_delivery_n->'rows')+derived_n+cardinality(threads)+cardinality(turns)+cardinality(tasks)+cardinality(goals)+cardinality(messages)+cardinality(artifacts)+cardinality(exports)>4100 then conflicts:=conflicts||'"SCOPE_TOO_LARGE"'::jsonb;selection:=jsonb_build_object('threadIds','[]'::jsonb,'turnIds','[]'::jsonb,'taskIds','[]'::jsonb,'goalIds','[]'::jsonb,'messageIds','[]'::jsonb,'artifactIds','[]'::jsonb,'exportRequestIds','[]'::jsonb);counts:=jsonb_build_object('threads',0,'turns',0,'tasks',0,'goals',0,'messages',0,'artifacts',0,'exports',0);return jsonb_build_object('selection',selection,'counts',counts,'conflicts','["SCOPE_TOO_LARGE"]'::jsonb,'graph','{}'::jsonb);end if;
 graph:=jsonb_build_object('assistantDelivery',assistant_delivery_n,'derived',derived,'trip',(select jsonb_build_array(id,owner_id,head_version,encode(sha256(convert_to(title,'UTF8')),'hex')) from public.trips where id=p_trip),'tripProposals',(select coalesce(jsonb_agg(jsonb_build_array(id,revision,base_trip_version,status,parent_proposal_id,encode(sha256(convert_to(patch::text,'UTF8')),'hex')) order by id),'[]') from public.trip_proposals where trip_id=p_trip),'selection',selection,'exports',(select coalesce(jsonb_agg(jsonb_build_array(request_id,generation,state,artifact_digest,artifact_expires_at,lease_id,lease_expires_at) order by request_id),'[]') from export_private.core_jobs_v1 where request_id=any(exports)),'threads',(select coalesce(jsonb_agg(jsonb_build_array(id,owner_id,trip_id,status) order by id),'[]') from public.chat_threads where id=any(threads)),
 'turns',(select coalesce(jsonb_agg(jsonb_build_array(id,owner_id,thread_id,trip_id,status) order by id),'[]') from public.turns where id=any(turns)),
 'tasks',(select coalesce(jsonb_agg(jsonb_build_array(id,owner_id,thread_id,goal_turn_id,last_turn_id,budget_scope_id) order by id),'[]') from turn_private.service_tasks where id=any(tasks)),
 'goals',(select coalesce(jsonb_agg(jsonb_build_array(id,owner_id,scope_version,encode(sha256(convert_to(current_text,'UTF8')),'hex')) order by id),'[]') from turn_private.assistant_goals where id=any(goals)),
 'messages',(select coalesce(jsonb_agg(jsonb_build_array(id,owner_id,sequence,goal_id,scope_version,task_id,parent_message_id,turn_id,request_digest) order by id),'[]') from turn_private.assistant_messages where id=any(messages)),
 'artifacts',(select coalesce(jsonb_agg(jsonb_build_array(id,owner_id,trip_id,current_revision,lifecycle) order by id),'[]') from turn_private.result_artifacts where id=any(artifacts)),
 'text',(select coalesce(jsonb_agg(jsonb_build_array(turn_id,owner_id,thread_id,encode(sha256(convert_to(jsonb_build_array(input_text,output_kind,output_text,hidden_at)::text,'UTF8')),'hex')) order by turn_id),'[]') from turn_private.text_content where turn_id=any(turns)));
 if octet_length(convert_to(graph::text,'UTF8'))>1000000 then
  selection:=jsonb_build_object('threadIds','[]'::jsonb,'turnIds','[]'::jsonb,'taskIds','[]'::jsonb,'goalIds','[]'::jsonb,'messageIds','[]'::jsonb,'artifactIds','[]'::jsonb,'exportRequestIds','[]'::jsonb);
  counts:=jsonb_build_object('threads',0,'turns',0,'tasks',0,'goals',0,'messages',0,'artifacts',0,'exports',0);
  return jsonb_build_object('selection',selection,'counts',counts,'conflicts','["SCOPE_TOO_LARGE"]'::jsonb,'graph','{}'::jsonb);
 end if;
 return jsonb_build_object('selection',selection,'counts',counts,'conflicts',conflicts,'graph',graph);
end $function$
;

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
 perform turn_private.lock_assistant_delivery_v1(j.owner_id,plan.selection,j.expected_graph->'assistantDelivery');
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
 perform turn_private.retire_assistant_delivery_v1(j.owner_id,plan.selection,j.expected_graph->'assistantDelivery');
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
