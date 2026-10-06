-- VPJ-58 independent conversation data. This migration remains in development.
-- Sole fixed producer: 1b169b2260f5fbb625201255b777fe5eeb72e9d8 (Mainc6548c authority refinement).
-- No target grants, caller-set transaction authority, raw request/source bodies,
-- session cascade of tombstones, generic export enrollment or provider worker.
create schema conversation_data_private;
revoke all on schema conversation_data_private from public,anon,authenticated,service_role;
alter default privileges in schema conversation_data_private revoke execute on functions from public;

-- Finite, inspectable own operation state; retained session UUID is inert.
-- decision is the finite closed D, never a receipt or another operation row.
create table conversation_data_private.operations_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 scope text not null check(scope in('conversation-sensitive-data/1','conversation-delete-progress/1')),
 root_kind text,root_id uuid,object_ids uuid[] not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 source_authorities jsonb not null check(jsonb_typeof(source_authorities)='array' and jsonb_array_length(source_authorities)<=100),
 captured_at bigint not null check(captured_at>0),
 expires_at bigint not null check(expires_at=captured_at+30000),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'previewed' check(state in('previewed','erased')),
 preview_erased boolean not null default false,
 graph jsonb,erase_counts jsonb,redact_counts jsonb,retain_counts jsonb,
 retained_references jsonb,conflicts jsonb,decision jsonb,
 check(((scope='conversation-sensitive-data/1' and root_kind in('conversation','thread') and root_id is not null and cardinality(object_ids)=0)
  or (scope='conversation-delete-progress/1' and root_kind is null and root_id is null and cardinality(object_ids) between 1 and 20 and not request_id=any(object_ids))) is true),
 check((state='previewed')=(request_digest is null)),
 check((state='previewed')=(decision is null)),
 check(state<>'erased' or preview_erased),
 check((preview_erased and graph is null and erase_counts is null and redact_counts is null and retain_counts is null and retained_references is null and conflicts is null)
  or (not preview_erased and graph is not null and erase_counts is not null and redact_counts is not null and retain_counts is not null and retained_references is not null and conflicts is not null))
);
create index conversation_data_owner_v1 on conversation_data_private.operations_v1(owner_id,request_id);
create index conversation_data_tombstones_v1 on conversation_data_private.operations_v1 using gin(decision jsonb_path_ops)
 where scope='conversation-sensitive-data/1' and state='erased';
alter table conversation_data_private.operations_v1 enable row level security;
revoke all on conversation_data_private.operations_v1 from public,anon,authenticated,service_role;

-- Ephemeral authorization is private and bound to an actual PostgreSQL xid.
-- Executor must remove its proof before returning/committing; it is not a
-- second permanent fence inventory and stores no source/body/raw command.
create table conversation_data_private.transaction_proofs_v1 (
 transaction_id xid8 primary key,
 owner_id uuid not null,
 request_id uuid not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 graph jsonb not null,
 expires_at bigint not null
);
alter table conversation_data_private.transaction_proofs_v1 enable row level security;
revoke all on conversation_data_private.transaction_proofs_v1 from public,anon,authenticated,service_role;

create function conversation_data_private.digest_v1(v text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(v,'UTF8')),'hex')
$$;
create function conversation_data_private.deadline_v1(c bigint,e bigint) returns bigint language plpgsql volatile set search_path='' as $$
declare n bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
begin if n<c or n>=e then raise exception 'CONVERSATION_EXPIRED';end if;return n;end$$;

create function conversation_data_private.ids_v1(v jsonb,max_n integer) returns boolean language plpgsql immutable set search_path='' as $$
declare x jsonb;previous_n text;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>max_n then return false;end if;
 for x in select value from jsonb_array_elements(v) loop
  if notification_private.uuid(x) is not true or previous_n>=x#>>'{}' then return false;end if;
  previous_n:=x#>>'{}';
 end loop;return true;
end$$;
create function conversation_data_private.graph_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;n integer:=0;
begin
 if notification_private.exact(v,array['conversationIds','threadIds','turnIds','taskIds','goalIds','messageIds','artifactIds']) is not true then return false;end if;
 foreach k in array array['conversationIds','threadIds','turnIds','taskIds','goalIds','messageIds','artifactIds'] loop
  if conversation_data_private.ids_v1(v->k,4100) is not true then return false;end if;
  n:=n+jsonb_array_length(v->k);
 end loop;return n<=4100;
end$$;
create function conversation_data_private.selection_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if notification_private.uuid(v->'requestId') is not true then return false;end if;
 if v->>'scope'='conversation-sensitive-data/1' then
  return coalesce(jsonb_typeof(v->'rootKind')='string' and v->>'rootKind' in('conversation','thread') and notification_private.uuid(v->'rootId') and v->'objectIds'='[]'::jsonb,false);
 elsif v->>'scope'='conversation-delete-progress/1' then
  return coalesce(v->'rootKind'='null'::jsonb and v->'rootId'='null'::jsonb and conversation_data_private.ids_v1(v->'objectIds',20)
   and jsonb_array_length(v->'objectIds')>0 and not(v->'objectIds' ? (v->>'requestId')),false);
 end if;return false;
end$$;
create function conversation_data_private.input_v1(v jsonb,a text,recovering boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
declare keys_n text[]:=array['action','scope'];original_n jsonb;
begin
 if jsonb_typeof(v->'action') is distinct from 'string' or v->>'action' is distinct from a
  or jsonb_typeof(v->'scope') is distinct from 'string'
  or v->>'scope' not in('conversation-sensitive-data/1','conversation-delete-progress/1') then return false;end if;
 if a='list' then
  if notification_private.exact(v,keys_n||array['rootKind','cursor','limit']) is not true or v->'limit' is distinct from '20'::jsonb then return false;end if;
  if v->>'scope'='conversation-sensitive-data/1' then
   if (jsonb_typeof(v->'rootKind')='string' and v->>'rootKind' in('conversation','thread')) is not true then return false;end if;
  elsif v->'rootKind' is distinct from 'null'::jsonb then return false;end if;
  if v->'cursor' is distinct from 'null'::jsonb then
   if notification_private.exact(v->'cursor',array['sourceDigest','afterId']) is not true
    or (jsonb_typeof(v->'cursor'->'sourceDigest')='string' and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true
    or notification_private.uuid(v->'cursor'->'afterId') is not true then return false;end if;
  end if;return true;
 end if;
 keys_n:=keys_n||array['requestId','rootKind','rootId','objectIds'];
 if conversation_data_private.selection_v1(v) is not true then return false;end if;
 if a='erase' then
  keys_n:=keys_n||array['sourceDigest','previewDigest','confirmed'];
  if v->'confirmed' is distinct from 'true'::jsonb
   or (jsonb_typeof(v->'sourceDigest')='string' and v->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true
   or (jsonb_typeof(v->'previewDigest')='string' and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 elsif a='recover' then
  if recovering then return false;end if;
  keys_n:=keys_n||array['mutationBytes'];
  if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
  begin original_n:=(v->>'mutationBytes')::jsonb;exception when others then return false;end;
  if conversation_data_private.input_v1(original_n,'erase',true) is not true
   or v->'scope' is distinct from original_n->'scope' or v->'requestId' is distinct from original_n->'requestId'
   or v->'rootKind' is distinct from original_n->'rootKind' or v->'rootId' is distinct from original_n->'rootId'
   or v->'objectIds' is distinct from original_n->'objectIds' then return false;end if;
 elsif a<>'preview' then return false;end if;
 return notification_private.exact(v,keys_n);
end$$;

-- Actor check is reusable only inside this default-denied source executor.
-- Original owner34 -> auth user -> mobile account -> session locks are retained.
create function conversation_data_private.actor_v1(expected_epoch bigint) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid;e bigint;n timestamptz:=clock_timestamp();
begin
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
  or auth.jwt()->>'is_anonymous' is distinct from 'false' or notification_private.uuid(auth.jwt()->'session_id') is not true then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_try_advisory_xact_lock(hashtextextended(u::text,34)) then raise lock_not_available using message='CONVERSATION_CONFLICT';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into e from identity_private.mobile_accounts where owner_id=u and session_id=s for update nowait;
 if not found or e is distinct from expected_epoch then raise exception 'SESSION_REPLACED';end if;
 perform 1 from auth.sessions where id=s and user_id=u for key share nowait;if not found then raise exception 'SESSION_REPLACED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 if identity_private.mobile_access_v2() is not true or not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=e)
  then raise exception 'SESSION_REPLACED';end if;
 n:=clock_timestamp();
 if not exists(select 1 from auth.sessions where id=s and user_id=u and created_at between n-interval '5 minutes' and n)
  then raise exception 'REAUTHENTICATION_REQUIRED';end if;
 return jsonb_build_object('ownerId',u,'sessionId',s,'mobileEpoch',e);
end$$;

create function conversation_data_private.operation_row_v1(r conversation_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',r.request_id,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
  'scope',r.scope,'rootKind',r.root_kind,'rootId',r.root_id,'objectIds',r.object_ids,
  'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'sourceAuthorities',r.source_authorities,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
  'requestDigest',r.request_digest,'state',r.state,'previewErased',r.preview_erased,'graph',r.graph,
  'eraseCounts',r.erase_counts,'redactCounts',r.redact_counts,'retainCounts',r.retain_counts,
  'retainedReferences',r.retained_references,'conflicts',r.conflicts,'decision',r.decision)
$$;


-- Finite actual-source registry, generated from the audited baseline catalog.
-- No mutable discovery registry or generic privacy engine. Drift fails closed.
create function conversation_data_private.sources_v1() returns table(relation_name text,count_key text,effect text,pk text[],columns_n text[],has_owner boolean)
language sql immutable set search_path='' as $$ values
 ('public.chat_threads','threads','erase',array['id']::text[],array['id','owner_id','trip_id','status','created_at','updated_at']::text[], true),
 ('public.chat_turn_events','events','erase',array['id']::text[],array['id','owner_id','thread_id','turn_id','event_id','sequence','schema_version','event_type','state','created_at']::text[], true),
 ('public.chat_turn_idempotency','idempotency','erase',array['owner_id','thread_id','idempotency_key']::text[],array['owner_id','thread_id','idempotency_key','digest','turn_id','created_at']::text[], true),
 ('public.memory_consumer_receipts','memoryConsumers','erase',array['id']::text[],array['id','owner_id','memory_id','source_receipt_id','consumer_kind','turn_id','proposal_id','constraint_kind','created_at']::text[], true),
 ('public.model_budget_attempts','budgetAttempts','retain',array['scope_id','attempt_id']::text[],array['scope_id','attempt_id','task_id','provider','model','price_version','reserved_micros','actual_micros','status','created_at','updated_at']::text[], false),
 ('public.turn_feedback','feedback','erase',array['id']::text[],array['id','owner_id','thread_id','turn_id','feedback_kind','reason_code','created_at']::text[], true),
 ('turn_private.assistant_conversations','conversations','erase',array['id']::text[],array['id','owner_id','policy_id','consent_id','next_sequence','created_at']::text[], true),
 ('turn_private.assistant_goal_trip_links','goalLinks','erase',array['goal_id']::text[],array['goal_id','conversation_id','owner_id','link_version','goal_scope_version','operation_id','trip_id','trip_head_version','source_message_id','source_kind','terminal_unlinked','updated_at']::text[], true),
 ('turn_private.assistant_goal_trip_receipts','goalTripReceipts','retain',array['operation_id']::text[],array['operation_id','owner_id','conversation_id','goal_id','session_id','request_digest','action','source_kind','source_message_id','before_link_version','after_link_version','before_goal_scope_version','after_goal_scope_version','trip_id','trip_head_version','created_at']::text[], true),
 ('turn_private.assistant_goals','goals','erase',array['id']::text[],array['id','conversation_id','owner_id','scope_version','current_text','created_at','trip_terminal']::text[], true),
 ('turn_private.assistant_message_source_receipts','sourceReceipts','erase',array['message_id']::text[],array['message_id','owner_id','request_key','request_digest','input_sources','captured_sources','accepted_receipt','created_at']::text[], true),
 ('turn_private.assistant_messages','messages','erase',array['id']::text[],array['id','conversation_id','owner_id','sequence','idempotency_key','request_digest','policy_id','consent_id','locale','input_text','relationship','goal_id','scope_version','task_id','parent_message_id','turn_id','created_at']::text[], true),
 ('turn_private.assistant_travel_intakes','intakes','erase',array['message_id']::text[],array['message_id','owner_id','conversation_id','goal_id','policy_id','consent_id','message_sequence','goal_version','intake_revision','idempotency_key','request_digest','intake','memory_basis','created_at']::text[], true),
 ('turn_private.grounded_ai_assist_jobs','assistJobs','erase',array['id']::text[],array['id','turn_id','owner_id','status','claim_token','started_at','finished_at','outcome','error_code','created_at']::text[], true),
 ('turn_private.grounded_turns','grounded','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','city','locale','scope_version','intent','request_scope','original_outcome','basis','completed_at','unanswered_needs','place_subject_id','place_name','place_resolution']::text[], true),
 ('turn_private.planning_action_receipts','actionReceipts','erase',array['turn_id','action_key']::text[],array['turn_id','action_key','owner_id','task_id','message_id','lease_token','tool_id','input_digest','basis_digest','memory_basis','state','receipt_digest','created_at','updated_at']::text[], true),
 ('turn_private.planning_comparisons','planning','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','goal_id','message_id','goal_version','planning_policy_id','planning_consent_id','memory_basis','artifact_id','publication_key','state','created_at']::text[], true),
 ('turn_private.planning_intake_bindings','intakeBindings','erase',array['turn_id']::text[],array['turn_id','owner_id','source_message_id','source_sequence','source_revision','source_goal_version','source_digest','message_id','intake_revision','new_digest','request_key','request_digest','created_at']::text[], true),
 ('turn_private.planning_model_dispatches','modelDispatches','erase',array['lease_token']::text[],array['lease_token','turn_id','owner_id','task_id','scope_id','attempt_id','dispatched_at']::text[], true),
 ('turn_private.planning_observations','observations','erase',array['turn_id','action_key']::text[],array['turn_id','action_key','owner_id','observation','created_at']::text[], true),
 ('turn_private.planning_v2_collector_origins','collectorOrigins','erase',array['execution_id']::text[],array['execution_id','scope_id','attempt_id','invocation_id','request_id','request_digest','payload_digest','binding','origin_kind','configured_at','attempted_at','response_buffered_at','unknown_at','configuration_id','configuration_version','endpoint']::text[], false),
 ('turn_private.planning_v2_collector_outputs','collectorOutputs','erase',array['execution_id']::text[],array['execution_id','output_digest','usage_digest','output_wire','usage_receipt_id','usage_wire','recorded_at']::text[], false),
 ('turn_private.planning_v2_completed_receipts','completedReceipts','erase',array['execution_id']::text[],array['execution_id','owner_id','task_id','turn_id','artifact_id','revision','receipt']::text[], true),
 ('turn_private.planning_v2_completion_proofs','completionProofs','erase',array['execution_id']::text[],array['execution_id','transaction_id','owner_id','task_id','turn_id','original_lease','current_lease','intake_digest','planning_digest','action_key','content_digest','artifact_id','scope_id','attempt_id','output_digest','usage_digest','content','created_at']::text[], true),
 ('turn_private.planning_v2_execution_runs','executionRuns','erase',array['id']::text[],array['id','profile_id','profile_revision','owner_id','task_id','turn_id','original_lease','source','intake_digest','planning_digest','collector_principal_id','origin_kind','execution','profile_snapshot','created_at']::text[], true),
 ('turn_private.planning_v2_external_call_windows','callWindows','erase',array['execution_id']::text[],array['execution_id','calls']::text[], false),
 ('turn_private.planning_v2_model_attempt_bindings','attemptBindings','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','claim_lease','text_policy_id','planning_policy_id','scope_id','attempt_id','provider','model','price_version','intake_digest','planning_digest','bound_at','unknown_at']::text[], true),
 ('turn_private.planning_v2_model_local_journal','localJournals','erase',array['request_id']::text[],array['request_id','owner_id','task_id','turn_id','scope_id','attempt_id','binding','payload_digest','request_digest','phase','revision','intent_at','send_at','response_at','unknown_at','send_observation','response_observation','output_wire','unknown_reason']::text[], true),
 ('turn_private.planning_v2_place_checkpoints','checkpoints','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','claim_lease','intake_digest','planning_digest','state','started_at','observation','completed_at']::text[], true),
 ('turn_private.planning_v2_result_claims','resultClaims','erase',array['execution_id']::text[],array['execution_id','action_key','content_digest','lease_token','state']::text[], false),
 ('turn_private.result_artifacts','artifacts','erase',array['id']::text[],array['id','owner_id','task_id','goal_id','input_message_id','trip_id','current_revision','lifecycle','created_at','proposal_id','source_result_id','source_turn_id']::text[], true),
 ('turn_private.result_events','resultEvents','erase',array['id']::text[],array['id','owner_id','artifact_id','revision','event_type','created_at']::text[], true),
 ('turn_private.result_revisions','revisions','erase',array['artifact_id','revision']::text[],array['artifact_id','revision','owner_id','idempotency_key','request_digest','input_sequence','task_turn_id','goal_version','trip_version','memory_basis','content','created_at','trip_link_operation_id','trip_link_version','evidence_basis']::text[], true),
 ('turn_private.service_task_capacity','capacity','retain',array['task_id']::text[],array['task_id','owner_id','policy_version','tier','grant_environment','grant_transaction_id','admitted_at','state','settled_turn_id','settled_at','released_at']::text[], true),
 ('turn_private.service_task_turns','taskTurns','retain',array['turn_id']::text[],array['turn_id','task_id','owner_id','parent_turn_id','relationship','idempotency_key','request_digest']::text[], true),
 ('turn_private.service_tasks','tasks','retain',array['id']::text[],array['id','owner_id','thread_id','goal_turn_id','last_turn_id','policy_id','consent_id','scope_version','expected_result','goal_digest','budget_scope_id','created_at','capacity_enforced']::text[], true),
 ('turn_private.text_content','textBodies','redact',array['turn_id']::text[],array['turn_id','owner_id','thread_id','policy_id','consent_id','locale','input_text','output_kind','output_text','hidden_at','created_at']::text[], true),
 ('turn_private.text_dispatches','textDispatches','retain',array['lease_token']::text[],array['lease_token','turn_id','consent_id','policy_id','dispatched_at']::text[], false),
 ('turn_private.work','work','erase',array['turn_id']::text[],array['turn_id','owner_id','session_id','state','attempt','max_attempts','lease_ms','lease_token','expires_at','created_at','execution_mode']::text[], true),
 ('public.turns','turns','erase',array['id']::text[],array['id','owner_id','trip_id','status','created_at','thread_id','updated_at']::text[], true)
$$;
create function conversation_data_private.reference_kind_v1(k text) returns text language sql immutable set search_path='' as $$
 select case
 when k in('conversation_id','conversationId') then 'conversationIds'
 when k in('thread_id','threadId') then 'threadIds'
 when k in('turn_id','turnId','source_turn_id','sourceTurnId','task_turn_id','taskTurnId','root_turn_id','rootTurnId','goal_turn_id','last_turn_id','parent_turn_id','parentTurnId') then 'turnIds'
 when k in('task_id','taskId') then 'taskIds'
 when k in('goal_id','goalId') then 'goalIds'
 when k in('message_id','messageId','input_message_id','inputMessageId','source_message_id','sourceMessageId','parent_message_id','parentMessageId','intakeMessageId') then 'messageIds'
 when k in('artifact_id','artifactId','source_result_id','sourceResultId') then 'artifactIds'
 else null end
$$;
create function conversation_data_private.entity_kind_v1(t text) returns text language sql immutable set search_path='' as $$
 select case t when 'public.chat_threads' then 'threadIds' when 'public.turns' then 'turnIds'
 when 'turn_private.assistant_conversations' then 'conversationIds' when 'turn_private.assistant_goals' then 'goalIds'
 when 'turn_private.assistant_messages' then 'messageIds' when 'turn_private.service_tasks' then 'taskIds'
 when 'turn_private.result_artifacts' then 'artifactIds' else null end
$$;

-- Known nested JSON relations, including the audited historical-answer edge.
-- This helper emits reference identities only; no copied body/foreign feedback.
create function conversation_data_private.json_references_v1(v jsonb,p_path text[] default array[]::text[]) returns table(kind text,entity_id uuid,path_n text[])
language plpgsql immutable set search_path='' as $$
declare x record;resolved text;scalar_n text;
begin
 if cardinality(p_path)>32 then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
 if jsonb_typeof(v)='object' then
  if v->>'kind'='historical_answer' and notification_private.uuid(v->'id') is true then
   return query select 'turnIds'::text,(v->>'id')::uuid,p_path||array['id'];
  end if;
  if v->>'kind' in('artifact_reference','result_artifact') and notification_private.uuid(v->'id') is true then
   return query select 'artifactIds'::text,(v->>'id')::uuid,p_path||array['id'];
  end if;
  for x in select key,value from jsonb_each(v) order by key collate "C" loop
   resolved:=conversation_data_private.reference_kind_v1(x.key);
   if resolved is not null and x.value<>'null'::jsonb then
    if notification_private.uuid(x.value) is not true then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
    return query select resolved,(x.value#>>'{}')::uuid,p_path||array[x.key];
   elsif jsonb_typeof(x.value) in('object','array') then
    return query select * from conversation_data_private.json_references_v1(x.value,p_path||array[x.key]);
   end if;
  end loop;
 elsif jsonb_typeof(v)='array' then
  for x in select value,ordinality from jsonb_array_elements(v) with ordinality loop
   return query select * from conversation_data_private.json_references_v1(x.value,p_path||array[x.ordinality::text]);
  end loop;
 end if;
end$$;

create function conversation_data_private.row_key_v1(v jsonb,keys_n text[]) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,v->k order by k collate "C") from unnest(keys_n) k
$$;

-- Reconstructed permanent core tombstones: no separately hidden permanent
-- fence table that the same operation inventory cannot disclose/clear transiently.
create function conversation_data_private.fenced_v1(kind_n text,id_n uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from conversation_data_private.operations_v1 r
  where r.scope='conversation-sensitive-data/1' and r.state='erased'
  and r.decision @> jsonb_build_object('graph',jsonb_build_object(kind_n,jsonb_build_array(id_n::text))))
$$;
create function conversation_data_private.proof_v1(owner_n uuid,kind_n text,id_n uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from conversation_data_private.transaction_proofs_v1 p
  where p.transaction_id=pg_current_xact_id() and p.owner_id=owner_n
  and p.expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint and p.graph->kind_n ? id_n::text)
$$;


create function conversation_data_private.zero_counts_v1(effect_n text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,0) from unnest(case effect_n when 'erase' then array['conversations','goals','messages','threads','turns','events','idempotency','feedback','artifacts','revisions','resultEvents','sourceReceipts','intakes','intakeBindings','planning','actionReceipts','observations','modelDispatches','checkpoints','attemptBindings','localJournals','executionRuns','callWindows','collectorOrigins','collectorOutputs','resultClaims','completionProofs','completedReceipts','grounded','assistJobs','work','memoryConsumers','goalLinks']::text[] when 'redact' then array['textBodies','taskDigests']::text[] when 'retain' then array['tasks','taskTurns','capacity','budgetAttempts','textDispatches','goalTripReceipts']::text[] else array[]::text[] end) k
$$;
create function conversation_data_private.empty_graph_v1() returns jsonb language sql immutable set search_path='' as $$ select jsonb_object_agg(k,'[]'::jsonb) from unnest(array['conversationIds','threadIds','turnIds','taskIds','goalIds','messageIds','artifactIds']::text[]) k $$;
create function conversation_data_private.conflicts_v1(v text[]) returns jsonb language sql immutable set search_path='' as $$ select coalesce(jsonb_agg(k order by ordinality),'[]'::jsonb) from unnest(array['SCOPE_TOO_LARGE','ACTIVE_WORK','SHARED_OR_FOREIGN_SCOPE','CROSS_SCOPE_REFERENCE','PROPOSAL_REFERENCE','READINESS_REFERENCE','GUIDE_REFERENCE','SCOPED_EDIT_REFERENCE','NOTIFICATION_REFERENCE','BRIEF_REFERENCE','CORE_EXPORT_COPY','OTHER_DELETE_PENDING','SOURCE_UNSUPPORTED']::text[]) with ordinality a(k,ordinality) where k=any(v) $$;
create function conversation_data_private.schema_supported_v1() returns boolean language plpgsql stable set search_path='' as $$
declare s record;actual_n text[];pk_n text[];foreign_n jsonb;column_specs jsonb;
begin
 for s in select * from conversation_data_private.sources_v1() loop
  if to_regclass(s.relation_name) is null then return false;end if;
  select array_agg(attname::text order by attnum) into actual_n from pg_attribute where attrelid=s.relation_name::regclass and attnum>0 and not attisdropped;
  if actual_n is distinct from s.columns_n then return false;end if;
  select array_agg(a.attname::text order by key.ordinality) into pk_n from pg_constraint c
   cross join lateral unnest(c.conkey) with ordinality key(attnum,ordinality)
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key.attnum where c.conrelid=s.relation_name::regclass and c.contype='p';
  if pk_n is distinct from s.pk then return false;end if;
 end loop;
 select jsonb_object_agg(relation_name,cols) into column_specs from (
  select source_spec.relation_name,jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid::regtype::text,'notNull',a.attnotnull) order by a.attnum) cols
  from conversation_data_private.sources_v1() source_spec join pg_attribute a on a.attrelid=source_spec.relation_name::regclass
  where a.attnum>0 and not a.attisdropped group by source_spec.relation_name
 ) metadata;
 if column_specs is distinct from '{"public.chat_threads":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"trip_id","type":"uuid","notNull":false},{"name":"status","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"updated_at","type":"timestamp with time zone","notNull":true}],"public.chat_turn_events":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"event_id","type":"text","notNull":true},{"name":"sequence","type":"integer","notNull":true},{"name":"schema_version","type":"text","notNull":true},{"name":"event_type","type":"text","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"public.chat_turn_idempotency":[{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"idempotency_key","type":"text","notNull":true},{"name":"digest","type":"text","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"public.memory_consumer_receipts":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"memory_id","type":"uuid","notNull":true},{"name":"source_receipt_id","type":"uuid","notNull":true},{"name":"consumer_kind","type":"text","notNull":true},{"name":"turn_id","type":"uuid","notNull":false},{"name":"proposal_id","type":"uuid","notNull":false},{"name":"constraint_kind","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"public.model_budget_attempts":[{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"provider","type":"text","notNull":true},{"name":"model","type":"text","notNull":true},{"name":"price_version","type":"text","notNull":true},{"name":"reserved_micros","type":"bigint","notNull":true},{"name":"actual_micros","type":"bigint","notNull":false},{"name":"status","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"updated_at","type":"timestamp with time zone","notNull":true}],"public.turn_feedback":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"feedback_kind","type":"text","notNull":true},{"name":"reason_code","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_conversations":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"next_sequence","type":"bigint","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_goal_trip_links":[{"name":"goal_id","type":"uuid","notNull":true},{"name":"conversation_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"link_version","type":"integer","notNull":true},{"name":"goal_scope_version","type":"integer","notNull":true},{"name":"operation_id","type":"uuid","notNull":true},{"name":"trip_id","type":"uuid","notNull":false},{"name":"trip_head_version","type":"integer","notNull":false},{"name":"source_message_id","type":"uuid","notNull":false},{"name":"source_kind","type":"text","notNull":true},{"name":"terminal_unlinked","type":"boolean","notNull":true},{"name":"updated_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_goal_trip_receipts":[{"name":"operation_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"conversation_id","type":"uuid","notNull":true},{"name":"goal_id","type":"uuid","notNull":true},{"name":"session_id","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"action","type":"text","notNull":true},{"name":"source_kind","type":"text","notNull":true},{"name":"source_message_id","type":"uuid","notNull":false},{"name":"before_link_version","type":"integer","notNull":true},{"name":"after_link_version","type":"integer","notNull":true},{"name":"before_goal_scope_version","type":"integer","notNull":true},{"name":"after_goal_scope_version","type":"integer","notNull":true},{"name":"trip_id","type":"uuid","notNull":false},{"name":"trip_head_version","type":"integer","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_goals":[{"name":"id","type":"uuid","notNull":true},{"name":"conversation_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"scope_version","type":"integer","notNull":true},{"name":"current_text","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"trip_terminal","type":"boolean","notNull":true}],"turn_private.assistant_message_source_receipts":[{"name":"message_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"request_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"input_sources","type":"jsonb","notNull":true},{"name":"captured_sources","type":"jsonb","notNull":true},{"name":"accepted_receipt","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_messages":[{"name":"id","type":"uuid","notNull":true},{"name":"conversation_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"sequence","type":"bigint","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"locale","type":"text","notNull":true},{"name":"input_text","type":"text","notNull":true},{"name":"relationship","type":"text","notNull":true},{"name":"goal_id","type":"uuid","notNull":false},{"name":"scope_version","type":"integer","notNull":false},{"name":"task_id","type":"uuid","notNull":false},{"name":"parent_message_id","type":"uuid","notNull":false},{"name":"turn_id","type":"uuid","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_travel_intakes":[{"name":"message_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"conversation_id","type":"uuid","notNull":true},{"name":"goal_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"message_sequence","type":"bigint","notNull":true},{"name":"goal_version","type":"integer","notNull":true},{"name":"intake_revision","type":"integer","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"intake","type":"jsonb","notNull":true},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.grounded_ai_assist_jobs":[{"name":"id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"status","type":"text","notNull":true},{"name":"claim_token","type":"uuid","notNull":true},{"name":"started_at","type":"timestamp with time zone","notNull":false},{"name":"finished_at","type":"timestamp with time zone","notNull":false},{"name":"outcome","type":"jsonb","notNull":false},{"name":"error_code","type":"text","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.grounded_turns":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"city","type":"text","notNull":true},{"name":"locale","type":"text","notNull":true},{"name":"scope_version","type":"integer","notNull":true},{"name":"intent","type":"text","notNull":false},{"name":"request_scope","type":"text","notNull":false},{"name":"original_outcome","type":"text","notNull":false},{"name":"basis","type":"jsonb","notNull":false},{"name":"completed_at","type":"timestamp with time zone","notNull":false},{"name":"unanswered_needs","type":"jsonb","notNull":false},{"name":"place_subject_id","type":"text","notNull":false},{"name":"place_name","type":"text","notNull":false},{"name":"place_resolution","type":"text","notNull":false}],"turn_private.planning_action_receipts":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"message_id","type":"uuid","notNull":true},{"name":"lease_token","type":"uuid","notNull":true},{"name":"tool_id","type":"text","notNull":true},{"name":"input_digest","type":"text","notNull":true},{"name":"basis_digest","type":"text","notNull":true},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"receipt_digest","type":"text","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"updated_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_comparisons":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"goal_id","type":"uuid","notNull":true},{"name":"message_id","type":"uuid","notNull":true},{"name":"goal_version","type":"integer","notNull":true},{"name":"planning_policy_id","type":"uuid","notNull":true},{"name":"planning_consent_id","type":"uuid","notNull":true},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"publication_key","type":"uuid","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_intake_bindings":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"source_message_id","type":"uuid","notNull":true},{"name":"source_sequence","type":"bigint","notNull":true},{"name":"source_revision","type":"integer","notNull":true},{"name":"source_goal_version","type":"integer","notNull":true},{"name":"source_digest","type":"text","notNull":true},{"name":"message_id","type":"uuid","notNull":true},{"name":"intake_revision","type":"integer","notNull":true},{"name":"new_digest","type":"text","notNull":true},{"name":"request_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_model_dispatches":[{"name":"lease_token","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"dispatched_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_observations":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"observation","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_collector_origins":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"invocation_id","type":"uuid","notNull":true},{"name":"request_id","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"payload_digest","type":"text","notNull":true},{"name":"binding","type":"jsonb","notNull":true},{"name":"origin_kind","type":"text","notNull":true},{"name":"configured_at","type":"timestamp with time zone","notNull":true},{"name":"attempted_at","type":"timestamp with time zone","notNull":false},{"name":"response_buffered_at","type":"timestamp with time zone","notNull":false},{"name":"unknown_at","type":"timestamp with time zone","notNull":false},{"name":"configuration_id","type":"uuid","notNull":true},{"name":"configuration_version","type":"integer","notNull":true},{"name":"endpoint","type":"text","notNull":true}],"turn_private.planning_v2_collector_outputs":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"output_digest","type":"text","notNull":true},{"name":"usage_digest","type":"text","notNull":true},{"name":"output_wire","type":"jsonb","notNull":true},{"name":"usage_receipt_id","type":"uuid","notNull":true},{"name":"usage_wire","type":"jsonb","notNull":true},{"name":"recorded_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_completed_receipts":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"revision","type":"integer","notNull":true},{"name":"receipt","type":"jsonb","notNull":true}],"turn_private.planning_v2_completion_proofs":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"transaction_id","type":"xid8","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"original_lease","type":"uuid","notNull":true},{"name":"current_lease","type":"uuid","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"content_digest","type":"text","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"output_digest","type":"text","notNull":true},{"name":"usage_digest","type":"text","notNull":true},{"name":"content","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_execution_runs":[{"name":"id","type":"uuid","notNull":true},{"name":"profile_id","type":"uuid","notNull":true},{"name":"profile_revision","type":"integer","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"original_lease","type":"uuid","notNull":true},{"name":"source","type":"jsonb","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"collector_principal_id","type":"uuid","notNull":true},{"name":"origin_kind","type":"text","notNull":true},{"name":"execution","type":"jsonb","notNull":true},{"name":"profile_snapshot","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_external_call_windows":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"calls","type":"integer","notNull":true}],"turn_private.planning_v2_model_attempt_bindings":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"claim_lease","type":"uuid","notNull":true},{"name":"text_policy_id","type":"uuid","notNull":true},{"name":"planning_policy_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"provider","type":"text","notNull":true},{"name":"model","type":"text","notNull":true},{"name":"price_version","type":"text","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"bound_at","type":"timestamp with time zone","notNull":true},{"name":"unknown_at","type":"timestamp with time zone","notNull":false}],"turn_private.planning_v2_model_local_journal":[{"name":"request_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"binding","type":"jsonb","notNull":true},{"name":"payload_digest","type":"text","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"phase","type":"text","notNull":true},{"name":"revision","type":"bigint","notNull":true},{"name":"intent_at","type":"timestamp with time zone","notNull":true},{"name":"send_at","type":"timestamp with time zone","notNull":false},{"name":"response_at","type":"timestamp with time zone","notNull":false},{"name":"unknown_at","type":"timestamp with time zone","notNull":false},{"name":"send_observation","type":"jsonb","notNull":false},{"name":"response_observation","type":"jsonb","notNull":false},{"name":"output_wire","type":"jsonb","notNull":false},{"name":"unknown_reason","type":"text","notNull":false}],"turn_private.planning_v2_place_checkpoints":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"claim_lease","type":"uuid","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"started_at","type":"timestamp with time zone","notNull":true},{"name":"observation","type":"jsonb","notNull":false},{"name":"completed_at","type":"timestamp with time zone","notNull":false}],"turn_private.planning_v2_result_claims":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"content_digest","type":"text","notNull":true},{"name":"lease_token","type":"uuid","notNull":true},{"name":"state","type":"text","notNull":true}],"turn_private.result_artifacts":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"goal_id","type":"uuid","notNull":true},{"name":"input_message_id","type":"uuid","notNull":true},{"name":"trip_id","type":"uuid","notNull":false},{"name":"current_revision","type":"integer","notNull":true},{"name":"lifecycle","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"proposal_id","type":"uuid","notNull":false},{"name":"source_result_id","type":"uuid","notNull":false},{"name":"source_turn_id","type":"uuid","notNull":false}],"turn_private.result_events":[{"name":"id","type":"bigint","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"revision","type":"integer","notNull":true},{"name":"event_type","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.result_revisions":[{"name":"artifact_id","type":"uuid","notNull":true},{"name":"revision","type":"integer","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"input_sequence","type":"bigint","notNull":true},{"name":"task_turn_id","type":"uuid","notNull":true},{"name":"goal_version","type":"integer","notNull":true},{"name":"trip_version","type":"integer","notNull":false},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"content","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"trip_link_operation_id","type":"uuid","notNull":false},{"name":"trip_link_version","type":"integer","notNull":false},{"name":"evidence_basis","type":"jsonb","notNull":true}],"turn_private.service_task_capacity":[{"name":"task_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"policy_version","type":"text","notNull":true},{"name":"tier","type":"text","notNull":true},{"name":"grant_environment","type":"text","notNull":false},{"name":"grant_transaction_id","type":"text","notNull":false},{"name":"admitted_at","type":"timestamp with time zone","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"settled_turn_id","type":"uuid","notNull":false},{"name":"settled_at","type":"timestamp with time zone","notNull":false},{"name":"released_at","type":"timestamp with time zone","notNull":false}],"turn_private.service_task_turns":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"parent_turn_id","type":"uuid","notNull":false},{"name":"relationship","type":"text","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true}],"turn_private.service_tasks":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"goal_turn_id","type":"uuid","notNull":true},{"name":"last_turn_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"scope_version","type":"integer","notNull":true},{"name":"expected_result","type":"text","notNull":true},{"name":"goal_digest","type":"text","notNull":true},{"name":"budget_scope_id","type":"uuid","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"capacity_enforced","type":"boolean","notNull":true}],"turn_private.text_content":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"locale","type":"text","notNull":true},{"name":"input_text","type":"text","notNull":true},{"name":"output_kind","type":"text","notNull":false},{"name":"output_text","type":"text","notNull":false},{"name":"hidden_at","type":"timestamp with time zone","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.text_dispatches":[{"name":"lease_token","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"dispatched_at","type":"timestamp with time zone","notNull":true}],"turn_private.work":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"session_id","type":"uuid","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"attempt","type":"integer","notNull":true},{"name":"max_attempts","type":"integer","notNull":true},{"name":"lease_ms","type":"integer","notNull":true},{"name":"lease_token","type":"uuid","notNull":false},{"name":"expires_at","type":"timestamp with time zone","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"execution_mode","type":"text","notNull":true}],"public.turns":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"trip_id","type":"uuid","notNull":false},{"name":"status","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"thread_id","type":"uuid","notNull":false},{"name":"updated_at","type":"timestamp with time zone","notNull":true}]}'::jsonb then return false;end if;
 select coalesce(jsonb_agg(jsonb_build_object('from',n.nspname||'.'||r.relname,'to',nf.nspname||'.'||rf.relname,'name',c.conname,
  'definition',replace(pg_get_constraintdef(c.oid),'public.','')) order by n.nspname||'.'||r.relname collate "C",c.conname collate "C"),'[]'::jsonb)
  into foreign_n from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
  join pg_class rf on rf.oid=c.confrelid join pg_namespace nf on nf.oid=rf.relnamespace
  where c.contype='f' and (c.conrelid in(select relation_name::regclass from conversation_data_private.sources_v1())
   or c.confrelid in(select relation_name::regclass from conversation_data_private.sources_v1()));
 return foreign_n='[{"to":"turn_private.text_content","from":"guide_private.bindings_v1","name":"bindings_v1_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.text_content(turn_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED"},{"to":"auth.users","from":"public.chat_threads","name":"chat_threads_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.trips","from":"public.chat_threads","name":"chat_threads_trip_id_fkey","definition":"FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL"},{"to":"auth.users","from":"public.chat_turn_events","name":"chat_turn_events_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.chat_threads","from":"public.chat_turn_events","name":"chat_turn_events_thread_id_fkey","definition":"FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE"},{"to":"public.turns","from":"public.chat_turn_events","name":"chat_turn_events_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE"},{"to":"auth.users","from":"public.chat_turn_idempotency","name":"chat_turn_idempotency_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.chat_threads","from":"public.chat_turn_idempotency","name":"chat_turn_idempotency_thread_id_fkey","definition":"FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE"},{"to":"public.turns","from":"public.chat_turn_idempotency","name":"chat_turn_idempotency_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE"},{"to":"public.memory_profiles","from":"public.memory_consumer_receipts","name":"memory_consumer_receipts_memory_id_fkey","definition":"FOREIGN KEY (memory_id) REFERENCES memory_profiles(id) ON DELETE RESTRICT"},{"to":"auth.users","from":"public.memory_consumer_receipts","name":"memory_consumer_receipts_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.trip_proposals","from":"public.memory_consumer_receipts","name":"memory_consumer_receipts_proposal_id_owner_id_fkey","definition":"FOREIGN KEY (proposal_id, owner_id) REFERENCES trip_proposals(id, owner_id) ON DELETE CASCADE"},{"to":"public.memory_receipts","from":"public.memory_consumer_receipts","name":"memory_consumer_receipts_source_receipt_id_fkey","definition":"FOREIGN KEY (source_receipt_id) REFERENCES memory_receipts(id) ON DELETE RESTRICT"},{"to":"public.memory_receipts","from":"public.memory_consumer_receipts","name":"memory_consumer_receipts_source_receipt_id_memory_id_owner_fkey","definition":"FOREIGN KEY (source_receipt_id, memory_id, owner_id) REFERENCES memory_receipts(id, memory_id, owner_id) ON DELETE RESTRICT"},{"to":"public.turns","from":"public.memory_consumer_receipts","name":"memory_consumer_receipts_turn_id_owner_id_fkey","definition":"FOREIGN KEY (turn_id, owner_id) REFERENCES turns(id, owner_id) ON DELETE CASCADE"},{"to":"public.model_budget_provider_limits","from":"public.model_budget_attempts","name":"model_budget_attempts_scope_id_provider_fkey","definition":"FOREIGN KEY (scope_id, provider) REFERENCES model_budget_provider_limits(scope_id, provider) ON DELETE RESTRICT"},{"to":"auth.users","from":"public.turn_feedback","name":"turn_feedback_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.chat_threads","from":"public.turn_feedback","name":"turn_feedback_thread_id_fkey","definition":"FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE"},{"to":"public.turns","from":"public.turn_feedback","name":"turn_feedback_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE"},{"to":"auth.users","from":"public.turns","name":"turns_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.chat_threads","from":"public.turns","name":"turns_thread_id_fkey","definition":"FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE"},{"to":"public.trips","from":"public.turns","name":"turns_trip_id_fkey","definition":"FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL"},{"to":"turn_private.assistant_conversations","from":"readiness_private.scopes_v1","name":"scopes_v1_conversation_id_fkey","definition":"FOREIGN KEY (conversation_id) REFERENCES turn_private.assistant_conversations(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_goals","from":"readiness_private.scopes_v1","name":"scopes_v1_goal_id_fkey","definition":"FOREIGN KEY (goal_id) REFERENCES turn_private.assistant_goals(id) ON DELETE CASCADE"},{"to":"public.turns","from":"readiness_private.scopes_v1","name":"scopes_v1_root_turn_id_fkey","definition":"FOREIGN KEY (root_turn_id) REFERENCES turns(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_messages","from":"readiness_private.scopes_v1","name":"scopes_v1_source_message_id_fkey","definition":"FOREIGN KEY (source_message_id) REFERENCES turn_private.assistant_messages(id) ON DELETE CASCADE"},{"to":"turn_private.service_tasks","from":"readiness_private.scopes_v1","name":"scopes_v1_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"public.turns","from":"readiness_private.scopes_v1","name":"scopes_v1_task_turn_id_fkey","definition":"FOREIGN KEY (task_turn_id) REFERENCES turns(id) ON DELETE CASCADE"},{"to":"public.chat_threads","from":"readiness_private.scopes_v1","name":"scopes_v1_thread_id_fkey","definition":"FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE"},{"to":"turn_private.service_tasks","from":"scoped_edit_private.work_v1","name":"work_v1_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.work","from":"scoped_edit_private.work_v1","name":"work_v1_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.work(turn_id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.assistant_conversations","name":"assistant_conversations_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.text_policies","from":"turn_private.assistant_conversations","name":"assistant_conversations_policy_id_fkey","definition":"FOREIGN KEY (policy_id) REFERENCES turn_private.text_policies(id)"},{"to":"turn_private.assistant_conversations","from":"turn_private.assistant_goal_trip_links","name":"assistant_goal_trip_links_conversation_id_fkey","definition":"FOREIGN KEY (conversation_id) REFERENCES turn_private.assistant_conversations(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_goals","from":"turn_private.assistant_goal_trip_links","name":"assistant_goal_trip_links_goal_id_fkey","definition":"FOREIGN KEY (goal_id) REFERENCES turn_private.assistant_goals(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.assistant_goal_trip_links","name":"assistant_goal_trip_links_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.trips","from":"turn_private.assistant_goal_trip_links","name":"assistant_goal_trip_links_trip_id_fkey","definition":"FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT"},{"to":"auth.users","from":"turn_private.assistant_goal_trip_receipts","name":"assistant_goal_trip_receipts_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.trips","from":"turn_private.assistant_goal_trip_receipts","name":"assistant_goal_trip_receipts_trip_id_fkey","definition":"FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL"},{"to":"turn_private.assistant_conversations","from":"turn_private.assistant_goals","name":"assistant_goals_conversation_id_fkey","definition":"FOREIGN KEY (conversation_id) REFERENCES turn_private.assistant_conversations(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.assistant_goals","name":"assistant_goals_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_messages","from":"turn_private.assistant_message_source_receipts","name":"assistant_message_source_receipts_message_id_fkey","definition":"FOREIGN KEY (message_id) REFERENCES turn_private.assistant_messages(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.assistant_message_source_receipts","name":"assistant_message_source_receipts_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_conversations","from":"turn_private.assistant_messages","name":"assistant_messages_conversation_id_fkey","definition":"FOREIGN KEY (conversation_id) REFERENCES turn_private.assistant_conversations(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_goals","from":"turn_private.assistant_messages","name":"assistant_messages_goal_id_fkey","definition":"FOREIGN KEY (goal_id) REFERENCES turn_private.assistant_goals(id)"},{"to":"auth.users","from":"turn_private.assistant_messages","name":"assistant_messages_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_messages","from":"turn_private.assistant_messages","name":"assistant_messages_parent_message_id_fkey","definition":"FOREIGN KEY (parent_message_id) REFERENCES turn_private.assistant_messages(id)"},{"to":"turn_private.text_policies","from":"turn_private.assistant_messages","name":"assistant_messages_policy_id_fkey","definition":"FOREIGN KEY (policy_id) REFERENCES turn_private.text_policies(id)"},{"to":"turn_private.service_tasks","from":"turn_private.assistant_messages","name":"assistant_messages_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id)"},{"to":"turn_private.text_content","from":"turn_private.assistant_messages","name":"assistant_messages_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.text_content(turn_id)"},{"to":"turn_private.assistant_conversations","from":"turn_private.assistant_travel_intakes","name":"assistant_travel_intakes_conversation_id_fkey","definition":"FOREIGN KEY (conversation_id) REFERENCES turn_private.assistant_conversations(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_goals","from":"turn_private.assistant_travel_intakes","name":"assistant_travel_intakes_goal_id_fkey","definition":"FOREIGN KEY (goal_id) REFERENCES turn_private.assistant_goals(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_messages","from":"turn_private.assistant_travel_intakes","name":"assistant_travel_intakes_message_id_fkey","definition":"FOREIGN KEY (message_id) REFERENCES turn_private.assistant_messages(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.assistant_travel_intakes","name":"assistant_travel_intakes_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.text_policies","from":"turn_private.assistant_travel_intakes","name":"assistant_travel_intakes_policy_id_fkey","definition":"FOREIGN KEY (policy_id) REFERENCES turn_private.text_policies(id)"},{"to":"turn_private.grounded_turns","from":"turn_private.grounded_ai_assist_jobs","name":"grounded_ai_assist_jobs_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.grounded_turns(turn_id) DEFERRABLE INITIALLY DEFERRED"},{"to":"turn_private.service_tasks","from":"turn_private.grounded_turns","name":"grounded_turns_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) DEFERRABLE INITIALLY DEFERRED"},{"to":"turn_private.text_content","from":"turn_private.grounded_turns","name":"grounded_turns_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.text_content(turn_id) DEFERRABLE INITIALLY DEFERRED"},{"to":"turn_private.assistant_messages","from":"turn_private.planning_action_receipts","name":"planning_action_receipts_message_id_fkey","definition":"FOREIGN KEY (message_id) REFERENCES turn_private.assistant_messages(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_action_receipts","name":"planning_action_receipts_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.service_tasks","from":"turn_private.planning_action_receipts","name":"planning_action_receipts_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.work","from":"turn_private.planning_action_receipts","name":"planning_action_receipts_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.work(turn_id) ON DELETE CASCADE"},{"to":"turn_private.assistant_goals","from":"turn_private.planning_comparisons","name":"planning_comparisons_goal_id_fkey","definition":"FOREIGN KEY (goal_id) REFERENCES turn_private.assistant_goals(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_messages","from":"turn_private.planning_comparisons","name":"planning_comparisons_message_id_fkey","definition":"FOREIGN KEY (message_id) REFERENCES turn_private.assistant_messages(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_comparisons","name":"planning_comparisons_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.planning_policies","from":"turn_private.planning_comparisons","name":"planning_comparisons_planning_policy_id_fkey","definition":"FOREIGN KEY (planning_policy_id) REFERENCES turn_private.planning_policies(id)"},{"to":"turn_private.service_tasks","from":"turn_private.planning_comparisons","name":"planning_comparisons_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.work","from":"turn_private.planning_comparisons","name":"planning_comparisons_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.work(turn_id) ON DELETE CASCADE"},{"to":"turn_private.assistant_travel_intakes","from":"turn_private.planning_intake_bindings","name":"planning_intake_bindings_message_id_fkey","definition":"FOREIGN KEY (message_id) REFERENCES turn_private.assistant_travel_intakes(message_id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_intake_bindings","name":"planning_intake_bindings_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_messages","from":"turn_private.planning_intake_bindings","name":"planning_intake_bindings_source_message_id_fkey","definition":"FOREIGN KEY (source_message_id) REFERENCES turn_private.assistant_messages(id) ON DELETE CASCADE"},{"to":"turn_private.planning_comparisons","from":"turn_private.planning_intake_bindings","name":"planning_intake_bindings_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.planning_comparisons(turn_id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_model_dispatches","name":"planning_model_dispatches_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.service_tasks","from":"turn_private.planning_model_dispatches","name":"planning_model_dispatches_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.work","from":"turn_private.planning_model_dispatches","name":"planning_model_dispatches_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.work(turn_id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_observations","name":"planning_observations_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.planning_action_receipts","from":"turn_private.planning_observations","name":"planning_observations_turn_id_action_key_fkey","definition":"FOREIGN KEY (turn_id, action_key) REFERENCES turn_private.planning_action_receipts(turn_id, action_key) ON DELETE CASCADE"},{"to":"turn_private.planning_v2_execution_runs","from":"turn_private.planning_v2_collector_origins","name":"planning_v2_collector_origins_execution_id_fkey","definition":"FOREIGN KEY (execution_id) REFERENCES turn_private.planning_v2_execution_runs(id) ON DELETE CASCADE"},{"to":"public.model_budget_attempts","from":"turn_private.planning_v2_collector_origins","name":"planning_v2_collector_origins_scope_id_attempt_id_fkey","definition":"FOREIGN KEY (scope_id, attempt_id) REFERENCES model_budget_attempts(scope_id, attempt_id) ON DELETE CASCADE"},{"to":"turn_private.planning_v2_collector_origins","from":"turn_private.planning_v2_collector_outputs","name":"planning_v2_collector_outputs_execution_id_fkey","definition":"FOREIGN KEY (execution_id) REFERENCES turn_private.planning_v2_collector_origins(execution_id) ON DELETE CASCADE"},{"to":"turn_private.planning_v2_completion_proofs","from":"turn_private.planning_v2_completed_receipts","name":"planning_v2_completed_receipts_execution_id_fkey","definition":"FOREIGN KEY (execution_id) REFERENCES turn_private.planning_v2_completion_proofs(execution_id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_v2_completed_receipts","name":"planning_v2_completed_receipts_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.planning_v2_execution_runs","from":"turn_private.planning_v2_completion_proofs","name":"planning_v2_completion_proofs_execution_id_fkey","definition":"FOREIGN KEY (execution_id) REFERENCES turn_private.planning_v2_execution_runs(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_v2_completion_proofs","name":"planning_v2_completion_proofs_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_v2_execution_runs","name":"planning_v2_execution_runs_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.planning_v2_execution_profiles","from":"turn_private.planning_v2_execution_runs","name":"planning_v2_execution_runs_profile_id_fkey","definition":"FOREIGN KEY (profile_id) REFERENCES turn_private.planning_v2_execution_profiles(id)"},{"to":"turn_private.service_tasks","from":"turn_private.planning_v2_execution_runs","name":"planning_v2_execution_runs_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.planning_comparisons","from":"turn_private.planning_v2_execution_runs","name":"planning_v2_execution_runs_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.planning_comparisons(turn_id) ON DELETE CASCADE"},{"to":"turn_private.planning_v2_execution_runs","from":"turn_private.planning_v2_external_call_windows","name":"planning_v2_external_call_windows_execution_id_fkey","definition":"FOREIGN KEY (execution_id) REFERENCES turn_private.planning_v2_execution_runs(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_v2_model_attempt_bindings","name":"planning_v2_model_attempt_bindings_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.planning_policies","from":"turn_private.planning_v2_model_attempt_bindings","name":"planning_v2_model_attempt_bindings_planning_policy_id_fkey","definition":"FOREIGN KEY (planning_policy_id) REFERENCES turn_private.planning_policies(id)"},{"to":"public.model_budget_attempts","from":"turn_private.planning_v2_model_attempt_bindings","name":"planning_v2_model_attempt_bindings_scope_id_attempt_id_fkey","definition":"FOREIGN KEY (scope_id, attempt_id) REFERENCES model_budget_attempts(scope_id, attempt_id) ON DELETE CASCADE"},{"to":"turn_private.service_tasks","from":"turn_private.planning_v2_model_attempt_bindings","name":"planning_v2_model_attempt_bindings_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.text_policies","from":"turn_private.planning_v2_model_attempt_bindings","name":"planning_v2_model_attempt_bindings_text_policy_id_fkey","definition":"FOREIGN KEY (text_policy_id) REFERENCES turn_private.text_policies(id)"},{"to":"turn_private.planning_comparisons","from":"turn_private.planning_v2_model_attempt_bindings","name":"planning_v2_model_attempt_bindings_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.planning_comparisons(turn_id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_v2_model_local_journal","name":"planning_v2_model_local_journal_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.model_budget_attempts","from":"turn_private.planning_v2_model_local_journal","name":"planning_v2_model_local_journal_scope_id_attempt_id_fkey","definition":"FOREIGN KEY (scope_id, attempt_id) REFERENCES model_budget_attempts(scope_id, attempt_id) ON DELETE CASCADE"},{"to":"turn_private.service_tasks","from":"turn_private.planning_v2_model_local_journal","name":"planning_v2_model_local_journal_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.planning_comparisons","from":"turn_private.planning_v2_model_local_journal","name":"planning_v2_model_local_journal_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.planning_comparisons(turn_id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.planning_v2_place_checkpoints","name":"planning_v2_place_checkpoints_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.service_tasks","from":"turn_private.planning_v2_place_checkpoints","name":"planning_v2_place_checkpoints_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id) ON DELETE CASCADE"},{"to":"turn_private.planning_comparisons","from":"turn_private.planning_v2_place_checkpoints","name":"planning_v2_place_checkpoints_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.planning_comparisons(turn_id) ON DELETE CASCADE"},{"to":"turn_private.planning_v2_execution_runs","from":"turn_private.planning_v2_result_claims","name":"planning_v2_result_claims_execution_id_fkey","definition":"FOREIGN KEY (execution_id) REFERENCES turn_private.planning_v2_execution_runs(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_goals","from":"turn_private.result_artifacts","name":"result_artifacts_goal_id_fkey","definition":"FOREIGN KEY (goal_id) REFERENCES turn_private.assistant_goals(id) ON DELETE CASCADE"},{"to":"turn_private.assistant_messages","from":"turn_private.result_artifacts","name":"result_artifacts_input_message_id_fkey","definition":"FOREIGN KEY (input_message_id) REFERENCES turn_private.assistant_messages(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.result_artifacts","name":"result_artifacts_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.trip_proposals","from":"turn_private.result_artifacts","name":"result_artifacts_proposal_id_fkey","definition":"FOREIGN KEY (proposal_id) REFERENCES trip_proposals(id) ON DELETE CASCADE"},{"to":"turn_private.result_artifacts","from":"turn_private.result_artifacts","name":"result_artifacts_source_result_id_fkey","definition":"FOREIGN KEY (source_result_id) REFERENCES turn_private.result_artifacts(id) ON DELETE CASCADE"},{"to":"public.turns","from":"turn_private.result_artifacts","name":"result_artifacts_source_turn_id_fkey","definition":"FOREIGN KEY (source_turn_id) REFERENCES turns(id) ON DELETE CASCADE"},{"to":"public.trips","from":"turn_private.result_artifacts","name":"result_artifacts_trip_id_fkey","definition":"FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE"},{"to":"turn_private.result_artifacts","from":"turn_private.result_events","name":"result_events_artifact_id_fkey","definition":"FOREIGN KEY (artifact_id) REFERENCES turn_private.result_artifacts(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.result_events","name":"result_events_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.result_artifacts","from":"turn_private.result_revisions","name":"result_revisions_artifact_id_fkey","definition":"FOREIGN KEY (artifact_id) REFERENCES turn_private.result_artifacts(id) ON DELETE CASCADE"},{"to":"auth.users","from":"turn_private.result_revisions","name":"result_revisions_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"turn_private.text_content","from":"turn_private.result_revisions","name":"result_revisions_task_turn_id_fkey","definition":"FOREIGN KEY (task_turn_id) REFERENCES turn_private.text_content(turn_id)"},{"to":"turn_private.service_tasks","from":"turn_private.service_task_capacity","name":"service_task_capacity_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id)"},{"to":"turn_private.text_content","from":"turn_private.service_task_turns","name":"service_task_turns_parent_turn_id_fkey","definition":"FOREIGN KEY (parent_turn_id) REFERENCES turn_private.text_content(turn_id)"},{"to":"turn_private.service_tasks","from":"turn_private.service_task_turns","name":"service_task_turns_task_id_fkey","definition":"FOREIGN KEY (task_id) REFERENCES turn_private.service_tasks(id)"},{"to":"turn_private.text_content","from":"turn_private.service_task_turns","name":"service_task_turns_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turn_private.text_content(turn_id) DEFERRABLE INITIALLY DEFERRED"},{"to":"turn_private.text_content","from":"turn_private.service_tasks","name":"service_tasks_goal_turn_id_fkey","definition":"FOREIGN KEY (goal_turn_id) REFERENCES turn_private.text_content(turn_id) DEFERRABLE INITIALLY DEFERRED"},{"to":"turn_private.text_content","from":"turn_private.service_tasks","name":"service_tasks_last_turn_id_fkey","definition":"FOREIGN KEY (last_turn_id) REFERENCES turn_private.text_content(turn_id) DEFERRABLE INITIALLY DEFERRED"},{"to":"turn_private.text_policies","from":"turn_private.service_tasks","name":"service_tasks_policy_id_fkey","definition":"FOREIGN KEY (policy_id) REFERENCES turn_private.text_policies(id)"},{"to":"turn_private.text_policies","from":"turn_private.text_content","name":"text_content_policy_id_fkey","definition":"FOREIGN KEY (policy_id) REFERENCES turn_private.text_policies(id)"},{"to":"auth.users","from":"turn_private.work","name":"work_owner_id_fkey","definition":"FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"to":"public.turns","from":"turn_private.work","name":"work_turn_id_fkey","definition":"FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE"}]'::jsonb;
end$$;
create function conversation_data_private.clear_proof_required_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from conversation_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id())
  then raise exception 'CONVERSATION_CONFLICT';end if;
 return null;
end$$;
create constraint trigger conversation_proof_must_exit_v1 after insert or update on conversation_data_private.transaction_proofs_v1
 deferrable initially deferred for each row execute function conversation_data_private.clear_proof_required_v1();

create function conversation_data_private.immutable_operation_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare authority_n boolean;
begin
 if tg_op='DELETE' then
  -- Original owner account cascade is allowed; session deletion cannot get here.
  if exists(select 1 from auth.users where id=old.owner_id) then raise exception 'CONVERSATION_CONFLICT';end if;
  return old;
 end if;
 if row(new.request_id,new.owner_id,new.session_id,new.mobile_epoch,new.scope,new.root_kind,new.root_id,new.object_ids,new.source_digest,new.preview_digest,new.source_authorities,new.captured_at,new.expires_at)
  is distinct from row(old.request_id,old.owner_id,old.session_id,old.mobile_epoch,old.scope,old.root_kind,old.root_id,old.object_ids,old.source_digest,old.preview_digest,old.source_authorities,old.captured_at,old.expires_at)
  then raise exception 'CONVERSATION_CONFLICT';end if;
 if old.request_digest is not null and (new.request_digest is distinct from old.request_digest or new.decision is distinct from old.decision or new.state is distinct from old.state)
  then raise exception 'CONVERSATION_CONFLICT';end if;
 if old.preview_erased and (not new.preview_erased or new.graph is not null or new.erase_counts is not null or new.redact_counts is not null
  or new.retain_counts is not null or new.retained_references is not null or new.conflicts is not null) then raise exception 'CONVERSATION_CONFLICT';end if;
 if not old.preview_erased and not new.preview_erased then
  if row(new.graph,new.erase_counts,new.redact_counts,new.retain_counts,new.retained_references,new.conflicts)
   is distinct from row(old.graph,old.erase_counts,old.redact_counts,old.retain_counts,old.retained_references,old.conflicts)
   then raise exception 'CONVERSATION_CONFLICT';end if;
 end if;
 select exists(select 1 from conversation_data_private.transaction_proofs_v1 p
  join conversation_data_private.operations_v1 request_n on request_n.request_id=p.request_id and request_n.owner_id=p.owner_id
  where p.transaction_id=pg_current_xact_id() and p.owner_id=old.owner_id and p.source_digest=request_n.source_digest
  and p.expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint
  and (p.request_id=old.request_id or (request_n.scope='conversation-delete-progress/1' and old.request_id=any(request_n.object_ids)))) into authority_n;
 if authority_n is not true then raise exception 'CONVERSATION_CONFLICT';end if;
 return new;
end$$;
create trigger conversation_operation_immutable_v1 before update or delete on conversation_data_private.operations_v1
 for each row execute function conversation_data_private.immutable_operation_v1();

create function conversation_data_private.union_ids_v1(v uuid[]) returns uuid[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(id order by id),array[]::uuid[]) from(select distinct id from unnest(v) id where id is not null) actual
$$;

-- Actual owned forward graph plus exclusively scoped reverse result closure.
-- No fixed two-pass assumption; no source body or foreign ID is returned.
create function conversation_data_private.closure_v1(u uuid,root_kind_n text,root_id_n uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare conversations uuid[]:=array[]::uuid[];threads uuid[]:=array[]::uuid[];turns uuid[]:=array[]::uuid[];
 tasks uuid[]:=array[]::uuid[];goals uuid[]:=array[]::uuid[];messages uuid[]:=array[]::uuid[];artifacts uuid[]:=array[]::uuid[];
 previous_n jsonb;graph_n jsonb;extra_n uuid[];pass_n integer:=0;conflicts_n text[]:=array[]::text[];
begin
 if root_kind_n='conversation' then
  perform 1 from turn_private.assistant_conversations where id=root_id_n and owner_id=u;
  if not found then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
  conversations:=array[root_id_n];
  select coalesce(array_agg(id order by id),array[]::uuid[]) into goals from
   (select id from turn_private.assistant_goals where conversation_id=root_id_n and owner_id=u order by id limit 10001) source_rows;
  select coalesce(array_agg(id order by id),array[]::uuid[]) into messages from
   (select id from turn_private.assistant_messages where conversation_id=root_id_n and owner_id=u order by id limit 10001) source_rows;
  if exists(select 1 from turn_private.assistant_goals where conversation_id=root_id_n and owner_id<>u)
   or exists(select 1 from turn_private.assistant_messages where conversation_id=root_id_n and owner_id<>u) then
   conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];
  end if;
 elsif root_kind_n='thread' then
  perform 1 from public.chat_threads where id=root_id_n and owner_id=u;
  if not found then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
  threads:=array[root_id_n];
 else raise exception 'INVALID_INPUT';end if;
 loop
  previous_n:=jsonb_build_array(threads,turns,tasks,artifacts);
  pass_n:=pass_n+1;
  if pass_n>4100 or cardinality(conversations)+cardinality(threads)+cardinality(turns)+cardinality(tasks)+cardinality(goals)+cardinality(messages)+cardinality(artifacts)>4100 then
   return jsonb_build_object('graph',jsonb_set(conversation_data_private.empty_graph_v1(),array[case root_kind_n when 'conversation' then 'conversationIds' else 'threadIds' end],to_jsonb(array[root_id_n])),
    'conflicts','["SCOPE_TOO_LARGE"]'::jsonb);
  end if;
  select array_agg(task_id) into extra_n from turn_private.assistant_messages where id=any(messages) and owner_id=u;
  tasks:=conversation_data_private.union_ids_v1(tasks||coalesce(extra_n,array[]::uuid[]));
  select array_agg(turn_id) into extra_n from turn_private.assistant_messages where id=any(messages) and owner_id=u;
  turns:=conversation_data_private.union_ids_v1(turns||coalesce(extra_n,array[]::uuid[]));
  select array_agg(task_id) into extra_n from turn_private.service_task_turns where turn_id=any(turns) and owner_id=u;
  tasks:=conversation_data_private.union_ids_v1(tasks||coalesce(extra_n,array[]::uuid[]));
  select array_agg(id) into extra_n from turn_private.service_tasks where thread_id=any(threads) and owner_id=u;
  tasks:=conversation_data_private.union_ids_v1(tasks||coalesce(extra_n,array[]::uuid[]));
  select array_agg(thread_id) into extra_n from turn_private.service_tasks where id=any(tasks) and owner_id=u;
  threads:=conversation_data_private.union_ids_v1(threads||coalesce(extra_n,array[]::uuid[]));
  select array_agg(turn_id) into extra_n from turn_private.service_task_turns where task_id=any(tasks) and owner_id=u;
  turns:=conversation_data_private.union_ids_v1(turns||coalesce(extra_n,array[]::uuid[]));
  select array_agg(id) into extra_n from public.turns where thread_id=any(threads) and owner_id=u;
  turns:=conversation_data_private.union_ids_v1(turns||coalesce(extra_n,array[]::uuid[]));
  select array_agg(turn_id) into extra_n from turn_private.text_content where (turn_id=any(turns) or thread_id=any(threads)) and owner_id=u;
  turns:=conversation_data_private.union_ids_v1(turns||coalesce(extra_n,array[]::uuid[]));
  select array_agg(thread_id) into extra_n from turn_private.text_content where turn_id=any(turns) and owner_id=u;
  threads:=conversation_data_private.union_ids_v1(threads||coalesce(extra_n,array[]::uuid[]));
  select array_agg(id) into extra_n from turn_private.result_artifacts a where a.owner_id=u
   and (a.task_id=any(tasks) or a.goal_id=any(goals) or a.input_message_id=any(messages) or a.source_turn_id=any(turns) or a.source_result_id=any(artifacts))
   and (a.goal_id is null or a.goal_id=any(goals)) and (a.input_message_id is null or a.input_message_id=any(messages));
  artifacts:=conversation_data_private.union_ids_v1(artifacts||coalesce(extra_n,array[]::uuid[]));
  select array_agg(task_id) into extra_n from turn_private.result_artifacts where id=any(artifacts) and owner_id=u;
  tasks:=conversation_data_private.union_ids_v1(tasks||coalesce(extra_n,array[]::uuid[]));
  select array_agg(source_turn_id) into extra_n from turn_private.result_artifacts where id=any(artifacts) and owner_id=u;
  turns:=conversation_data_private.union_ids_v1(turns||coalesce(extra_n,array[]::uuid[]));
  select array_agg(task_turn_id) into extra_n from turn_private.result_revisions where artifact_id=any(artifacts) and owner_id=u;
  turns:=conversation_data_private.union_ids_v1(turns||coalesce(extra_n,array[]::uuid[]));
  select array_agg(turn_id) into extra_n from turn_private.planning_comparisons where owner_id=u
   and (task_id=any(tasks) or message_id=any(messages) or goal_id=any(goals));
  turns:=conversation_data_private.union_ids_v1(turns||coalesce(extra_n,array[]::uuid[]));
  select array_agg(task_id) into extra_n from turn_private.planning_comparisons where owner_id=u and turn_id=any(turns);
  tasks:=conversation_data_private.union_ids_v1(tasks||coalesce(extra_n,array[]::uuid[]));
  exit when previous_n=jsonb_build_array(threads,turns,tasks,artifacts);
 end loop;
 if cardinality(conversations)+cardinality(threads)+cardinality(turns)+cardinality(tasks)+cardinality(goals)+cardinality(messages)+cardinality(artifacts)>4100 then
  return jsonb_build_object('graph',jsonb_set(conversation_data_private.empty_graph_v1(),array[case root_kind_n when 'conversation' then 'conversationIds' else 'threadIds' end],to_jsonb(array[root_id_n])),
   'conflicts','["SCOPE_TOO_LARGE"]'::jsonb);
 end if;
 -- All collected identities must be actual owned rows. Unknown/retained orphan
 -- text is never silently dropped; root/last/task-parent relations must close.
 if exists(select 1 from unnest(tasks) requested(id) where not exists(select 1 from turn_private.service_tasks s where s.id=requested.id and s.owner_id=u))
  or exists(select 1 from unnest(turns) requested(id) where not exists(select 1 from public.turns t where t.id=requested.id and t.owner_id=u))
  or exists(select 1 from turn_private.service_tasks where id=any(tasks) and owner_id=u and (not goal_turn_id=any(turns) or not last_turn_id=any(turns)))
  or exists(select 1 from turn_private.service_task_turns where task_id=any(tasks) and owner_id=u and parent_turn_id is not null and not parent_turn_id=any(turns))
  then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if exists(select 1 from public.turns where thread_id=any(threads) and owner_id<>u)
  or exists(select 1 from turn_private.text_content where thread_id=any(threads) and owner_id<>u)
  or exists(select 1 from turn_private.service_tasks where thread_id=any(threads) and owner_id<>u)
  then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 if exists(select 1 from turn_private.assistant_messages m
  left join turn_private.service_task_turns l on l.turn_id=m.turn_id
  left join turn_private.service_tasks s on s.id=coalesce(m.task_id,l.task_id)
  where (m.task_id=any(tasks) or m.turn_id=any(turns) or m.goal_id=any(goals) or s.thread_id=any(threads))
  and (root_kind_n='thread' or m.conversation_id<>root_id_n or m.owner_id<>u)) then
  conflicts_n:=conflicts_n||case root_kind_n when 'thread' then 'CROSS_SCOPE_REFERENCE' else 'SHARED_OR_FOREIGN_SCOPE' end;
 end if;
 if exists(select 1 from turn_private.assistant_messages where id=any(messages) and parent_message_id is not null and not parent_message_id=any(messages))
  or exists(select 1 from turn_private.assistant_messages where not id=any(messages) and parent_message_id=any(messages))
  or exists(select 1 from turn_private.result_artifacts a where not a.id=any(artifacts)
   and (a.task_id=any(tasks) or a.goal_id=any(goals) or a.input_message_id=any(messages) or a.source_turn_id=any(turns) or a.source_result_id=any(artifacts)))
  then conflicts_n:=conflicts_n||array['CROSS_SCOPE_REFERENCE'];end if;
 -- An owned row may contain a corrupt foreign parent UUID; do not expose that
 -- UUID as a selected entity in conflict feedback.
 if exists(select 1 from unnest(tasks) requested(id) join turn_private.service_tasks actual on actual.id=requested.id where actual.owner_id<>u)
  or exists(select 1 from unnest(turns) requested(id) join turn_private.text_content actual on actual.turn_id=requested.id where actual.owner_id<>u)
  then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into tasks from turn_private.service_tasks where id=any(tasks) and owner_id=u;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into threads from public.chat_threads where id=any(threads) and owner_id=u;
 select coalesce(array_agg(requested.id order by requested.id),array[]::uuid[]) into turns from unnest(turns) requested(id)
  where exists(select 1 from public.turns actual where actual.id=requested.id and actual.owner_id=u)
   or exists(select 1 from turn_private.text_content actual where actual.turn_id=requested.id and actual.owner_id=u);
 graph_n:=jsonb_build_object('conversationIds',conversations,'threadIds',threads,'turnIds',turns,'taskIds',tasks,'goalIds',goals,'messageIds',messages,'artifactIds',artifacts);
 return jsonb_build_object('graph',graph_n,'conflicts',conversation_data_private.conflicts_v1(conflicts_n));
end$$;

create function conversation_data_private.authorities_shape_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare a jsonb;previous_n text;k text;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>100 then return false;end if;
 for a in select value from jsonb_array_elements(v) loop
  if notification_private.exact(a,array['policyId','consentId']) is not true
   or notification_private.uuid(a->'policyId') is not true or notification_private.uuid(a->'consentId') is not true then return false;end if;
  k:=a->>'policyId'||':'||(a->>'consentId');
  if previous_n is not null and previous_n collate "C">=k collate "C" then return false;end if;previous_n:=k;
 end loop;return true;
end$$;
alter table conversation_data_private.operations_v1 add constraint original_source_authorities_shape_v1
 check(conversation_data_private.authorities_shape_v1(source_authorities));

create function conversation_data_private.authorities_union_v1(v jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(a order by a->>'policyId' collate "C",a->>'consentId' collate "C"),'[]'::jsonb)
 from(select distinct a from jsonb_array_elements(v) a) unique_pairs
$$;

-- Requalify the EXACT original pair, never any replacement owner consent.
-- UUID collision across policy domains must satisfy every exact matching realm;
-- a live unrelated realm cannot mask revocation of the original pair.
create function conversation_data_private.authorities_current_v1(u uuid,v jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;p uuid;c uuid;matched_n integer;witness_n jsonb:='[]';policy_n jsonb;consent_n jsonb;
begin
 if conversation_data_private.authorities_shape_v1(v) is not true then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
 for a in select value from jsonb_array_elements(v) loop
  p:=(a->>'policyId')::uuid;c:=(a->>'consentId')::uuid;matched_n:=0;
  select to_jsonb(actual) into policy_n from turn_private.text_policies actual where actual.id=p for share nowait;
  if found then
   select to_jsonb(actual) into consent_n from turn_private.text_consents actual where actual.owner_id=u and actual.policy_id=p and actual.consent_id=c for share nowait;
   if not found then raise exception 'DATA_POLICY_BLOCKED';else
    matched_n:=matched_n+1;
    if not turn_private.text_policy_current(p) or consent_n->>'revoked_at' is not null then raise exception 'DATA_POLICY_BLOCKED';end if;
    witness_n:=witness_n||jsonb_build_array(jsonb_build_object('realm','text','pair',a,'policyDigest',conversation_data_private.digest_v1(policy_n::text),'consentDigest',conversation_data_private.digest_v1(consent_n::text)));
   end if;
  end if;
  select to_jsonb(actual) into policy_n from turn_private.planning_policies actual where actual.id=p for share nowait;
  if found then
   select to_jsonb(actual) into consent_n from turn_private.planning_consents actual where actual.owner_id=u and actual.policy_id=p and actual.consent_id=c for share nowait;
   if not found then raise exception 'DATA_POLICY_BLOCKED';else
    matched_n:=matched_n+1;
    if not turn_private.planning_policy_current(p) or consent_n->>'revoked_at' is not null then raise exception 'DATA_POLICY_BLOCKED';end if;
    -- Its linked text policy is part of the actual planning authority, too.
    perform 1 from turn_private.text_policies where id=(policy_n->>'text_policy_id')::uuid for share nowait;
    witness_n:=witness_n||jsonb_build_array(jsonb_build_object('realm','planning','pair',a,'policyDigest',conversation_data_private.digest_v1(policy_n::text),'consentDigest',conversation_data_private.digest_v1(consent_n::text)));
   end if;
  end if;
  if matched_n=0 then raise exception 'DATA_POLICY_BLOCKED';end if;
 end loop;return witness_n;
end$$;

create function conversation_data_private.related_v1(relation_n text,v jsonb,g jsonb,executions uuid[]) returns boolean
language plpgsql immutable set search_path='' as $$
declare identity_kind text:=conversation_data_private.entity_kind_v1(relation_n);ref record;
begin
 if identity_kind is not null then return coalesce(g->identity_kind ? (v->>'id'),false);end if;
 if v->>'execution_id' is not null and v->>'execution_id'=any(executions::text[]) then return true;end if;
 for ref in select * from conversation_data_private.json_references_v1(v) loop
  if g->ref.kind ? ref.entity_id::text then return true;end if;
 end loop;return false;
end$$;

create function conversation_data_private.impact_inventory_v1(g jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare sets_n uuid[]:=array[]::uuid[];items_n uuid[]:=array[]::uuid[];deliveries_n uuid[]:=array[]::uuid[];
 projections_n uuid[]:=array[]::uuid[];extra_n uuid[];rows_n jsonb:='[]';r record;n integer:=0;table_n text;current_n jsonb;
begin
 select array_agg(id) into extra_n from knowledge_review_private.source_impact_sets
  where conversation_data_private.related_v1('impact',graph_snapshot,g,array[]::uuid[]);
 sets_n:=conversation_data_private.union_ids_v1(sets_n||coalesce(extra_n,array[]::uuid[]));
 select array_agg(set_id) into extra_n from knowledge_review_private.source_impact_items
  where conversation_data_private.related_v1('impact',target,g,array[]::uuid[]);
 sets_n:=conversation_data_private.union_ids_v1(sets_n||coalesce(extra_n,array[]::uuid[]));
 select array_agg(set_id) into extra_n from knowledge_review_private.source_impact_pages
  where conversation_data_private.related_v1('impact',receipt,g,array[]::uuid[]);
 sets_n:=conversation_data_private.union_ids_v1(sets_n||coalesce(extra_n,array[]::uuid[]));
 select array_agg(set_id) into extra_n from knowledge_review_private.source_impact_projections
  where conversation_data_private.related_v1('impact',target,g,array[]::uuid[]);
 sets_n:=conversation_data_private.union_ids_v1(sets_n||coalesce(extra_n,array[]::uuid[]));
 -- Whole matching mixed-set inventory is CAS input; NONE of it is erased.
 for table_n in select unnest(array['source_impact_sets','source_impact_items','source_impact_pages','source_impact_outbox','source_impact_projections','source_impact_review_requests']) loop
  n:=0;
  for current_n in execute format('select to_jsonb(actual) from knowledge_review_private.%I actual where %s order by to_jsonb(actual)::text collate "C" limit 10001',table_n,
   case table_n when 'source_impact_sets' then 'id=any($1)' when 'source_impact_review_requests' then
    'delivery_id in(select id from knowledge_review_private.source_impact_outbox where set_id=any($1)) or projection_id in(select id from knowledge_review_private.source_impact_projections where set_id=any($1))'
    else 'set_id=any($1)' end) using sets_n loop
   n:=n+1;
   if n>10000 or jsonb_array_length(rows_n)>=4100 then return jsonb_build_object('rows',rows_n,'overflow',true);end if;
   rows_n:=rows_n||jsonb_build_array(jsonb_build_object('table','knowledge_review_private.'||table_n,'digest',conversation_data_private.digest_v1(current_n::text)));
  end loop;
 end loop;
 return jsonb_build_object('rows',rows_n,'overflow',false);
end$$;

create function conversation_data_private.source_v1(u uuid,root_kind_n text,root_id_n uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare closure_n jsonb;g jsonb;spec record;actual_n jsonb;key_n jsonb;ref record;qualified_n boolean;
 rows_n jsonb:='[]';reverse_n jsonb:='[]';authorities_n jsonb:='[]';witness_n jsonb;conflicts_n text[]:=array[]::text[];
 erase_n jsonb:=conversation_data_private.zero_counts_v1('erase');redact_n jsonb:=conversation_data_private.zero_counts_v1('redact');
 retain_n jsonb:=conversation_data_private.zero_counts_v1('retain');refs_n jsonb;trips_n uuid[]:=array[]::uuid[];memory_n uuid[]:=array[]::uuid[];
 executions uuid[]:=array[]::uuid[];turns uuid[];tasks uuid[];messages uuid[];goals uuid[];artifacts uuid[];threads uuid[];
 n integer;total_n integer:=0;reverse_total integer:=0;other_n jsonb;fingerprint_n jsonb;relation_n text;extra_n uuid[];
begin
 -- Root ownership/policy precede source feedback, even on a capacity blocker.
 if root_kind_n='conversation' then
  select jsonb_build_array(jsonb_build_object('policyId',policy_id,'consentId',consent_id)) into authorities_n
   from turn_private.assistant_conversations where id=root_id_n and owner_id=u;
  if not found then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
  perform conversation_data_private.authorities_current_v1(u,authorities_n);
 elsif root_kind_n='thread' then
  perform 1 from public.chat_threads where id=root_id_n and owner_id=u;if not found then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
 else raise exception 'INVALID_INPUT';end if;
 closure_n:=conversation_data_private.closure_v1(u,root_kind_n,root_id_n);g:=closure_n->'graph';
 select coalesce(array_agg(value#>>'{}'),array[]::text[]) into conflicts_n from jsonb_array_elements(closure_n->'conflicts');
 if not conversation_data_private.schema_supported_v1() then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if conflicts_n @> array['SCOPE_TOO_LARGE'] then
  return jsonb_build_object('graph',g,'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',authorities_n,
   'retainedReferences','{"tripIds":[],"memoryIds":[]}'::jsonb,'conflicts',conversation_data_private.conflicts_v1(conflicts_n),'rows','[]'::jsonb,
   'sourceDigest',conversation_data_private.digest_v1(jsonb_build_array(g,conflicts_n,authorities_n)::text));
 end if;
 turns:=privacy_private.linked_delete_array_v1(g->'turnIds');tasks:=privacy_private.linked_delete_array_v1(g->'taskIds');
 messages:=privacy_private.linked_delete_array_v1(g->'messageIds');goals:=privacy_private.linked_delete_array_v1(g->'goalIds');
 artifacts:=privacy_private.linked_delete_array_v1(g->'artifactIds');threads:=privacy_private.linked_delete_array_v1(g->'threadIds');
 if root_kind_n='thread' and (cardinality(threads)<>1 or threads[1]<>root_id_n) then conflicts_n:=conflicts_n||array['CROSS_SCOPE_REFERENCE'];end if;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into executions from turn_private.planning_v2_execution_runs
  where owner_id=u and (turn_id=any(turns) or task_id=any(tasks));
 for spec in select * from conversation_data_private.sources_v1() order by relation_name collate "C" loop
  n:=0;
  for actual_n in execute format('select to_jsonb(actual) from %s actual where conversation_data_private.related_v1(%L,to_jsonb(actual),$1,$2) order by conversation_data_private.row_key_v1(to_jsonb(actual),$3)::text collate "C" limit 10001',spec.relation_name,spec.relation_name)
   using g,executions,spec.pk loop
   n:=n+1;total_n:=total_n+1;
   if n>10000 or total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   key_n:=conversation_data_private.row_key_v1(actual_n,spec.pk);
   rows_n:=rows_n||jsonb_build_array(jsonb_build_object('table',spec.relation_name,'pk',key_n,'digest',conversation_data_private.digest_v1(actual_n::text),'effect',spec.effect,'countKey',spec.count_key));
   if spec.has_owner then qualified_n:=actual_n->>'owner_id'=u::text;
   elsif spec.relation_name='public.model_budget_attempts' then
    qualified_n:=exists(select 1 from turn_private.service_tasks t join public.model_budget_scopes b on b.id=(actual_n->>'scope_id')::uuid where t.id=(actual_n->>'task_id')::uuid and t.owner_id=u and b.owner_id=u);
   elsif spec.relation_name='turn_private.text_dispatches' then
    qualified_n:=exists(select 1 from turn_private.text_content t where t.turn_id=(actual_n->>'turn_id')::uuid and t.owner_id=u);
   else qualified_n:=exists(select 1 from turn_private.planning_v2_execution_runs e where e.id=(actual_n->>'execution_id')::uuid and e.owner_id=u);end if;
   if not qualified_n then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];continue;end if;
   if spec.effect='erase' then erase_n:=jsonb_set(erase_n,array[spec.count_key],to_jsonb((erase_n->>spec.count_key)::integer+1));
   elsif spec.effect='redact' then redact_n:=jsonb_set(redact_n,array[spec.count_key],to_jsonb((redact_n->>spec.count_key)::integer+1));
   else retain_n:=jsonb_set(retain_n,array[spec.count_key],to_jsonb((retain_n->>spec.count_key)::integer+1));end if;
   if actual_n->>'policy_id' is not null and actual_n->>'consent_id' is not null then
    authorities_n:=authorities_n||jsonb_build_array(jsonb_build_object('policyId',actual_n->'policy_id','consentId',actual_n->'consent_id'));
   end if;
   if actual_n->>'planning_policy_id' is not null and actual_n->>'planning_consent_id' is not null then
    authorities_n:=authorities_n||jsonb_build_array(jsonb_build_object('policyId',actual_n->'planning_policy_id','consentId',actual_n->'planning_consent_id'));
   end if;
   -- Retained historical link receipts do not seed another deleted conversation.
   if spec.count_key<>'goalTripReceipts' then
    for ref in select * from conversation_data_private.json_references_v1(actual_n) loop
     if not(g->ref.kind ? ref.entity_id::text) then conflicts_n:=conflicts_n||array['CROSS_SCOPE_REFERENCE'];end if;
    end loop;
   end if;
   if spec.count_key='turns' then
    if actual_n->>'status'='proposal_ready' then conflicts_n:=conflicts_n||array['PROPOSAL_REFERENCE'];
    elsif actual_n->>'status' not in('completed','unavailable','failed','cancelled') then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
   elsif spec.count_key='work' and actual_n->>'state' not in('completed','failed','cancelled') then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='assistJobs' and actual_n->>'status' in('queued','running') then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='planning' and actual_n->>'state'<>'completed' then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='capacity' and actual_n->>'state'='reserved' then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='budgetAttempts' and actual_n->>'status' not in('settled','released') then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='checkpoints' and actual_n->>'state'<>'completed' then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='attemptBindings' and actual_n->>'unknown_at' is not null then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='collectorOrigins' and (actual_n->>'unknown_at' is not null or actual_n->>'attempted_at' is not null and actual_n->>'response_buffered_at' is null) then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='resultClaims' and actual_n->>'state'<>'completed' then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='localJournals' and (actual_n->>'unknown_at' is not null or actual_n->>'phase'<>'response_recorded'
     or not exists(select 1 from turn_private.planning_v2_completed_receipts c where c.turn_id=(actual_n->>'turn_id')::uuid and c.owner_id=u)) then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];
   elsif spec.count_key='callWindows' and (actual_n->>'calls')::integer>0
     and not exists(select 1 from turn_private.planning_v2_completion_proofs p where p.execution_id=(actual_n->>'execution_id')::uuid and p.owner_id=u) then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
   if actual_n->>'proposal_id' is not null or actual_n->'content'->>'schemaVersion' in('proposal_preview/1','change-proposal/1') then conflicts_n:=conflicts_n||array['PROPOSAL_REFERENCE'];end if;
   if actual_n->>'trip_id' is not null then trips_n:=conversation_data_private.union_ids_v1(trips_n||array[(actual_n->>'trip_id')::uuid]);end if;
   if actual_n->>'memory_id' is not null then memory_n:=conversation_data_private.union_ids_v1(memory_n||array[(actual_n->>'memory_id')::uuid]);end if;
   if jsonb_typeof(actual_n->'memory_basis')='array' then
    select array_agg((entry->>'memoryId')::uuid) into extra_n from jsonb_array_elements(actual_n->'memory_basis') entry where notification_private.uuid(entry->'memoryId') is true;
    memory_n:=conversation_data_private.union_ids_v1(memory_n||coalesce(extra_n,array[]::uuid[]));
   end if;
  end loop;
  if conflicts_n @> array['SCOPE_TOO_LARGE'] then exit;end if;
 end loop;
 redact_n:=jsonb_set(redact_n,'{taskDigests}',to_jsonb(cardinality(tasks)));
 authorities_n:=conversation_data_private.authorities_union_v1(authorities_n);
 if jsonb_array_length(authorities_n)>100 then raise exception 'CONVERSATION_CAPACITY';end if;
 witness_n:=conversation_data_private.authorities_current_v1(u,authorities_n);
 other_n:=conversation_data_private.impact_inventory_v1(g);
 if other_n->'rows'<>'[]'::jsonb then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if other_n->'overflow'='true'::jsonb then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 reverse_n:=reverse_n||(other_n->'rows');reverse_total:=jsonb_array_length(reverse_n);
 -- Reverse JSON references in all actual application JSON tables. Known
 -- domain matches are blockers; any unregistered stored relation is unsupported.
 for relation_n in select distinct (n.nspname||'.'||c.relname) collate "C" from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
  where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','conversation_data_private')
  and not(n.nspname='knowledge_review_private' and c.relname like 'source_impact_%')
  and a.attnum>0 and not a.attisdropped and a.atttypid in('jsonb'::regtype,'json'::regtype)
  and not exists(select 1 from conversation_data_private.sources_v1() s where s.relation_name=n.nspname||'.'||c.relname)
  order by 1 loop
  n:=0;
  for actual_n in execute format('select to_jsonb(actual) from %s actual where conversation_data_private.related_v1(%L,to_jsonb(actual),$1,$2) order by to_jsonb(actual)::text collate "C" limit 10001',relation_n,relation_n) using g,executions loop
   n:=n+1;reverse_total:=reverse_total+1;
   if n>10000 or reverse_total+total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   reverse_n:=reverse_n||jsonb_build_array(jsonb_build_object('table',relation_n,'digest',conversation_data_private.digest_v1(actual_n::text)));
   conflicts_n:=conflicts_n||case
    when relation_n like 'readiness_private.%' then 'READINESS_REFERENCE'
    when relation_n like 'guide_private.%' then 'GUIDE_REFERENCE'
    when relation_n like 'scoped_edit_private.%' then 'SCOPED_EDIT_REFERENCE'
    when relation_n like 'notification_private.%' then 'NOTIFICATION_REFERENCE'
    when relation_n like 'service_brief_private.%' then 'BRIEF_REFERENCE'
    else 'SOURCE_UNSUPPORTED' end;
  end loop;
 end loop;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into trips_n from public.trips where id=any(trips_n) and owner_id=u;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into memory_n from public.memory_profiles where id=any(memory_n) and owner_id=u;
 refs_n:=jsonb_build_object('tripIds',trips_n,'memoryIds',memory_n);
 if exists(select 1 from export_private.core_artifacts_v1 where owner_id=u)
  or exists(select 1 from export_private.core_jobs_v1 where owner_id=u and (state in('queued','running') or lease_expires_at>clock_timestamp())) then conflicts_n:=conflicts_n||array['CORE_EXPORT_COPY'];end if;
 if exists(select 1 from privacy_private.trip_deletions where owner_id=u and trip_id=any(trips_n) and state='queued')
  or exists(select 1 from privacy_private.linked_delete_fences_v1 f where exists(select 1 from jsonb_each(g) group_n where group_n.value ? f.entity_id::text))
  or exists(select 1 from privacy_private.memory_delete_jobs_v1 j where j.owner_id=u and j.state='queued') then conflicts_n:=conflicts_n||array['OTHER_DELETE_PENDING'];end if;
 if exists(select 1 from turn_private.result_revisions r where not r.artifact_id=any(artifacts)
  and exists(select 1 from conversation_data_private.json_references_v1(r.content) stored_ref where g->stored_ref.kind ? stored_ref.entity_id::text))
  or exists(select 1 from turn_private.assistant_message_source_receipts r where not r.message_id=any(messages)
   and (conversation_data_private.related_v1('reverse',r.input_sources,g,executions) or conversation_data_private.related_v1('reverse',r.captured_sources,g,executions))) then conflicts_n:=conflicts_n||array['CROSS_SCOPE_REFERENCE'];end if;
 fingerprint_n:=jsonb_build_object('graph',g,'rows',rows_n,'reverse',reverse_n,'sourceAuthorities',authorities_n,'authorityWitness',witness_n,
  'trips',(select coalesce(jsonb_agg(to_jsonb(actual) order by id),'[]') from public.trips actual where id=any(trips_n) and owner_id=u),
  'memory',(select coalesce(jsonb_agg(to_jsonb(actual) order by id),'[]') from public.memory_profiles actual where id=any(memory_n) and owner_id=u),
  'conflicts',conversation_data_private.conflicts_v1(conflicts_n));
 if total_n+reverse_total+jsonb_array_length(witness_n)+cardinality(trips_n)+cardinality(memory_n)>4100 or octet_length(fingerprint_n::text)>1000000 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 if conflicts_n @> array['SCOPE_TOO_LARGE'] then
  g:=jsonb_set(conversation_data_private.empty_graph_v1(),array[case root_kind_n when 'conversation' then 'conversationIds' else 'threadIds' end],to_jsonb(array[root_id_n]));
  erase_n:=conversation_data_private.zero_counts_v1('erase');redact_n:=conversation_data_private.zero_counts_v1('redact');retain_n:=conversation_data_private.zero_counts_v1('retain');rows_n:='[]';refs_n:='{"tripIds":[],"memoryIds":[]}';
 end if;
 return jsonb_build_object('graph',g,'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',authorities_n,'retainedReferences',refs_n,
  'conflicts',conversation_data_private.conflicts_v1(conflicts_n),'rows',rows_n,'sourceDigest',conversation_data_private.digest_v1(fingerprint_n::text));
end$$;

revoke all on all functions in schema conversation_data_private from public,anon,authenticated,service_role;
-- Fixed-point private source construction and authority qualification exist.
-- Source locking, attached permanent entity/JSON fences, atomic effects, receipt
-- and public RPC remain in development. Do not merge/activate this partial source.
