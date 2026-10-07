-- #239 accepted TurnData: own append only; shared hooks require exact Main lease.
-- Source schema SHA256: 1629f0b1382aa08a6bc8dfbe5c2f49f9775991691819f593ea95a9f57b5917a1


create schema turn_data_private;
revoke all on schema turn_data_private from public,anon,authenticated,service_role;
alter default privileges in schema turn_data_private revoke execute on functions from public;

-- Finite, inspectable own operation state; retained session UUID is inert.
-- decision is the finite closed D, never a receipt or another operation row.
create table turn_data_private.operations_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 scope text not null check(scope in('turn-sensitive-data/1','turn-delete-progress/1')),
 turn_id uuid,object_ids uuid[] not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 source_authorities jsonb not null check(jsonb_typeof(source_authorities)='array' and jsonb_array_length(source_authorities)<=100),
 captured_at bigint not null check(captured_at>0),
 expires_at bigint not null check(expires_at=captured_at+30000),
 mutation_bytes text check(mutation_bytes is null or octet_length(mutation_bytes)<=8192),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'previewed' check(state in('previewed','erased')),
 preview_erased boolean not null default false,
 graph jsonb,erase_counts jsonb,redact_counts jsonb,retain_counts jsonb,
 retained_references jsonb,conflicts jsonb,decision jsonb,
 source_identity_keys jsonb not null default '[]'::jsonb check(jsonb_typeof(source_identity_keys)='array' and jsonb_array_length(source_identity_keys)<=4100),
 check(((scope='turn-sensitive-data/1' and turn_id is not null and cardinality(object_ids)=0)
  or (scope='turn-delete-progress/1' and turn_id is null and cardinality(object_ids) between 1 and 20 and not request_id=any(object_ids))) is true),
 check((state='previewed')=(request_digest is null)),
 check((state='previewed')=(mutation_bytes is null)),
 check((state='previewed')=(decision is null)),
 check(state<>'erased' or preview_erased),
 check((preview_erased and graph is null and erase_counts is null and redact_counts is null and retain_counts is null and retained_references is null and conflicts is null)
  or (not preview_erased and graph is not null and erase_counts is not null and redact_counts is not null and retain_counts is not null and retained_references is not null and conflicts is not null))
);
create index turn_data_owner_v1 on turn_data_private.operations_v1(owner_id,request_id);
create index turn_data_tombstones_v1 on turn_data_private.operations_v1 using gin(decision jsonb_path_ops)
 where scope='turn-sensitive-data/1' and state='erased';
create index turn_data_source_identity_v1 on turn_data_private.operations_v1 using gin(source_identity_keys jsonb_path_ops) where scope='turn-sensitive-data/1' and state='erased';
alter table turn_data_private.operations_v1 enable row level security;
revoke all on turn_data_private.operations_v1 from public,anon,authenticated,service_role;

-- Ephemeral authorization is private and bound to an actual PostgreSQL xid.
-- Executor must remove its proof before returning/committing; it is not a
-- second permanent fence inventory and stores no source/body/raw command.
create table turn_data_private.transaction_proofs_v1 (
 transaction_id xid8 primary key,
 owner_id uuid not null,
 request_id uuid not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 graph jsonb not null,
 expires_at bigint not null
);
alter table turn_data_private.transaction_proofs_v1 enable row level security;
revoke all on turn_data_private.transaction_proofs_v1 from public,anon,authenticated,service_role;



create function turn_data_private.digest_v1(v text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(v,'UTF8')),'hex')
$$;

create function turn_data_private.deadline_v1(c bigint,e bigint) returns bigint language plpgsql volatile set search_path='' as $$
declare n bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
begin if n<c or n>=e then raise exception 'TURN_EXPIRED';end if;return n;end$$;

create function turn_data_private.ids_v1(v jsonb,max_n integer) returns boolean language plpgsql immutable set search_path='' as $$
declare x jsonb;previous_n text;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>max_n then return false;end if;
 for x in select value from jsonb_array_elements(v) loop
  if notification_private.uuid(x) is not true or previous_n>=x#>>'{}' then return false;end if;
  previous_n:=x#>>'{}';
 end loop;return true;
end$$;

create function turn_data_private.actor_v1(expected_epoch bigint) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid;e bigint;n timestamptz:=clock_timestamp();
begin
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
  or auth.jwt()->>'is_anonymous' is distinct from 'false' or notification_private.uuid(auth.jwt()->'session_id') is not true then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_try_advisory_xact_lock(hashtextextended(u::text,34)) then raise lock_not_available using message='TURN_CONFLICT';end if;
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

create function turn_data_private.row_key_v1(v jsonb,keys_n text[]) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,v->k order by k collate "C") from unnest(keys_n) k
$$;

create function turn_data_private.fenced_v1(kind_n text,id_n uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from turn_data_private.operations_v1 r
  where r.scope='turn-sensitive-data/1' and r.state='erased' and exists(select 1 from auth.users account_n where account_n.id=r.owner_id)
  and r.decision @> jsonb_build_object('graph',jsonb_build_object(kind_n,jsonb_build_array(id_n::text))))
$$;

create function turn_data_private.sources_v1() returns table(relation_name text,count_key text,effect text,pk text[],columns_n text[],has_owner boolean) language sql immutable set search_path='' as $$ values
 ('public.chat_turn_events','events','erase',array['id']::text[],array['id','owner_id','thread_id','turn_id','event_id','sequence','schema_version','event_type','state','created_at']::text[],true),
 ('public.chat_turn_idempotency','idempotency','erase',array['owner_id','thread_id','idempotency_key']::text[],array['owner_id','thread_id','idempotency_key','digest','turn_id','created_at']::text[],true),
 ('public.memory_consumer_receipts','memoryConsumers','erase',array['id']::text[],array['id','owner_id','memory_id','source_receipt_id','consumer_kind','turn_id','proposal_id','constraint_kind','created_at']::text[],true),
 ('public.model_budget_attempts','budgetAttempts','retain',array['scope_id','attempt_id']::text[],array['scope_id','attempt_id','task_id','provider','model','price_version','reserved_micros','actual_micros','status','created_at','updated_at']::text[],false),
 ('public.turn_feedback','feedback','erase',array['id']::text[],array['id','owner_id','thread_id','turn_id','feedback_kind','reason_code','created_at']::text[],true),
 ('turn_private.assistant_message_source_receipts','sourceReceipts','erase',array['message_id']::text[],array['message_id','owner_id','request_key','request_digest','input_sources','captured_sources','accepted_receipt','created_at']::text[],true),
 ('turn_private.assistant_messages','messageBodies','redact',array['id']::text[],array['id','conversation_id','owner_id','sequence','idempotency_key','request_digest','policy_id','consent_id','locale','input_text','relationship','goal_id','scope_version','task_id','parent_message_id','turn_id','created_at']::text[],true),
 ('turn_private.assistant_travel_intakes','intakes','erase',array['message_id']::text[],array['message_id','owner_id','conversation_id','goal_id','policy_id','consent_id','message_sequence','goal_version','intake_revision','idempotency_key','request_digest','intake','memory_basis','created_at']::text[],true),
 ('turn_private.grounded_ai_assist_jobs','assistJobs','erase',array['id']::text[],array['id','turn_id','owner_id','status','claim_token','started_at','finished_at','outcome','error_code','created_at']::text[],true),
 ('turn_private.grounded_turns','grounded','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','city','locale','scope_version','intent','request_scope','original_outcome','basis','completed_at','unanswered_needs','place_subject_id','place_name','place_resolution']::text[],true),
 ('turn_private.planning_action_receipts','actionReceipts','erase',array['turn_id','action_key']::text[],array['turn_id','action_key','owner_id','task_id','message_id','lease_token','tool_id','input_digest','basis_digest','memory_basis','state','receipt_digest','created_at','updated_at']::text[],true),
 ('turn_private.planning_comparisons','planning','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','goal_id','message_id','goal_version','planning_policy_id','planning_consent_id','memory_basis','artifact_id','publication_key','state','created_at']::text[],true),
 ('turn_private.planning_intake_bindings','intakeBindings','erase',array['turn_id']::text[],array['turn_id','owner_id','source_message_id','source_sequence','source_revision','source_goal_version','source_digest','message_id','intake_revision','new_digest','request_key','request_digest','created_at']::text[],true),
 ('turn_private.planning_model_dispatches','modelDispatches','erase',array['lease_token']::text[],array['lease_token','turn_id','owner_id','task_id','scope_id','attempt_id','dispatched_at']::text[],true),
 ('turn_private.planning_observations','observations','erase',array['turn_id','action_key']::text[],array['turn_id','action_key','owner_id','observation','created_at']::text[],true),
 ('turn_private.planning_v2_collector_origins','collectorOrigins','erase',array['execution_id']::text[],array['execution_id','scope_id','attempt_id','invocation_id','request_id','request_digest','payload_digest','binding','origin_kind','configured_at','attempted_at','response_buffered_at','unknown_at','configuration_id','configuration_version','endpoint']::text[],false),
 ('turn_private.planning_v2_collector_outputs','collectorOutputs','erase',array['execution_id']::text[],array['execution_id','output_digest','usage_digest','output_wire','usage_receipt_id','usage_wire','recorded_at']::text[],false),
 ('turn_private.planning_v2_completed_receipts','completedReceipts','erase',array['execution_id']::text[],array['execution_id','owner_id','task_id','turn_id','artifact_id','revision','receipt']::text[],true),
 ('turn_private.planning_v2_completion_proofs','completionProofs','erase',array['execution_id']::text[],array['execution_id','transaction_id','owner_id','task_id','turn_id','original_lease','current_lease','intake_digest','planning_digest','action_key','content_digest','artifact_id','scope_id','attempt_id','output_digest','usage_digest','content','created_at']::text[],true),
 ('turn_private.planning_v2_execution_runs','executionRuns','erase',array['id']::text[],array['id','profile_id','profile_revision','owner_id','task_id','turn_id','original_lease','source','intake_digest','planning_digest','collector_principal_id','origin_kind','execution','profile_snapshot','created_at']::text[],true),
 ('turn_private.planning_v2_external_call_windows','callWindows','erase',array['execution_id']::text[],array['execution_id','calls']::text[],false),
 ('turn_private.planning_v2_model_attempt_bindings','attemptBindings','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','claim_lease','text_policy_id','planning_policy_id','scope_id','attempt_id','provider','model','price_version','intake_digest','planning_digest','bound_at','unknown_at']::text[],true),
 ('turn_private.planning_v2_model_local_journal','localJournals','erase',array['request_id']::text[],array['request_id','owner_id','task_id','turn_id','scope_id','attempt_id','binding','payload_digest','request_digest','phase','revision','intent_at','send_at','response_at','unknown_at','send_observation','response_observation','output_wire','unknown_reason']::text[],true),
 ('turn_private.planning_v2_place_checkpoints','checkpoints','erase',array['turn_id']::text[],array['turn_id','owner_id','task_id','claim_lease','intake_digest','planning_digest','state','started_at','observation','completed_at']::text[],true),
 ('turn_private.planning_v2_result_claims','resultClaims','erase',array['execution_id']::text[],array['execution_id','action_key','content_digest','lease_token','state']::text[],false),
 ('turn_private.result_artifacts','artifacts','erase',array['id']::text[],array['id','owner_id','task_id','goal_id','input_message_id','trip_id','current_revision','lifecycle','created_at','proposal_id','source_result_id','source_turn_id']::text[],true),
 ('turn_private.result_events','resultEvents','erase',array['id']::text[],array['id','owner_id','artifact_id','revision','event_type','created_at']::text[],true),
 ('turn_private.result_revisions','revisions','erase',array['artifact_id','revision']::text[],array['artifact_id','revision','owner_id','idempotency_key','request_digest','input_sequence','task_turn_id','goal_version','trip_version','memory_basis','content','created_at','trip_link_operation_id','trip_link_version','evidence_basis']::text[],true),
 ('turn_private.service_task_capacity','capacity','retain',array['task_id']::text[],array['task_id','owner_id','policy_version','tier','grant_environment','grant_transaction_id','admitted_at','state','settled_turn_id','settled_at','released_at']::text[],true),
 ('turn_private.service_task_turns','taskTurns','retain',array['turn_id']::text[],array['turn_id','task_id','owner_id','parent_turn_id','relationship','idempotency_key','request_digest']::text[],true),
 ('turn_private.service_tasks','tasks','retain',array['id']::text[],array['id','owner_id','thread_id','goal_turn_id','last_turn_id','policy_id','consent_id','scope_version','expected_result','goal_digest','budget_scope_id','created_at','capacity_enforced']::text[],true),
 ('turn_private.text_content','textBodies','redact',array['turn_id']::text[],array['turn_id','owner_id','thread_id','policy_id','consent_id','locale','input_text','output_kind','output_text','hidden_at','created_at']::text[],true),
 ('turn_private.text_dispatches','textDispatches','retain',array['lease_token']::text[],array['lease_token','turn_id','consent_id','policy_id','dispatched_at']::text[],false),
 ('turn_private.work','work','erase',array['turn_id']::text[],array['turn_id','owner_id','session_id','state','attempt','max_attempts','lease_ms','lease_token','expires_at','created_at','execution_mode']::text[],true),
 ('public.turns','turns','retain',array['id']::text[],array['id','owner_id','trip_id','status','created_at','thread_id','updated_at']::text[],true)
$$;

create function turn_data_private.zero_counts_v1(effect_n text) returns jsonb language sql immutable set search_path='' as $$ select jsonb_object_agg(k,0) from(select count_key k from turn_data_private.sources_v1() where effect=effect_n union select unnest(case effect_n when 'redact' then array['messageBodies','taskDigests'] when 'retain' then array['messages','threads','conversations','goals'] else array[]::text[] end)) a $$;

create function turn_data_private.empty_graph_v1() returns jsonb language sql immutable set search_path='' as $$ select '{"turnIds":[],"messageIds":[],"artifactIds":[]}'::jsonb $$;

create function turn_data_private.union_ids_v1(v uuid[]) returns uuid[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(id order by id),array[]::uuid[]) from(select distinct id from unnest(v) id where id is not null) actual
$$;

create function turn_data_private.authorities_shape_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
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

create function turn_data_private.authorities_union_v1(v jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(a order by a->>'policyId' collate "C",a->>'consentId' collate "C"),'[]'::jsonb)
 from(select distinct a from jsonb_array_elements(v) a) unique_pairs
$$;

create function turn_data_private.authorities_current_v1(u uuid,v jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;p uuid;c uuid;matched_n integer;witness_n jsonb:='[]';policy_n jsonb;consent_n jsonb;
begin
 if turn_data_private.authorities_shape_v1(v) is not true then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 for a in select value from jsonb_array_elements(v) loop
  p:=(a->>'policyId')::uuid;c:=(a->>'consentId')::uuid;matched_n:=0;
  select to_jsonb(actual) into policy_n from turn_private.text_policies actual where actual.id=p for share nowait;
  if found then
   select to_jsonb(actual) into consent_n from turn_private.text_consents actual where actual.owner_id=u and actual.policy_id=p and actual.consent_id=c for share nowait;
   if not found then raise exception 'DATA_POLICY_BLOCKED';else
    matched_n:=matched_n+1;
    if not turn_private.text_policy_current(p) or consent_n->>'revoked_at' is not null then raise exception 'DATA_POLICY_BLOCKED';end if;
    witness_n:=witness_n||jsonb_build_array(jsonb_build_object('realm','text','pair',a,'policyDigest',turn_data_private.digest_v1(policy_n::text),'consentDigest',turn_data_private.digest_v1(consent_n::text)));
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
    witness_n:=witness_n||jsonb_build_array(jsonb_build_object('realm','planning','pair',a,'policyDigest',turn_data_private.digest_v1(policy_n::text),'consentDigest',turn_data_private.digest_v1(consent_n::text)));
   end if;
  end if;
  if matched_n=0 then raise exception 'DATA_POLICY_BLOCKED';end if;
 end loop;return witness_n;
end$$;

create function turn_data_private.json_references_v1(v jsonb,p_path text[] default array[]::text[]) returns table(kind text,entity_id uuid,path_n text[])
language plpgsql immutable set search_path='' as $$
declare x record;resolved text;scalar_n text;
begin
 if cardinality(p_path)>32 then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 if jsonb_typeof(v)='object' then
  if v->>'kind' in('historical_answer','turn','text_turn') and notification_private.uuid(v->'id') is true then
   return query select 'turnIds'::text,(v->>'id')::uuid,p_path||array['id'];
  end if;
  if v->>'kind' in('artifact_reference','result_artifact','artifact','result') and notification_private.uuid(v->'id') is true then
   return query select 'artifactIds'::text,(v->>'id')::uuid,p_path||array['id'];
  end if;
  if v->>'kind' in('intake','task','task_output','conversation','thread','goal') and notification_private.uuid(v->'id') is true then
   return query select case v->>'kind' when 'intake' then 'messageIds' when 'task' then 'taskIds' when 'task_output' then 'taskIds'
    when 'conversation' then 'conversationIds' when 'thread' then 'threadIds' else 'goalIds' end,(v->>'id')::uuid,p_path||array['id'];
  end if;
  for x in select key,value from jsonb_each(v) order by key collate "C" loop
   resolved:=turn_data_private.reference_kind_v1(x.key);
   if resolved is not null and x.value<>'null'::jsonb then
    if notification_private.uuid(x.value) is not true then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
    return query select resolved,(x.value#>>'{}')::uuid,p_path||array[x.key];
   elsif jsonb_typeof(x.value) in('object','array') then
    return query select * from turn_data_private.json_references_v1(x.value,p_path||array[x.key]);
   end if;
  end loop;
 elsif jsonb_typeof(v)='array' then
  for x in select value,ordinality from jsonb_array_elements(v) with ordinality loop
   return query select * from turn_data_private.json_references_v1(x.value,p_path||array[x.ordinality::text]);
  end loop;
 end if;
end$$;

create function turn_data_private.reference_kind_v1(k text) returns text language sql immutable set search_path='' as $$
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

create function turn_data_private.empty_references_v1() returns jsonb language sql immutable set search_path='' as $$ select '{"taskIds":[],"threadIds":[],"conversationIds":[],"goalIds":[],"tripIds":[],"memoryIds":[]}'::jsonb $$;



create function turn_data_private.schema_supported_v1() returns boolean language plpgsql stable set search_path='' as $$
declare actual_n jsonb;s record;pk_n text[];
begin
 for s in select * from turn_data_private.sources_v1() loop
  if to_regclass(s.relation_name) is null then return false;end if;
  select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) order by a.attnum) into actual_n from pg_attribute a where a.attrelid=s.relation_name::regclass and a.attnum>0 and not a.attisdropped;
  if actual_n is distinct from ('{"public.chat_turn_events":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"event_id","type":"text","notNull":true},{"name":"sequence","type":"integer","notNull":true},{"name":"schema_version","type":"text","notNull":true},{"name":"event_type","type":"text","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"public.chat_turn_idempotency":[{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"idempotency_key","type":"text","notNull":true},{"name":"digest","type":"text","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"public.memory_consumer_receipts":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"memory_id","type":"uuid","notNull":true},{"name":"source_receipt_id","type":"uuid","notNull":true},{"name":"consumer_kind","type":"text","notNull":true},{"name":"turn_id","type":"uuid","notNull":false},{"name":"proposal_id","type":"uuid","notNull":false},{"name":"constraint_kind","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"public.model_budget_attempts":[{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"provider","type":"text","notNull":true},{"name":"model","type":"text","notNull":true},{"name":"price_version","type":"text","notNull":true},{"name":"reserved_micros","type":"bigint","notNull":true},{"name":"actual_micros","type":"bigint","notNull":false},{"name":"status","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"updated_at","type":"timestamp with time zone","notNull":true}],"public.turn_feedback":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"feedback_kind","type":"text","notNull":true},{"name":"reason_code","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_message_source_receipts":[{"name":"message_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"request_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"input_sources","type":"jsonb","notNull":true},{"name":"captured_sources","type":"jsonb","notNull":true},{"name":"accepted_receipt","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_messages":[{"name":"id","type":"uuid","notNull":true},{"name":"conversation_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"sequence","type":"bigint","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"locale","type":"text","notNull":true},{"name":"input_text","type":"text","notNull":true},{"name":"relationship","type":"text","notNull":true},{"name":"goal_id","type":"uuid","notNull":false},{"name":"scope_version","type":"integer","notNull":false},{"name":"task_id","type":"uuid","notNull":false},{"name":"parent_message_id","type":"uuid","notNull":false},{"name":"turn_id","type":"uuid","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.assistant_travel_intakes":[{"name":"message_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"conversation_id","type":"uuid","notNull":true},{"name":"goal_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"message_sequence","type":"bigint","notNull":true},{"name":"goal_version","type":"integer","notNull":true},{"name":"intake_revision","type":"integer","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"intake","type":"jsonb","notNull":true},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.grounded_ai_assist_jobs":[{"name":"id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"status","type":"text","notNull":true},{"name":"claim_token","type":"uuid","notNull":true},{"name":"started_at","type":"timestamp with time zone","notNull":false},{"name":"finished_at","type":"timestamp with time zone","notNull":false},{"name":"outcome","type":"jsonb","notNull":false},{"name":"error_code","type":"text","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.grounded_turns":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"city","type":"text","notNull":true},{"name":"locale","type":"text","notNull":true},{"name":"scope_version","type":"integer","notNull":true},{"name":"intent","type":"text","notNull":false},{"name":"request_scope","type":"text","notNull":false},{"name":"original_outcome","type":"text","notNull":false},{"name":"basis","type":"jsonb","notNull":false},{"name":"completed_at","type":"timestamp with time zone","notNull":false},{"name":"unanswered_needs","type":"jsonb","notNull":false},{"name":"place_subject_id","type":"text","notNull":false},{"name":"place_name","type":"text","notNull":false},{"name":"place_resolution","type":"text","notNull":false}],"turn_private.planning_action_receipts":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"message_id","type":"uuid","notNull":true},{"name":"lease_token","type":"uuid","notNull":true},{"name":"tool_id","type":"text","notNull":true},{"name":"input_digest","type":"text","notNull":true},{"name":"basis_digest","type":"text","notNull":true},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"receipt_digest","type":"text","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"updated_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_comparisons":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"goal_id","type":"uuid","notNull":true},{"name":"message_id","type":"uuid","notNull":true},{"name":"goal_version","type":"integer","notNull":true},{"name":"planning_policy_id","type":"uuid","notNull":true},{"name":"planning_consent_id","type":"uuid","notNull":true},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"publication_key","type":"uuid","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_intake_bindings":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"source_message_id","type":"uuid","notNull":true},{"name":"source_sequence","type":"bigint","notNull":true},{"name":"source_revision","type":"integer","notNull":true},{"name":"source_goal_version","type":"integer","notNull":true},{"name":"source_digest","type":"text","notNull":true},{"name":"message_id","type":"uuid","notNull":true},{"name":"intake_revision","type":"integer","notNull":true},{"name":"new_digest","type":"text","notNull":true},{"name":"request_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_model_dispatches":[{"name":"lease_token","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"dispatched_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_observations":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"observation","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_collector_origins":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"invocation_id","type":"uuid","notNull":true},{"name":"request_id","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"payload_digest","type":"text","notNull":true},{"name":"binding","type":"jsonb","notNull":true},{"name":"origin_kind","type":"text","notNull":true},{"name":"configured_at","type":"timestamp with time zone","notNull":true},{"name":"attempted_at","type":"timestamp with time zone","notNull":false},{"name":"response_buffered_at","type":"timestamp with time zone","notNull":false},{"name":"unknown_at","type":"timestamp with time zone","notNull":false},{"name":"configuration_id","type":"uuid","notNull":true},{"name":"configuration_version","type":"integer","notNull":true},{"name":"endpoint","type":"text","notNull":true}],"turn_private.planning_v2_collector_outputs":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"output_digest","type":"text","notNull":true},{"name":"usage_digest","type":"text","notNull":true},{"name":"output_wire","type":"jsonb","notNull":true},{"name":"usage_receipt_id","type":"uuid","notNull":true},{"name":"usage_wire","type":"jsonb","notNull":true},{"name":"recorded_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_completed_receipts":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"revision","type":"integer","notNull":true},{"name":"receipt","type":"jsonb","notNull":true}],"turn_private.planning_v2_completion_proofs":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"transaction_id","type":"xid8","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"original_lease","type":"uuid","notNull":true},{"name":"current_lease","type":"uuid","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"content_digest","type":"text","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"output_digest","type":"text","notNull":true},{"name":"usage_digest","type":"text","notNull":true},{"name":"content","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_execution_runs":[{"name":"id","type":"uuid","notNull":true},{"name":"profile_id","type":"uuid","notNull":true},{"name":"profile_revision","type":"integer","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"original_lease","type":"uuid","notNull":true},{"name":"source","type":"jsonb","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"collector_principal_id","type":"uuid","notNull":true},{"name":"origin_kind","type":"text","notNull":true},{"name":"execution","type":"jsonb","notNull":true},{"name":"profile_snapshot","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.planning_v2_external_call_windows":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"calls","type":"integer","notNull":true}],"turn_private.planning_v2_model_attempt_bindings":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"claim_lease","type":"uuid","notNull":true},{"name":"text_policy_id","type":"uuid","notNull":true},{"name":"planning_policy_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"provider","type":"text","notNull":true},{"name":"model","type":"text","notNull":true},{"name":"price_version","type":"text","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"bound_at","type":"timestamp with time zone","notNull":true},{"name":"unknown_at","type":"timestamp with time zone","notNull":false}],"turn_private.planning_v2_model_local_journal":[{"name":"request_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"scope_id","type":"uuid","notNull":true},{"name":"attempt_id","type":"uuid","notNull":true},{"name":"binding","type":"jsonb","notNull":true},{"name":"payload_digest","type":"text","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"phase","type":"text","notNull":true},{"name":"revision","type":"bigint","notNull":true},{"name":"intent_at","type":"timestamp with time zone","notNull":true},{"name":"send_at","type":"timestamp with time zone","notNull":false},{"name":"response_at","type":"timestamp with time zone","notNull":false},{"name":"unknown_at","type":"timestamp with time zone","notNull":false},{"name":"send_observation","type":"jsonb","notNull":false},{"name":"response_observation","type":"jsonb","notNull":false},{"name":"output_wire","type":"jsonb","notNull":false},{"name":"unknown_reason","type":"text","notNull":false}],"turn_private.planning_v2_place_checkpoints":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"claim_lease","type":"uuid","notNull":true},{"name":"intake_digest","type":"text","notNull":true},{"name":"planning_digest","type":"text","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"started_at","type":"timestamp with time zone","notNull":true},{"name":"observation","type":"jsonb","notNull":false},{"name":"completed_at","type":"timestamp with time zone","notNull":false}],"turn_private.planning_v2_result_claims":[{"name":"execution_id","type":"uuid","notNull":true},{"name":"action_key","type":"text","notNull":true},{"name":"content_digest","type":"text","notNull":true},{"name":"lease_token","type":"uuid","notNull":true},{"name":"state","type":"text","notNull":true}],"turn_private.result_artifacts":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"goal_id","type":"uuid","notNull":true},{"name":"input_message_id","type":"uuid","notNull":true},{"name":"trip_id","type":"uuid","notNull":false},{"name":"current_revision","type":"integer","notNull":true},{"name":"lifecycle","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"proposal_id","type":"uuid","notNull":false},{"name":"source_result_id","type":"uuid","notNull":false},{"name":"source_turn_id","type":"uuid","notNull":false}],"turn_private.result_events":[{"name":"id","type":"bigint","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"artifact_id","type":"uuid","notNull":true},{"name":"revision","type":"integer","notNull":true},{"name":"event_type","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.result_revisions":[{"name":"artifact_id","type":"uuid","notNull":true},{"name":"revision","type":"integer","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true},{"name":"input_sequence","type":"bigint","notNull":true},{"name":"task_turn_id","type":"uuid","notNull":true},{"name":"goal_version","type":"integer","notNull":true},{"name":"trip_version","type":"integer","notNull":false},{"name":"memory_basis","type":"jsonb","notNull":true},{"name":"content","type":"jsonb","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"trip_link_operation_id","type":"uuid","notNull":false},{"name":"trip_link_version","type":"integer","notNull":false},{"name":"evidence_basis","type":"jsonb","notNull":true}],"turn_private.service_task_capacity":[{"name":"task_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"policy_version","type":"text","notNull":true},{"name":"tier","type":"text","notNull":true},{"name":"grant_environment","type":"text","notNull":false},{"name":"grant_transaction_id","type":"text","notNull":false},{"name":"admitted_at","type":"timestamp with time zone","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"settled_turn_id","type":"uuid","notNull":false},{"name":"settled_at","type":"timestamp with time zone","notNull":false},{"name":"released_at","type":"timestamp with time zone","notNull":false}],"turn_private.service_task_turns":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"task_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"parent_turn_id","type":"uuid","notNull":false},{"name":"relationship","type":"text","notNull":true},{"name":"idempotency_key","type":"uuid","notNull":true},{"name":"request_digest","type":"text","notNull":true}],"turn_private.service_tasks":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"goal_turn_id","type":"uuid","notNull":true},{"name":"last_turn_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"scope_version","type":"integer","notNull":true},{"name":"expected_result","type":"text","notNull":true},{"name":"goal_digest","type":"text","notNull":true},{"name":"budget_scope_id","type":"uuid","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"capacity_enforced","type":"boolean","notNull":true}],"turn_private.text_content":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"thread_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"locale","type":"text","notNull":true},{"name":"input_text","type":"text","notNull":true},{"name":"output_kind","type":"text","notNull":false},{"name":"output_text","type":"text","notNull":false},{"name":"hidden_at","type":"timestamp with time zone","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true}],"turn_private.text_dispatches":[{"name":"lease_token","type":"uuid","notNull":true},{"name":"turn_id","type":"uuid","notNull":true},{"name":"consent_id","type":"uuid","notNull":true},{"name":"policy_id","type":"uuid","notNull":true},{"name":"dispatched_at","type":"timestamp with time zone","notNull":true}],"turn_private.work":[{"name":"turn_id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"session_id","type":"uuid","notNull":true},{"name":"state","type":"text","notNull":true},{"name":"attempt","type":"integer","notNull":true},{"name":"max_attempts","type":"integer","notNull":true},{"name":"lease_ms","type":"integer","notNull":true},{"name":"lease_token","type":"uuid","notNull":false},{"name":"expires_at","type":"timestamp with time zone","notNull":false},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"execution_mode","type":"text","notNull":true}],"public.turns":[{"name":"id","type":"uuid","notNull":true},{"name":"owner_id","type":"uuid","notNull":true},{"name":"trip_id","type":"uuid","notNull":false},{"name":"status","type":"text","notNull":true},{"name":"created_at","type":"timestamp with time zone","notNull":true},{"name":"thread_id","type":"uuid","notNull":false},{"name":"updated_at","type":"timestamp with time zone","notNull":true}]}'::jsonb->s.relation_name) then return false;end if;
  select array_agg(a.attname::text order by k.ordinality) into pk_n from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(num,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num where c.conrelid=s.relation_name::regclass and c.contype='p';
  if pk_n is distinct from s.pk then return false;end if;
 end loop;
 -- Original fixed FK closure remains unchanged by this module's private auth FK.
 return conversation_data_private.schema_supported_v1() and result_data_private.infrastructure_supported_v1() and result_data_private.digest_v1((select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations'))::text)='75695f209c10f7d1486505632ada19c18337bfa099680caad726a3984d666ec9';
end$$;

create function turn_data_private.conflicts_v1(v text[]) returns jsonb language sql immutable set search_path='' as $$ select coalesce(jsonb_agg(k order by ordinality),'[]'::jsonb) from unnest(array['SCOPE_TOO_LARGE','ACTIVE_WORK','SHARED_OR_FOREIGN_SCOPE','CROSS_TURN_REFERENCE','PROPOSAL_REFERENCE','READINESS_REFERENCE','GUIDE_REFERENCE','SCOPED_EDIT_REFERENCE','NOTIFICATION_REFERENCE','BRIEF_REFERENCE','CORE_EXPORT_COPY','OTHER_DELETE_PENDING','SOURCE_UNSUPPORTED']::text[]) with ordinality a(k,ordinality) where k=any(v) $$;

-- Only actual producer binding selects a nullable-Turn planning message.
create function turn_data_private.graph_source_v1(u uuid,t uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare root_n public.turns;body_n turn_private.text_content;msgs uuid[];arts uuid[];tasks uuid[];goals uuid[];convs uuid[];bad text[]:=array[]::text[];
begin
 select * into root_n from public.turns where id=t and owner_id=u;
 if not found then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 select * into body_n from turn_private.text_content where turn_id=t and owner_id=u;
 if not found or root_n.thread_id is null or body_n.thread_id is distinct from root_n.thread_id then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 perform turn_data_private.authorities_current_v1(u,jsonb_build_array(jsonb_build_object('policyId',body_n.policy_id,'consentId',body_n.consent_id)));
 if root_n.status<>'completed' then bad:=array_append(bad,'ACTIVE_WORK');end if;
 if body_n.hidden_at is not null or turn_data_private.fenced_v1('turnIds',t) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into arts from turn_private.result_artifacts a
 where a.source_turn_id=t or exists(select 1 from turn_private.result_revisions r where r.artifact_id=a.id and r.task_turn_id=t);
 select turn_data_private.union_ids_v1(array_agg(id)) into msgs from turn_private.assistant_messages m
 where m.turn_id=t or exists(select 1 from turn_private.planning_comparisons p where p.turn_id=t and p.message_id=m.id)
  or exists(select 1 from turn_private.result_artifacts a where a.id=any(arts) and a.input_message_id=m.id);
 select turn_data_private.union_ids_v1(array_agg(task_id)) into tasks from (
  select task_id from turn_private.service_task_turns where turn_id=t union select task_id from turn_private.assistant_messages where id=any(msgs)
  union select task_id from turn_private.planning_comparisons where turn_id=t union select task_id from turn_private.result_artifacts where id=any(arts)
 ) bound;
 if exists(select 1 from turn_private.assistant_messages m where m.id=any(msgs) and (m.owner_id<>u or m.turn_id is not null and m.turn_id<>t))
  or exists(select 1 from turn_private.result_artifacts a where a.id=any(arts) and (a.owner_id<>u or a.source_turn_id is not null and a.source_turn_id<>t)) then bad:=array_append(bad,'SHARED_OR_FOREIGN_SCOPE');end if;
 if exists(select 1 from turn_private.assistant_messages m where m.id=any(msgs) and (
  not exists(select 1 from turn_private.assistant_conversations c where c.id=m.conversation_id and c.owner_id=u and c.policy_id=m.policy_id and c.consent_id=m.consent_id)
  or case when m.relationship='independent_question' then m.turn_id is distinct from t or m.id is distinct from root_n.thread_id or m.task_id is not null or m.goal_id is not null or m.scope_version is not null or m.parent_message_id is not null
  else not exists(select 1 from turn_private.service_tasks st join turn_private.assistant_goals g on g.id=m.goal_id where st.id=m.task_id and st.owner_id=u and st.thread_id=root_n.thread_id and g.owner_id=u and g.conversation_id=m.conversation_id and m.scope_version between 1 and g.scope_version) end)) then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 if exists(select 1 from turn_private.assistant_messages m where m.id=any(msgs) and m.parent_message_id is not null and not exists(select 1 from turn_private.assistant_messages pm where pm.id=m.parent_message_id and pm.owner_id=u and pm.conversation_id=m.conversation_id)) then bad:=array_append(bad,'SHARED_OR_FOREIGN_SCOPE');end if;
 if exists(select 1 from turn_private.planning_intake_bindings ib where ib.turn_id=t and (ib.owner_id<>u or not ib.message_id=any(msgs) or not exists(select 1 from turn_private.assistant_messages sm join turn_private.assistant_travel_intakes si on si.message_id=sm.id and si.owner_id=sm.owner_id where sm.id=ib.source_message_id and sm.owner_id=u and sm.sequence=ib.source_sequence and si.intake_revision=ib.source_revision and si.goal_version=ib.source_goal_version))) then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 if exists(select 1 from turn_private.planning_comparisons p left join turn_private.assistant_messages m on m.id=p.message_id
   where p.turn_id=t and (p.owner_id<>u or m.owner_id is distinct from u or m.task_id is distinct from p.task_id or m.goal_id is distinct from p.goal_id or m.scope_version is distinct from p.goal_version or m.sequence is null)) then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 if exists(select 1 from turn_private.result_artifacts a where a.id=any(arts) and (a.source_result_id is not null and not a.source_result_id=any(arts)
   or not exists(select 1 from turn_private.result_revisions r where r.artifact_id=a.id)))
  or exists(select 1 from turn_private.result_revisions r join turn_private.result_artifacts a on a.id=r.artifact_id left join turn_private.assistant_messages m on m.id=a.input_message_id
   where r.artifact_id=any(arts) and (r.owner_id<>u or r.task_turn_id<>t or m.owner_id is distinct from u or m.task_id is distinct from a.task_id or m.goal_id is distinct from a.goal_id or r.input_sequence is distinct from m.sequence or r.goal_version is distinct from m.scope_version))
  or exists(select 1 from turn_private.result_artifacts where not id=any(arts) and (source_result_id=any(arts) or input_message_id=any(msgs)))
  or exists(select 1 from turn_private.assistant_messages where not id=any(msgs) and parent_message_id=any(msgs))
  or exists(select 1 from turn_private.service_task_turns where turn_id<>t and parent_turn_id=t)
  or exists(select 1 from turn_private.planning_intake_bindings where turn_id<>t and (source_message_id=any(msgs) or message_id=any(msgs))) then bad:=array_append(bad,'CROSS_TURN_REFERENCE');end if;
 if exists(select 1 from turn_private.service_tasks st join public.model_budget_attempts ba on ba.task_id=st.id and ba.scope_id=st.budget_scope_id where st.id=any(tasks) and exists(select 1 from turn_private.service_task_turns l where l.task_id=st.id and l.turn_id<>t) and not exists(select 1 from turn_private.planning_model_dispatches d where d.turn_id=t and d.task_id=st.id and d.scope_id=ba.scope_id and d.attempt_id=ba.attempt_id) and not exists(select 1 from turn_private.planning_v2_model_attempt_bindings ab where ab.turn_id=t and ab.task_id=st.id and ab.scope_id=ba.scope_id and ab.attempt_id=ba.attempt_id)) then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 if exists(select 1 from public.model_budget_attempts ba where (ba.task_id=t or ba.task_id=any(tasks)) and not exists(select 1 from public.model_budget_scopes bs where bs.id=ba.scope_id and bs.owner_id=u)) then bad:=array_append(bad,'SHARED_OR_FOREIGN_SCOPE');end if;
 if exists(select 1 from turn_private.planning_v2_model_attempt_bindings ab where ab.turn_id=t and (ab.owner_id<>u or not exists(select 1 from turn_private.text_content tc where tc.turn_id=t and tc.owner_id=u and tc.policy_id=ab.text_policy_id) or not exists(select 1 from turn_private.planning_comparisons pc where pc.turn_id=t and pc.owner_id=u and pc.task_id=ab.task_id and pc.planning_policy_id=ab.planning_policy_id))) then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 -- Hiding a task goal root suppresses the original task reader. Preserve any other dependent Turn.
 if exists(select 1 from turn_private.service_tasks st where st.id=any(tasks) and st.goal_turn_id=t and
   (st.last_turn_id<>t or exists(select 1 from turn_private.service_task_turns l where l.task_id=st.id and l.turn_id<>t)
    or exists(select 1 from turn_private.assistant_messages m where m.task_id=st.id and not m.id=any(msgs))
    or exists(select 1 from turn_private.result_artifacts a where a.task_id=st.id and not a.id=any(arts)))) then bad:=array_append(bad,'CROSS_TURN_REFERENCE');end if;
 select turn_data_private.union_ids_v1(array_agg(goal_id)),turn_data_private.union_ids_v1(array_agg(conversation_id)) into goals,convs from turn_private.assistant_messages where id=any(msgs) and owner_id=u;
 if exists(select 1 from unnest(tasks) x where not exists(select 1 from turn_private.service_tasks st where st.id=x and st.owner_id=u and st.thread_id=root_n.thread_id))
  or exists(select 1 from turn_private.service_task_turns where turn_id=t and (owner_id<>u or not task_id=any(tasks))) then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 -- The real current version writer is the goal body authority, never text similarity.
 if exists(select 1 from turn_private.assistant_goals g where g.id=any(goals) and (g.owner_id<>u or g.current_text is null or
  (select count(*) from turn_private.assistant_messages w where w.goal_id=g.id and w.conversation_id=g.conversation_id and w.owner_id=u and w.scope_version=g.scope_version and w.relationship in('goal_start','amendment'))<>1)) then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 if exists(select 1 from turn_private.assistant_goals g join turn_private.assistant_messages w on w.goal_id=g.id and w.conversation_id=g.conversation_id and w.owner_id=g.owner_id and w.scope_version=g.scope_version and w.relationship in('goal_start','amendment') where g.id=any(goals) and w.id=any(msgs)) then bad:=array_append(bad,'CROSS_TURN_REFERENCE');end if;
 return jsonb_build_object('graph',jsonb_build_object('turnIds',array[t],'messageIds',msgs,'artifactIds',arts),
  'retainedReferences',jsonb_build_object('taskIds',tasks,'threadIds',array[root_n.thread_id],'conversationIds',convs,'goalIds',goals,'tripIds',array[]::uuid[],'memoryIds',array[]::uuid[]),'conflicts',turn_data_private.conflicts_v1(bad));
end$$;

create function turn_data_private.related_v1(rel text,v jsonb,g jsonb,refs jsonb,ex uuid[],u uuid) returns boolean
language plpgsql stable set search_path='' as $$
declare t uuid:=(g->'turnIds'->>0)::uuid;
begin
 if rel='public.turns' then return v->>'id'=t::text;
 elsif rel='turn_private.service_tasks' then return refs->'taskIds' ? (v->>'id');
 elsif rel='turn_private.service_task_capacity' then return refs->'taskIds' ? (v->>'task_id');
 elsif rel='turn_private.assistant_messages' then return g->'messageIds' ? (v->>'id');
 elsif rel in('turn_private.assistant_message_source_receipts','turn_private.assistant_travel_intakes') then return g->'messageIds' ? (v->>'message_id');
 elsif rel='turn_private.result_artifacts' then return g->'artifactIds' ? (v->>'id');
 elsif rel in('turn_private.result_revisions','turn_private.result_events') then return g->'artifactIds' ? (v->>'artifact_id');
 elsif rel='public.model_budget_attempts' then
  return (v->>'task_id'=t::text and exists(select 1 from public.model_budget_scopes s where s.id=(v->>'scope_id')::uuid and s.owner_id=u))
   or exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks st on st.id=l.task_id join public.model_budget_scopes bs on bs.id=st.budget_scope_id where l.turn_id=t and l.owner_id=u and st.owner_id=u and bs.owner_id=u and st.id=(v->>'task_id')::uuid and bs.id=(v->>'scope_id')::uuid)
   or exists(select 1 from turn_private.planning_model_dispatches d join public.model_budget_scopes s on s.id=d.scope_id where d.turn_id=t and d.owner_id=u and s.owner_id=u and d.task_id=(v->>'task_id')::uuid and d.scope_id=(v->>'scope_id')::uuid and d.attempt_id=(v->>'attempt_id')::uuid)
   or exists(select 1 from turn_private.planning_v2_model_attempt_bindings b join public.model_budget_scopes s on s.id=b.scope_id where b.turn_id=t and b.owner_id=u and s.owner_id=u and b.task_id=(v->>'task_id')::uuid and b.scope_id=(v->>'scope_id')::uuid and b.attempt_id=(v->>'attempt_id')::uuid);
 elsif rel in('turn_private.planning_v2_collector_origins','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_external_call_windows','turn_private.planning_v2_result_claims') then return (v->>'execution_id')::uuid=any(ex);
 else return v->>'turn_id'=t::text;end if;
end$$;

create function turn_data_private.source_v1(u uuid,t uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b jsonb;g jsonb;refs jsonb;bad text[];spec record;v jsonb;pk_n jsonb;ref record;rel text;ex uuid[];parents uuid[];rows_n jsonb[]:=array[]::jsonb[];reverse_n jsonb[]:=array[]::jsonb[];
 impact_n jsonb;auths jsonb:='[]';witness jsonb;erase_n jsonb:=turn_data_private.zero_counts_v1('erase');redact_n jsonb:=turn_data_private.zero_counts_v1('redact');retain_n jsonb:=turn_data_private.zero_counts_v1('retain');total_n integer:=0;n integer;effect_n text;qualified boolean;fp jsonb;trips_n uuid[]:=array[]::uuid[];mems uuid[]:=array[]::uuid[];
begin
 if turn_data_private.schema_supported_v1() is not true then
  select jsonb_build_array(jsonb_build_object('policyId',c.policy_id,'consentId',c.consent_id)) into auths from turn_private.text_content c join public.turns pt on pt.id=c.turn_id and pt.owner_id=c.owner_id where c.turn_id=t and c.owner_id=u;
  if not found then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;perform turn_data_private.authorities_current_v1(u,auths);
  return jsonb_build_object('graph',jsonb_build_object('turnIds',array[t],'messageIds',array[]::uuid[],'artifactIds',array[]::uuid[]),'retainedReferences',turn_data_private.empty_references_v1(),'rows','[]'::jsonb,'reverse','[]'::jsonb,'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',auths,'conflicts','["SOURCE_UNSUPPORTED"]'::jsonb,'sourceDigest',turn_data_private.digest_v1(jsonb_build_array(t,'SOURCE_UNSUPPORTED')::text));
 end if;
 b:=turn_data_private.graph_source_v1(u,t);g:=b->'graph';refs:=b->'retainedReferences';
 select coalesce(array_agg(value#>>'{}'),array[]::text[]) into bad from jsonb_array_elements(b->'conflicts');
 select coalesce(array_agg(id order by id),array[]::uuid[]) into ex from turn_private.planning_v2_execution_runs where turn_id=t and owner_id=u;
 for spec in select * from turn_data_private.sources_v1() order by relation_name collate "C" loop
  n:=0;
  for v in execute format('select to_jsonb(a) from %s a where turn_data_private.related_v1(%L,to_jsonb(a),$1,$2,$3,$4) order by %s limit 10001',spec.relation_name,spec.relation_name,(select string_agg(format('a.%I',k),',') from unnest(spec.pk) k)) using g,refs,ex,u loop
   n:=n+1;total_n:=total_n+1;if total_n>4100 then bad:=array_append(bad,'SCOPE_TOO_LARGE');exit;end if;
   pk_n:=turn_data_private.row_key_v1(v,spec.pk);effect_n:=spec.effect;
   qualified:=not spec.has_owner or v->>'owner_id'=u::text;
   if not qualified then bad:=array_append(bad,'SHARED_OR_FOREIGN_SCOPE');end if;
   if spec.count_key='memoryConsumers' and v->>'proposal_id' is not null then effect_n:='retain';bad:=array_append(bad,'PROPOSAL_REFERENCE');end if;
   rows_n:=array_append(rows_n,jsonb_build_object('table',spec.relation_name,'pk',pk_n,'digest',turn_data_private.digest_v1(v::text),'effect',effect_n,'countKey',spec.count_key));
   if effect_n='erase' then erase_n:=jsonb_set(erase_n,array[spec.count_key],to_jsonb((erase_n->>spec.count_key)::integer+1));
   elsif effect_n='redact' then redact_n:=jsonb_set(redact_n,array[spec.count_key],to_jsonb((redact_n->>spec.count_key)::integer+1));
   elsif retain_n ? spec.count_key then retain_n:=jsonb_set(retain_n,array[spec.count_key],to_jsonb((retain_n->>spec.count_key)::integer+1));end if;
   if spec.count_key='messageBodies' then retain_n:=jsonb_set(retain_n,'{messages}',to_jsonb((retain_n->>'messages')::integer+1));end if;
   if spec.count_key='tasks' and v->>'goal_turn_id'=t::text then redact_n:=jsonb_set(redact_n,'{taskDigests}',to_jsonb((redact_n->>'taskDigests')::integer+1));end if;
   if v->>'policy_id' is not null and v->>'consent_id' is not null then auths:=auths||jsonb_build_array(jsonb_build_object('policyId',v->'policy_id','consentId',v->'consent_id'));end if;
   if v->>'planning_policy_id' is not null and v->>'planning_consent_id' is not null then auths:=auths||jsonb_build_array(jsonb_build_object('policyId',v->'planning_policy_id','consentId',v->'planning_consent_id'));end if;
   -- Dispatch has a text authority even though it has no owner column.
   if v->>'text_policy_id' is not null then
    auths:=auths||coalesce((select jsonb_agg(jsonb_build_object('policyId',tc.policy_id,'consentId',tc.consent_id)) from turn_private.text_content tc where tc.turn_id=t and tc.owner_id=u and tc.policy_id=(v->>'text_policy_id')::uuid),'[]'::jsonb);
   end if;
   for ref in select * from turn_data_private.json_references_v1(v) loop
    if ref.kind in('turnIds','messageIds','artifactIds') and not(g->ref.kind ? ref.entity_id::text)
     and not(cardinality(ref.path_n)=1 and ref.path_n[1] in('parent_turn_id','parent_message_id','source_message_id','goal_turn_id','last_turn_id')) then bad:=array_append(bad,'CROSS_TURN_REFERENCE');end if;
   end loop;
   if spec.count_key='work' and v->>'state' not in('completed','failed','cancelled')
    or spec.count_key='assistJobs' and v->>'status' in('queued','running')
    or spec.count_key='planning' and v->>'state'<>'completed'
    or spec.count_key='capacity' and v->>'state'='reserved'
    or spec.count_key='budgetAttempts' and v->>'status' not in('settled','released')
    or spec.count_key='checkpoints' and v->>'state'<>'completed'
    or spec.count_key='attemptBindings' and v->>'unknown_at' is not null
    or spec.count_key='collectorOrigins' and (v->>'unknown_at' is not null or v->>'attempted_at' is not null and v->>'response_buffered_at' is null)
    or spec.count_key='executionRuns' and (not exists(select 1 from turn_private.planning_v2_completion_proofs cp where cp.execution_id=(v->>'id')::uuid and cp.owner_id=u and cp.turn_id=t) or not exists(select 1 from turn_private.planning_v2_completed_receipts cr where cr.execution_id=(v->>'id')::uuid and cr.owner_id=u and cr.turn_id=t))
    or spec.count_key='resultClaims' and v->>'state'<>'completed'
    or spec.count_key='localJournals' and (v->>'unknown_at' is not null or v->>'phase'<>'response_recorded' or not exists(select 1 from turn_private.planning_v2_completed_receipts c where c.turn_id=t and c.owner_id=u))
    or spec.count_key='callWindows' and (v->>'calls')::integer>0 and not exists(select 1 from turn_private.planning_v2_completion_proofs p where p.execution_id=(v->>'execution_id')::uuid and p.owner_id=u) then bad:=array_append(bad,'ACTIVE_WORK');end if;
   if v->>'proposal_id' is not null or v->'content'->>'schemaVersion' in('proposal_preview/1','change-proposal/1') then bad:=array_append(bad,'PROPOSAL_REFERENCE');end if;
   if notification_private.uuid(v->'trip_id') then trips_n:=turn_data_private.union_ids_v1(trips_n||array[(v->>'trip_id')::uuid]);end if;
   if notification_private.uuid(v->'memory_id') then mems:=turn_data_private.union_ids_v1(mems||array[(v->>'memory_id')::uuid]);end if;
   if jsonb_typeof(v->'memory_basis')='array' then select turn_data_private.union_ids_v1(mems||coalesce(array_agg(coalesce(x->>'memoryId',x->>'id')::uuid),array[]::uuid[])) into mems from jsonb_array_elements(v->'memory_basis') x where notification_private.uuid(coalesce(x->'memoryId',x->'id'));end if;
  end loop;
  if total_n>4100 then exit;end if;
 end loop;
 -- Parent bytes and the current writer basis enter CAS, never the returned graph or body.
 for rel in select unnest(array['public.chat_threads','turn_private.assistant_conversations','turn_private.assistant_goals']) loop
  parents:=privacy_private.linked_delete_array_v1(refs->case rel when 'public.chat_threads' then 'threadIds' when 'turn_private.assistant_conversations' then 'conversationIds' else 'goalIds' end);
  for v in execute format('select to_jsonb(a) from %s a where id=any($1) and owner_id=$2 order by id',rel) using parents,u loop
   total_n:=total_n+1;reverse_n:=array_append(reverse_n,jsonb_build_object('table',rel,'pk',jsonb_build_object('id',v->'id'),'digest',turn_data_private.digest_v1(v::text)));
  end loop;
 end loop;
 retain_n:=retain_n||jsonb_build_object('threads',jsonb_array_length(refs->'threadIds'),'conversations',jsonb_array_length(refs->'conversationIds'),'goals',jsonb_array_length(refs->'goalIds'));
 for v in select to_jsonb(w) from turn_private.assistant_messages w join turn_private.assistant_goals goal on goal.id=w.goal_id and goal.conversation_id=w.conversation_id and goal.owner_id=w.owner_id and goal.scope_version=w.scope_version where goal.id=any(privacy_private.linked_delete_array_v1(refs->'goalIds')) and w.owner_id=u and w.relationship in('goal_start','amendment') order by w.id loop
  total_n:=total_n+1;reverse_n:=array_append(reverse_n,jsonb_build_object('table','turn_private.assistant_messages','pk',jsonb_build_object('id',v->'id'),'digest',turn_data_private.digest_v1(v::text)));
 end loop;
 -- Original connected-set helper preserves the entire six-table mixed-copy CAS.
 impact_n:=conversation_data_private.impact_inventory_v1(g);
 for v in select value from jsonb_array_elements(impact_n->'rows') loop reverse_n:=array_append(reverse_n,v);total_n:=total_n+1;end loop;
 if impact_n->'rows'<>'[]'::jsonb then bad:=array_append(bad,'SOURCE_UNSUPPORTED');end if;
 if impact_n->'overflow'='true'::jsonb then bad:=array_append(bad,'SCOPE_TOO_LARGE');end if;
 -- All actual reverse direct/nested relations are inspected, including terminal copies.
 for rel in select distinct n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
  where c.relkind='r' and a.attnum>0 and not a.attisdropped and n.nspname not in('pg_catalog','information_schema','extensions','auth','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations','turn_data_private')
   and not(n.nspname='knowledge_review_private' and c.relname in('source_impact_sets','source_impact_items','source_impact_pages','source_impact_outbox','source_impact_projections','source_impact_review_requests'))
   and (a.atttypid in('json'::regtype,'jsonb'::regtype) or turn_data_private.reference_kind_v1(a.attname::text) is not null) order by 1 loop
  for v in execute format('select to_jsonb(a) from %s a where exists(select 1 from turn_data_private.json_references_v1(conversation_data_private.documents_v1(%L,to_jsonb(a))) r where $1->r.kind ? r.entity_id::text) order by to_jsonb(a)::text collate "C" limit 4101',rel,rel) using g loop
   if exists(select 1 from unnest(rows_n) r where r->>'table'=rel and r->'digest'=to_jsonb(turn_data_private.digest_v1(v::text))) then continue;end if;
   -- Retained task/identity source and own authority diagnostics do not become parent sweeps.
   total_n:=total_n+1;reverse_n:=array_append(reverse_n,jsonb_build_object('table',rel,'digest',turn_data_private.digest_v1(v::text)));
   bad:=bad||case
    when rel like 'readiness_private.%' then 'READINESS_REFERENCE' when rel like 'guide_private.%' then 'GUIDE_REFERENCE'
    when rel like 'scoped_edit_private.%' then 'SCOPED_EDIT_REFERENCE' when rel like 'notification_private.%' then 'NOTIFICATION_REFERENCE'
    when rel like 'service_brief_private.%' then 'BRIEF_REFERENCE' when rel like 'knowledge_review_private.source_impact_%' then 'SOURCE_UNSUPPORTED'
    when rel like 'conversation_data_private.%' or rel like 'result_data_private.%' or rel like 'privacy_private.%' then 'OTHER_DELETE_PENDING'
    when exists(select 1 from turn_data_private.sources_v1() s where s.relation_name=rel) or rel in('turn_private.assistant_messages','public.trip_proposals','turn_private.assistant_goal_trip_links','turn_private.assistant_goal_trip_receipts') then 'CROSS_TURN_REFERENCE'
    when rel like 'public.%proposal%' then 'PROPOSAL_REFERENCE' else 'SOURCE_UNSUPPORTED' end;
   if total_n>4100 then bad:=array_append(bad,'SCOPE_TOO_LARGE');exit;end if;
  end loop;
  if total_n>4100 then exit;end if;
 end loop;
 for rel in select unnest(array['export_private.core_jobs_v1','export_private.core_artifacts_v1']) loop
  for v in execute format('select to_jsonb(a) from %s a where owner_id=$1 order by request_id limit 4101',rel) using u loop
   total_n:=total_n+1;reverse_n:=array_append(reverse_n,jsonb_build_object('table',rel,'digest',turn_data_private.digest_v1(v::text)));
   if rel='export_private.core_artifacts_v1' or v->>'state' in('queued','running') or (v->>'lease_expires_at')::timestamptz>clock_timestamp() then bad:=array_append(bad,'CORE_EXPORT_COPY');end if;
  end loop;
 end loop;
 if exists(select 1 from privacy_private.trip_deletions where owner_id=u and trip_id=any(trips_n) and state='queued')
  or exists(select 1 from privacy_private.linked_delete_fences_v1 f where exists(select 1 from jsonb_each(g) e where e.value ? f.entity_id::text)) then bad:=array_append(bad,'OTHER_DELETE_PENDING');end if;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into trips_n from public.trips where id=any(trips_n) and owner_id=u;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into mems from public.memory_profiles where id=any(mems) and owner_id=u;
 refs:=refs||jsonb_build_object('tripIds',trips_n,'memoryIds',mems);
 auths:=turn_data_private.authorities_union_v1(auths);witness:=turn_data_private.authorities_current_v1(u,auths);
 fp:=jsonb_build_object('graph',g,'rows',to_jsonb(rows_n),'reverse',to_jsonb(reverse_n),'retainedReferences',refs,'sourceAuthorities',auths,'authorityWitness',witness,'conflicts',turn_data_private.conflicts_v1(bad));
 if total_n+jsonb_array_length(witness)+cardinality(trips_n)+cardinality(mems)>4100 or octet_length(fp::text)>1000000 then bad:=array_append(bad,'SCOPE_TOO_LARGE');end if;
 return jsonb_build_object('graph',g,'retainedReferences',refs,'rows',to_jsonb(rows_n),'reverse',to_jsonb(reverse_n),'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',auths,'conflicts',turn_data_private.conflicts_v1(bad),'sourceDigest',turn_data_private.digest_v1(fp::text));
end$$;

create function turn_data_private.clear_proof_required_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from turn_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id())
  then raise exception 'TURN_CONFLICT';end if;
 return null;
end$$;

create function turn_data_private.immutable_operation_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare authority_n boolean;
begin
 if tg_op='DELETE' then
  -- Original owner account cascade is allowed; session deletion cannot get here.
  if exists(select 1 from auth.users where id=old.owner_id) then raise exception 'TURN_CONFLICT';end if;
  return old;
 end if;
 if row(new.request_id,new.owner_id,new.session_id,new.mobile_epoch,new.scope,new.turn_id,new.object_ids,new.source_digest,new.preview_digest,new.source_authorities,new.captured_at,new.expires_at)
  is distinct from row(old.request_id,old.owner_id,old.session_id,old.mobile_epoch,old.scope,old.turn_id,old.object_ids,old.source_digest,old.preview_digest,old.source_authorities,old.captured_at,old.expires_at)
  then raise exception 'TURN_CONFLICT';end if;
 if old.request_digest is not null and (new.source_identity_keys is distinct from old.source_identity_keys or new.mutation_bytes is distinct from old.mutation_bytes or new.request_digest is distinct from old.request_digest or new.decision is distinct from old.decision or new.state is distinct from old.state)
  then raise exception 'TURN_CONFLICT';end if;
 if old.preview_erased and (not new.preview_erased or new.graph is not null or new.erase_counts is not null or new.redact_counts is not null
  or new.retain_counts is not null or new.retained_references is not null or new.conflicts is not null) then raise exception 'TURN_CONFLICT';end if;
 if not old.preview_erased and not new.preview_erased then
  if row(new.graph,new.erase_counts,new.redact_counts,new.retain_counts,new.retained_references,new.conflicts)
   is distinct from row(old.graph,old.erase_counts,old.redact_counts,old.retain_counts,old.retained_references,old.conflicts)
   then raise exception 'TURN_CONFLICT';end if;
 end if;
 select exists(select 1 from turn_data_private.transaction_proofs_v1 p
  join turn_data_private.operations_v1 request_n on request_n.request_id=p.request_id and request_n.owner_id=p.owner_id
  where p.transaction_id=pg_current_xact_id() and p.owner_id=old.owner_id and p.source_digest=request_n.source_digest
  and p.expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint
  and (p.request_id=old.request_id or (request_n.scope='turn-delete-progress/1' and old.request_id=any(request_n.object_ids)))) into authority_n;
 if authority_n is not true then raise exception 'TURN_CONFLICT';end if;
 return new;
end$$;

create function turn_data_private.operation_row_v1(r turn_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',r.request_id,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
  'scope',r.scope,'turnId',r.turn_id,'objectIds',r.object_ids,
  'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'sourceAuthorities',r.source_authorities,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
  'requestDigest',r.request_digest,'state',r.state,'previewErased',r.preview_erased,'graph',r.graph,
  'eraseCounts',r.erase_counts,'redactCounts',r.redact_counts,'retainCounts',r.retain_counts,
  'retainedReferences',r.retained_references,'conflicts',r.conflicts,'decision',r.decision)
$$;

create function turn_data_private.progress_source_v1(u uuid,ids uuid[],request_n uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare inventory_n jsonb;authorities_n jsonb;witness_n jsonb;count_n integer;
begin
 select coalesce(jsonb_agg(turn_data_private.operation_row_v1(actual) order by request_id),'[]'::jsonb),count(*) into inventory_n,count_n
  from turn_data_private.operations_v1 actual where owner_id=u and request_id=any(ids) and request_id<>request_n;
 if count_n<>cardinality(ids) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 select turn_data_private.authorities_union_v1(coalesce(jsonb_agg(pair),'[]'::jsonb)) into authorities_n
  from jsonb_array_elements(inventory_n) op cross join lateral jsonb_array_elements(op->'sourceAuthorities') pair;
 if jsonb_array_length(authorities_n)>100 or octet_length(inventory_n::text)>1000000 then raise exception 'TURN_CAPACITY';end if;
 witness_n:=turn_data_private.authorities_current_v1(u,authorities_n);
 return jsonb_build_object('graph',turn_data_private.empty_graph_v1(),'eraseCounts',turn_data_private.zero_counts_v1('erase'),
  'redactCounts',turn_data_private.zero_counts_v1('redact'),'retainCounts',turn_data_private.zero_counts_v1('retain'),'sourceAuthorities',authorities_n,
  'retainedReferences',turn_data_private.empty_references_v1(),'conflicts','[]'::jsonb,
  'sourceDigest',turn_data_private.digest_v1(jsonb_build_array(inventory_n,witness_n)::text));
end$$;

create function turn_data_private.boundaries_v1(scope_n text) returns jsonb language sql immutable set search_path='' as $$
select case scope_n when 'turn-sensitive-data/1' then '{"eraseFields":["selected_turn_events_feedback_idempotency","exclusive_result_revisions_events","selected_intakes_source_receipts","selected_grounded_planning_worker_sensitive_copies","selected_memory_consumer_references"],"redactFields":["selected_text_input_output_permanently_hidden","selected_message_input_fixed_deleted_marker","selected_root_task_digest_fixed_deleted_marker"],"retained":["turn_message_task_thread_conversation_goal_identity","other_turns_and_parent_contents_except_selected_root_task_digest","confirmed_trip_content_history_proposals","explicit_memory_profiles_receipts_consents","capacity_budget_dispatch_financial_metadata","permanent_identity_operation_fences","original_policy_consent_authority_ids"],"missing":["active_shared_cross_turn_and_mixed_result_references_blocked","guide_brief_proposal_knowledge_source_references_require_original_flow","mixed_core_export_copies_require_original_cleanup","provider_external_copies_not_erased","backup_restore_old_device_acceptance_unverified"]}'::jsonb
else '{"eraseFields":["selected_transient_preview_graph_counts_references_conflicts"],"redactFields":[],"retained":["original_selection_actor_epoch_hash_time_operation_fences","immutable_minimal_decisions","original_policy_consent_authority_ids"],"missing":["source_turn_data_not_erased","unselected_operations","external_copies","backup_restore_old_device_acceptance_unverified"]}'::jsonb end $$;
create function turn_data_private.binding_v1(r turn_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schemaVersion','turn-data/1','scope',r.scope,'requestId',r.request_id,'turnId',r.turn_id,'objectIds',r.object_ids,
  'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,
  'sourceAuthorities',r.source_authorities,'capturedAt',r.captured_at,'expiresAt',r.expires_at,'boundaries',turn_data_private.boundaries_v1(r.scope),'allUserDataCompleted',false)
$$;

create function turn_data_private.preview_v1(r turn_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select turn_data_private.binding_v1(r)||jsonb_build_object('kind','preview','graph',r.graph,'eraseCounts',r.erase_counts,'redactCounts',r.redact_counts,'retainCounts',r.retain_counts,
  'retainedReferences',r.retained_references,'conflicts',r.conflicts,'eligible',r.conflicts='[]'::jsonb,'progressCount',case when r.scope='turn-delete-progress/1' then cardinality(r.object_ids) else 0 end)
$$;

create function turn_data_private.receipt_v1(r turn_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select turn_data_private.binding_v1(r)||jsonb_build_object('kind','receipt','state','erased','decision',r.decision)
$$;

create constraint trigger turn_proof_must_exit_v1 after insert or update on turn_data_private.transaction_proofs_v1 deferrable initially deferred for each row execute function turn_data_private.clear_proof_required_v1();
create trigger turn_operation_immutable_v1 before update or delete on turn_data_private.operations_v1 for each row execute function turn_data_private.immutable_operation_v1();


create function turn_data_private.input_v1(v jsonb,a text,recovering boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
declare keys_n text[]:=array['action','scope'];o jsonb;
begin
 if v->>'action' is distinct from a or v->>'scope' not in('turn-sensitive-data/1','turn-delete-progress/1') then return false;end if;
 if a='list' then
  return notification_private.exact(v,keys_n||array['cursor','limit']) and v->'limit'='20'::jsonb and (v->'cursor'='null'::jsonb or notification_private.exact(v->'cursor',array['sourceDigest','afterId']) and notification_private.uuid(v->'cursor'->'afterId') and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$');
 end if;
 keys_n:=keys_n||array['requestId','turnId','objectIds'];
 if notification_private.uuid(v->'requestId') is not true then return false;end if;
 if v->>'scope'='turn-sensitive-data/1' then
  if notification_private.uuid(v->'turnId') is not true or v->'objectIds' is distinct from '[]'::jsonb then return false;end if;
 elsif v->'turnId' is distinct from 'null'::jsonb or turn_data_private.ids_v1(v->'objectIds',20) is not true or jsonb_array_length(v->'objectIds')=0 or v->'objectIds' ? (v->>'requestId') then return false;end if;
 if a='erase' then
  keys_n:=keys_n||array['sourceDigest','previewDigest','confirmed'];
  if v->'confirmed' is distinct from 'true'::jsonb or (v->>'sourceDigest' ~ '^[a-f0-9]{64}$' and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 elsif a='recover' then
  keys_n:=keys_n||array['mutationBytes'];if recovering or jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
  begin o:=(v->>'mutationBytes')::jsonb;exception when others then return false;end;
  if turn_data_private.input_v1(o,'erase',true) is not true or row(v->'scope',v->'requestId',v->'turnId',v->'objectIds') is distinct from row(o->'scope',o->'requestId',o->'turnId',o->'objectIds') then return false;end if;
 elsif a<>'preview' then return false;end if;
 return notification_private.exact(v,keys_n);
end$$;

create function turn_data_private.lock_source_v1(u uuid,src jsonb) returns void language plpgsql volatile security definer set search_path='' as $$
declare id_n uuid;r record;v jsonb;s record;g jsonb:=src->'graph';refs jsonb:=src->'retainedReferences';
begin
 for id_n in select distinct value::uuid from(select jsonb_array_elements_text(refs->'taskIds') value union select jsonb_array_elements_text(g->'turnIds')) a order by 1 loop
  if not pg_try_advisory_xact_lock(hashtextextended('service-task-identity:'||id_n::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
 end loop;
 perform 1 from turn_private.service_tasks where id=any(privacy_private.linked_delete_array_v1(refs->'taskIds')) and owner_id=u order by id for update nowait;
 for v in select value from jsonb_array_elements(src->'rows') where value->>'effect'='erase' order by value->>'table' collate "C",(value->'pk')::text collate "C" loop
  if not pg_try_advisory_xact_lock(hashtextextended('turn-data-source-key:'||(v->>'table')||':'||turn_data_private.digest_v1((v->'pk')::text),0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
 end loop;
 for r in select e.key kind,x.value::uuid id from jsonb_each(g) e cross join lateral jsonb_array_elements_text(e.value) x order by e.key collate "C",x.value::uuid loop
  if not pg_try_advisory_xact_lock(hashtextextended('turn-data-entity:'||r.kind||':'||r.id::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
 end loop;
 -- Original Conversation/Result entity guards share these identities too.
 for r in select e.key kind,x.value::uuid id from jsonb_each(g||refs) e cross join lateral jsonb_array_elements_text(e.value) x where e.key in('turnIds','messageIds','artifactIds','taskIds','threadIds','conversationIds','goalIds') order by e.key collate "C",x.value::uuid loop
  if not pg_try_advisory_xact_lock(hashtextextended('conversation-data-entity:'||r.kind||':'||r.id::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
 end loop;
 for v in select value from jsonb_array_elements((src->'rows')||(src->'reverse')) where value ? 'pk' order by value->>'table' collate "C",(value->'pk')::text collate "C" loop
  select * into s from turn_data_private.sources_v1() where relation_name=v->>'table';
  if not found then s.pk:=array['id'];end if;
  execute format('select 1 from %s a where turn_data_private.row_key_v1(to_jsonb(a),$1)=$2 for update nowait',v->>'table') using s.pk,v->'pk';
 end loop;
 perform turn_data_private.authorities_current_v1(u,src->'sourceAuthorities');
end$$;

create function turn_data_private.write_hooks_valid_v1() returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from unnest(array['public.chat_turn_events','public.chat_turn_idempotency','public.memory_consumer_receipts','public.model_budget_attempts','public.turn_feedback','turn_private.assistant_message_source_receipts','turn_private.assistant_messages','turn_private.assistant_travel_intakes','turn_private.grounded_ai_assist_jobs','turn_private.grounded_turns','turn_private.planning_action_receipts','turn_private.planning_comparisons','turn_private.planning_intake_bindings','turn_private.planning_model_dispatches','turn_private.planning_observations','turn_private.planning_v2_collector_origins','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_completed_receipts','turn_private.planning_v2_completion_proofs','turn_private.planning_v2_execution_runs','turn_private.planning_v2_external_call_windows','turn_private.planning_v2_model_attempt_bindings','turn_private.planning_v2_model_local_journal','turn_private.planning_v2_place_checkpoints','turn_private.planning_v2_result_claims','turn_private.result_artifacts','turn_private.result_events','turn_private.result_revisions','turn_private.service_task_capacity','turn_private.service_task_turns','turn_private.service_tasks','turn_private.text_content','turn_private.text_dispatches','turn_private.work','public.turns','public.trip_proposals','turn_private.assistant_goal_trip_links','turn_private.assistant_goal_trip_receipts','knowledge_review_private.source_impact_sets','knowledge_review_private.source_impact_items','knowledge_review_private.source_impact_pages','knowledge_review_private.source_impact_outbox','knowledge_review_private.source_impact_projections','knowledge_review_private.source_impact_review_requests','readiness_private.scopes_v1','readiness_private.operations_v1','guide_private.bindings_v1','scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.contexts_v1','scoped_edit_private.operations_v1','notification_private.reminders','notification_private.watches','notification_private.dismissals','service_brief_private.briefs','service_brief_private.previews','service_brief_private.operations']::text[]) rel where not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(rel) and t.tgname='turn_data_parent_fence_v1' and t.tgenabled='O' and t.tgtype=31 and not t.tgisinternal and t.tgfoid=to_regprocedure('turn_data_private.guard_source_v1()')))
$$;
create function turn_data_private.erase_source_v1(u uuid,src jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare spec record;v jsonb;n integer;ec jsonb:=turn_data_private.zero_counts_v1('erase');rc jsonb:=turn_data_private.zero_counts_v1('redact');t uuid:=(src->'graph'->'turnIds'->>0)::uuid;rel text;remaining integer;keys_n jsonb;
begin
 if turn_data_private.write_hooks_valid_v1() is not true then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 update turn_private.text_content set input_text='[deleted by scoped turn request]',output_kind=null,output_text=null,hidden_at=coalesce(hidden_at,clock_timestamp()) where turn_id=t and owner_id=u;get diagnostics n=row_count;rc:=jsonb_set(rc,'{textBodies}',to_jsonb(n));
 update turn_private.assistant_messages set input_text='[deleted by scoped turn request]' where id=any(privacy_private.linked_delete_array_v1(src->'graph'->'messageIds')) and owner_id=u;get diagnostics n=row_count;rc:=jsonb_set(rc,'{messageBodies}',to_jsonb(n));
 update turn_private.service_tasks set goal_digest=turn_data_private.digest_v1('[deleted by scoped turn request]') where goal_turn_id=t and id=any(privacy_private.linked_delete_array_v1(src->'retainedReferences'->'taskIds')) and owner_id=u;get diagnostics n=row_count;rc:=jsonb_set(rc,'{taskDigests}',to_jsonb(n));
 foreach rel in array conversation_data_private.erase_order_v1() loop
  select * into spec from turn_data_private.sources_v1() where relation_name=rel and effect='erase';if not found then continue;end if;
  n:=0;
  -- Child artifacts are erased before their source artifacts without parent cascades.
  select coalesce(jsonb_agg(value->'pk'),'[]'::jsonb) into keys_n from jsonb_array_elements(src->'rows') where value->>'table'=rel and value->>'effect'='erase';
  if rel='turn_private.result_artifacts' then
   loop
    execute 'delete from turn_private.result_artifacts a where turn_data_private.row_key_v1(to_jsonb(a),$1) in(select value from jsonb_array_elements($2)) and owner_id=$3 and not exists(select 1 from turn_private.result_artifacts child where child.source_result_id=a.id)' using spec.pk,keys_n,u;
    get diagnostics remaining=row_count;n:=n+remaining;exit when remaining=0;
   end loop;
  else
   for v in select value from jsonb_array_elements(keys_n) loop
    execute format('delete from %s a where turn_data_private.row_key_v1(to_jsonb(a),$1)=$2',rel) using spec.pk,v;
    get diagnostics remaining=row_count;n:=n+remaining;
   end loop;
  end if;
  ec:=jsonb_set(ec,array[spec.count_key],to_jsonb(n));
 end loop;
 if ec is distinct from src->'eraseCounts' or rc is distinct from src->'redactCounts' then raise exception 'TURN_SOURCE_CHANGED';end if;
 return jsonb_build_object('erasedCounts',ec,'redactedCounts',rc,'retainedCounts',src->'retainCounts');
end$$;

create function public.privacy_turn_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor_n jsonb;u uuid;s uuid;e bigint;v jsonb;mutation_n jsonb;bytes_n text;digest_n text;request_n uuid;ids uuid[];
 scope_n text;root_n uuid;r turn_data_private.operations_v1%rowtype;source_n jsonb;rebuilt_n jsonb;
 result_n jsonb;decision_n jsonb;counts_n jsonb;inventory_n jsonb;items_n jsonb;row_n jsonb;preview_hash text;
 captured_n bigint;expires_n bigint;now_n bigint;cleared_n integer:=0;fences_n integer:=0;n integer;after_n uuid;more_n boolean;last_n uuid;new_decision boolean:=false;list_authorities jsonb:='[]'::jsonb;
begin
 actor_n:=turn_data_private.actor_v1(p_expected_epoch);u:=(actor_n->>'ownerId')::uuid;s:=(actor_n->>'sessionId')::uuid;e:=(actor_n->>'mobileEpoch')::bigint;
 if p_action is null or p_input_bytes is null or octet_length(p_input_bytes)>(case p_action when 'recover' then 16384 else 8192 end) then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if turn_data_private.input_v1(v,p_action) is not true then raise exception 'INVALID_INPUT';end if;
 scope_n:=v->>'scope';root_n:=nullif(v->>'turnId','')::uuid;
 captured_n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;expires_n:=captured_n+30000;
 if p_action='list' then
  if scope_n='turn-delete-progress/1' then
   select coalesce(jsonb_agg(turn_data_private.operation_row_v1(actual) order by request_id),'[]'::jsonb) into inventory_n from
    (select * from turn_data_private.operations_v1 where owner_id=u order by request_id limit 10001) actual;
   select turn_data_private.authorities_union_v1(coalesce(jsonb_agg(pair),'[]'::jsonb)) into list_authorities from jsonb_array_elements(inventory_n) op cross join lateral jsonb_array_elements(op->'sourceAuthorities') pair;
   perform turn_data_private.authorities_current_v1(u,list_authorities);
  else
   inventory_n:='[]';
   for row_n in select to_jsonb(listed) from(select jsonb_build_object('turnId',t.id,'threadId',t.thread_id,'taskId',l.task_id,'createdAt',floor(extract(epoch from t.created_at)*1000)::bigint,'status','completed','erased',turn_data_private.fenced_v1('turnIds',t.id)) item,
    tc.policy_id policy_n,tc.consent_id consent_n from public.turns t join turn_private.text_content tc on tc.turn_id=t.id and tc.owner_id=t.owner_id
    left join turn_private.service_task_turns l on l.turn_id=t.id and l.owner_id=t.owner_id where t.owner_id=u and t.status='completed' and t.thread_id=tc.thread_id and t.thread_id is not null order by t.id limit 10001) listed loop
    perform turn_data_private.authorities_current_v1(u,jsonb_build_array(jsonb_build_object('policyId',row_n->'policy_n','consentId',row_n->'consent_n')));
    list_authorities:=turn_data_private.authorities_union_v1(list_authorities||jsonb_build_array(jsonb_build_object('policyId',row_n->'policy_n','consentId',row_n->'consent_n')));
    inventory_n:=inventory_n||jsonb_build_array(row_n->'item');
   end loop;
  end if;
  if jsonb_array_length(inventory_n)>10000 or octet_length(inventory_n::text)>1000000 then raise exception 'TURN_CAPACITY';end if;
  digest_n:=turn_data_private.digest_v1(inventory_n::text);
  after_n:=case when v->'cursor'='null'::jsonb then null else (v->'cursor'->>'afterId')::uuid end;
  if after_n is not null and (v->'cursor'->>'sourceDigest' is distinct from digest_n or not exists(select 1 from jsonb_array_elements(inventory_n) actual where (case when scope_n='turn-delete-progress/1' then actual->>'requestId' else actual->>'turnId' end)=after_n::text)) then raise exception 'TURN_SOURCE_CHANGED';end if;
  select coalesce(jsonb_agg(value order by (case when scope_n='turn-delete-progress/1' then value->>'requestId' else value->>'turnId' end)),'[]'::jsonb) into items_n from
   (select value from jsonb_array_elements(inventory_n) where after_n is null or (case when scope_n='turn-delete-progress/1' then value->>'requestId' else value->>'turnId' end)>after_n::text order by (case when scope_n='turn-delete-progress/1' then value->>'requestId' else value->>'turnId' end) limit 20) page;
  last_n:=nullif((case when scope_n='turn-delete-progress/1' then items_n->-1->>'requestId' else items_n->-1->>'turnId' end),'')::uuid;
  more_n:=exists(select 1 from jsonb_array_elements(inventory_n) where last_n is not null and (case when scope_n='turn-delete-progress/1' then value->>'requestId' else value->>'turnId' end)>last_n::text);
  result_n:=jsonb_build_object('schemaVersion','turn-data/1','kind','list','scope',scope_n,
   'ownerId',u,'sessionId',s,'mobileEpoch',e,'sourceDigest',digest_n,'capturedAt',captured_n,'expiresAt',expires_n,'items',items_n,'hasMore',more_n,
   'nextCursor',case when more_n then jsonb_build_object('sourceDigest',digest_n,'afterId',last_n) else null end,'allUserDataCompleted',false);
 else
  request_n:=(v->>'requestId')::uuid;ids:=privacy_private.linked_delete_array_v1(v->'objectIds');
  if p_action='recover' then bytes_n:=v->>'mutationBytes';mutation_n:=bytes_n::jsonb;else bytes_n:=p_input_bytes;mutation_n:=v;end if;
  digest_n:=turn_data_private.digest_v1(bytes_n);
  -- Filter owner BEFORE any tuple lock or foreign/absent distinction.
  select * into r from turn_data_private.operations_v1 where request_id=request_n and owner_id=u;
  if p_action='recover' and not found then
   result_n:=jsonb_build_object('schemaVersion','turn-data/1','kind','unknown','scope',scope_n,'requestId',request_n,'turnId',root_n,'objectIds',ids,
    'ownerId',u,'sessionId',s,'mobileEpoch',e,'requestDigest',digest_n,'allUserDataCompleted',false);
  else
   if r.request_id is not null then
    if r.session_id<>s or r.mobile_epoch<>e then raise exception 'SESSION_REPLACED';end if;
    if r.scope<>scope_n or r.turn_id is distinct from root_n or r.object_ids is distinct from ids then raise exception 'TURN_SOURCE_CHANGED';end if;
    perform turn_data_private.authorities_current_v1(u,r.source_authorities);
    if p_action in('erase','recover') and (r.source_digest is distinct from mutation_n->>'sourceDigest' or r.preview_digest is distinct from mutation_n->>'previewDigest') then raise exception 'TURN_SOURCE_CHANGED';end if;
   elsif p_action<>'preview' then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   if p_action='recover' then
    if r.state='erased' then
     if r.mutation_bytes is distinct from bytes_n or r.request_digest is distinct from digest_n then raise exception 'TURN_SOURCE_CHANGED';end if;result_n:=turn_data_private.receipt_v1(r);
    else result_n:=jsonb_build_object('schemaVersion','turn-data/1','kind','unknown','scope',scope_n,'requestId',request_n,'turnId',root_n,'objectIds',ids,
     'ownerId',u,'sessionId',s,'mobileEpoch',e,'requestDigest',digest_n,'allUserDataCompleted',false);end if;
   elsif p_action='erase' and r.state='erased' then
    if r.mutation_bytes is distinct from bytes_n or r.request_digest is distinct from digest_n then raise exception 'TURN_SOURCE_CHANGED';end if;result_n:=turn_data_private.receipt_v1(r);
   else
    if r.request_id is not null then perform turn_data_private.deadline_v1(r.captured_at,r.expires_at);end if;
    if scope_n='turn-sensitive-data/1' then
     source_n:=turn_data_private.source_v1(u,root_n);
     if source_n->'conflicts'='[]'::jsonb then perform turn_data_private.lock_source_v1(u,source_n);
      rebuilt_n:=turn_data_private.source_v1(u,root_n);
      if rebuilt_n is distinct from source_n then raise exception 'TURN_SOURCE_CHANGED';end if;source_n:=rebuilt_n;
     end if;
    else
     perform 1 from turn_data_private.operations_v1 where owner_id=u and request_id=any(ids) order by request_id for update nowait;
     source_n:=turn_data_private.progress_source_v1(u,ids,request_n);
    end if;
    -- Original source locks precede request-state lock. All later locks NOWAIT.
    if not pg_try_advisory_xact_lock(hashtextextended('turn-data-request:'||request_n::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
    select * into r from turn_data_private.operations_v1 where request_id=request_n and owner_id=u for update nowait;
    if p_action='preview' and not found then
     select count(*) into n from turn_data_private.operations_v1 where owner_id=u;if n>=10000 then raise exception 'TURN_CAPACITY';end if;
     preview_hash:=turn_data_private.digest_v1(jsonb_build_array(actor_n,v,source_n-'rows',captured_n,expires_n,turn_data_private.boundaries_v1(scope_n))::text);
     insert into turn_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,turn_id,object_ids,source_digest,preview_digest,source_authorities,
      captured_at,expires_at,graph,erase_counts,redact_counts,retain_counts,retained_references,conflicts)
     values(request_n,u,s,e,scope_n,root_n,ids,source_n->>'sourceDigest',preview_hash,source_n->'sourceAuthorities',captured_n,expires_n,
      source_n->'graph',source_n->'eraseCounts',source_n->'redactCounts',source_n->'retainCounts',source_n->'retainedReferences',source_n->'conflicts') returning * into r;
    else
     if r.request_id is null or r.preview_erased then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
     if r.source_digest is distinct from source_n->>'sourceDigest' or r.graph is distinct from source_n->'graph'
      or r.erase_counts is distinct from source_n->'eraseCounts' or r.redact_counts is distinct from source_n->'redactCounts'
      or r.retain_counts is distinct from source_n->'retainCounts' or r.retained_references is distinct from source_n->'retainedReferences'
      or r.conflicts is distinct from source_n->'conflicts' or r.source_authorities is distinct from source_n->'sourceAuthorities' then raise exception 'TURN_SOURCE_CHANGED';end if;
    end if;
    if p_action='preview' then result_n:=turn_data_private.preview_v1(r);
    else
     if r.conflicts<>'[]'::jsonb then raise exception 'TURN_CONFLICT';end if;
     perform turn_data_private.deadline_v1(r.captured_at,r.expires_at);
     insert into turn_data_private.transaction_proofs_v1(transaction_id,owner_id,request_id,source_digest,graph,expires_at)
      values(pg_current_xact_id(),u,r.request_id,r.source_digest,r.graph,r.expires_at);
     if scope_n='turn-sensitive-data/1' then
      counts_n:=turn_data_private.erase_source_v1(u,source_n);
      select coalesce(sum(jsonb_array_length(value)),0) into fences_n from jsonb_each(r.graph);
     else
      update turn_data_private.operations_v1 set preview_erased=true,graph=null,erase_counts=null,redact_counts=null,retain_counts=null,retained_references=null,conflicts=null
       where owner_id=u and request_id=any(ids) and not preview_erased;get diagnostics cleared_n=row_count;
      fences_n:=cardinality(ids);counts_n:=jsonb_build_object('erasedCounts',r.erase_counts,'redactedCounts',r.redact_counts,'retainedCounts',r.retain_counts);
     end if;
     perform turn_data_private.actor_v1(p_expected_epoch);perform turn_data_private.authorities_current_v1(u,r.source_authorities);
     now_n:=turn_data_private.deadline_v1(r.captured_at,r.expires_at);new_decision:=true;
     decision_n:=jsonb_build_object('requestDigest',digest_n,'decidedAt',now_n,'graph',r.graph,'erasedCounts',counts_n->'erasedCounts',
      'redactedCounts',counts_n->'redactedCounts','retainedCounts',counts_n->'retainedCounts','clearedPreviews',cleared_n,'retainedFences',fences_n,
      'sourceTurn',case scope_n when 'turn-sensitive-data/1' then 'erased' else 'not_modified' end,
      'parentData',case when (counts_n->'redactedCounts'->>'taskDigests')::integer>0 then 'selected_digest_redacted' else 'not_modified' end,'financialData','not_modified',
      'sourceTrip','not_modified','explicitMemory','not_modified','externalCopies','not_erased');
     update turn_data_private.operations_v1 set state='erased',source_identity_keys=case when scope_n='turn-sensitive-data/1' then (select coalesce(jsonb_agg(jsonb_build_object('relation',x->'table','pk',x->'pk') order by x->>'table' collate "C",(x->'pk')::text collate "C"),'[]'::jsonb) from jsonb_array_elements(source_n->'rows') x where x->>'effect'='erase') else '[]'::jsonb end,mutation_bytes=bytes_n,request_digest=digest_n,decision=decision_n,preview_erased=true,
      graph=null,erase_counts=null,redact_counts=null,retain_counts=null,retained_references=null,conflicts=null where request_id=request_n and owner_id=u returning * into r;
     perform turn_data_private.deadline_v1(r.captured_at,r.expires_at);
     delete from turn_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id();result_n:=turn_data_private.receipt_v1(r);
    end if;
    perform turn_data_private.deadline_v1(r.captured_at,r.expires_at);
   end if;
  end if;
 end if;
 perform turn_data_private.actor_v1(p_expected_epoch);
 if octet_length(jsonb_build_object('data',result_n)::text)>1000000 then raise exception 'TURN_CAPACITY';end if;
 if p_action='list' then
  perform turn_data_private.authorities_current_v1(u,list_authorities);
  perform turn_data_private.deadline_v1(captured_n,expires_n);
 elsif r.request_id is not null then
  perform turn_data_private.authorities_current_v1(u,r.source_authorities);
  if p_action='preview' or new_decision then perform turn_data_private.deadline_v1(r.captured_at,r.expires_at);end if;
 end if;
 return result_n;
exception when lock_not_available then raise lock_not_available using message='TURN_CONFLICT';
 when unique_violation then raise exception 'TURN_CONFLICT';
end$$;
revoke all on function public.privacy_turn_data_v1(text,text,bigint) from public,anon,authenticated,service_role;
revoke all on all functions in schema turn_data_private from public,anon,authenticated,service_role;

-- Exact entity references for ordinary writers. BOTH tuple versions are checked.
create function turn_data_private.writer_references_v1(rel text,v jsonb) returns table(kind text,entity_id uuid)
language plpgsql stable set search_path='' as $$
begin
 return query select r.kind,r.entity_id from conversation_data_private.parents_v1(rel,v) r where r.kind in('turnIds','messageIds','artifactIds');
 if rel='public.model_budget_attempts' then
  return query select 'turnIds'::text,tc.turn_id from turn_private.text_content tc join public.model_budget_scopes s on s.id=(v->>'scope_id')::uuid where tc.turn_id=(v->>'task_id')::uuid and s.owner_id=tc.owner_id;
 end if;
end$$;

create function turn_data_private.source_key_v1(rel text,v jsonb) returns jsonb language sql immutable set search_path='' as $$
 select turn_data_private.row_key_v1(v,s.pk) from turn_data_private.sources_v1() s where s.relation_name=rel and s.effect='erase'
$$;
create function turn_data_private.source_key_fenced_v1(rel text,pk_n jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select pk_n is not null and exists(select 1 from turn_data_private.operations_v1 r where r.scope='turn-sensitive-data/1' and r.state='erased' and exists(select 1 from auth.users account_n where account_n.id=r.owner_id) and r.source_identity_keys @> jsonb_build_array(jsonb_build_object('relation',rel,'pk',pk_n)))
$$;
create function turn_data_private.guard_source_v1() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare rel text:=tg_table_schema||'.'||tg_table_name;nv jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;ov jsonb:=case when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end;r record;owners uuid[];key_n jsonb;
begin
 owners:=turn_data_private.union_ids_v1(array[nullif(nv->>'owner_id','')::uuid,nullif(ov->>'owner_id','')::uuid]);
 if cardinality(owners)>0 and not exists(select 1 from auth.users where id=any(owners)) and tg_op='DELETE' then return old;end if;
 for key_n in select distinct k from(select turn_data_private.source_key_v1(rel,nv) k union select turn_data_private.source_key_v1(rel,ov) where tg_op='UPDATE' and ov is distinct from nv) a where k is not null loop
  if not pg_try_advisory_xact_lock_shared(hashtextextended('turn-data-source-key:'||rel||':'||turn_data_private.digest_v1(key_n::text),0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
  if turn_data_private.source_key_fenced_v1(rel,key_n) then raise exception 'TURN_CONFLICT';end if;
 end loop;
 for r in select distinct kind collate "C" kind,entity_id from(select * from turn_data_private.writer_references_v1(rel,nv) union select * from turn_data_private.writer_references_v1(rel,ov) where tg_op='UPDATE' and ov is distinct from nv) a order by kind collate "C",entity_id loop
  if not pg_try_advisory_xact_lock_shared(hashtextextended('turn-data-entity:'||r.kind||':'||r.entity_id::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
  if turn_data_private.fenced_v1(r.kind,r.entity_id) then raise exception 'TURN_CONFLICT';end if;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end$$;

create table turn_data_private.export_provenance_v1 (
 request_id uuid not null references export_private.core_jobs_v1(request_id) on delete cascade,
 generation integer not null check(generation between 1 and 3),owner_id uuid not null,session_id uuid not null,
 session_epoch bigint not null check(session_epoch between 1 and 9007199254740991),committed_lease uuid not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),source_state_digest text not null check(source_state_digest ~ '^[a-f0-9]{64}$'),
 source_data_rows integer not null check(source_data_rows between 0 and 10000),source_operation_rows integer not null check(source_operation_rows between 0 and 10000),source_fence_rows integer not null check(source_fence_rows between 0 and 10000),
 source_authorities jsonb not null check(jsonb_typeof(source_authorities)='array' and jsonb_array_length(source_authorities)<=100),
 artifact_digest text not null check(artifact_digest ~ '^[a-f0-9]{64}$'),artifact_bytes integer not null check(artifact_bytes between 1 and 8388608),
 commit_digest text not null check(commit_digest ~ '^[a-f0-9]{64}$'),completed_at timestamptz not null,artifact_expires_at timestamptz not null,
 key_id text not null check(octet_length(key_id) between 1 and 128 and key_id !~ '[^!-~]'),primary key(request_id,generation),
 check(source_data_rows+source_operation_rows+source_fence_rows<=10000),check(artifact_expires_at>completed_at)
);
alter table turn_data_private.export_provenance_v1 enable row level security;
revoke all on turn_data_private.export_provenance_v1 from public,anon,authenticated,service_role;
create function turn_data_private.export_provenance_immutable_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' or exists(select 1 from export_private.core_jobs_v1 where request_id=old.request_id) then raise exception 'IMMUTABLE_TURN_EXPORT_PROVENANCE';end if;return old;
end$$;
create trigger immutable_turn_export_provenance before update or delete on turn_data_private.export_provenance_v1 for each row execute function turn_data_private.export_provenance_immutable_v1();

create function turn_data_private.export_row_v1(rel text,v jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare c record;out_n jsonb:=v;begin
 for c in select attname from pg_attribute where attrelid=rel::regclass and attnum>0 and not attisdropped and atttypid in('int8'::regtype,'xid8'::regtype) loop
  if v->c.attname<>'null'::jsonb then out_n:=jsonb_set(out_n,array[c.attname::text],to_jsonb(v->>c.attname));end if;
 end loop;return out_n;
end$$;


create function turn_data_private.export_predicate_v1(rel text) returns text language sql immutable set search_path='' as $$
 select case
 when rel='public.turns' then 'a.id=any($1)'
 when rel='turn_private.assistant_messages' then 'a.id=any($2)'
 when rel in('turn_private.assistant_message_source_receipts','turn_private.assistant_travel_intakes') then 'a.message_id=any($2)'
 when rel='turn_private.result_artifacts' then 'a.id=any($3)'
 when rel in('turn_private.result_revisions','turn_private.result_events') then 'a.artifact_id=any($3)'
 when rel='turn_private.service_tasks' then 'a.id=any($4)'
 when rel='turn_private.service_task_capacity' then 'a.task_id=any($4)'
 when rel in('turn_private.planning_v2_collector_origins','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_external_call_windows','turn_private.planning_v2_result_claims') then 'a.execution_id=any($5)'
 when rel='public.model_budget_attempts' then '(a.task_id=any($1) and exists(select 1 from public.model_budget_scopes bs where bs.id=a.scope_id and bs.owner_id=$6)) or exists(select 1 from turn_private.service_tasks st join public.model_budget_scopes bs on bs.id=st.budget_scope_id where st.id=a.task_id and st.id=any($4) and st.budget_scope_id=a.scope_id and st.owner_id=$6 and bs.owner_id=$6) or exists(select 1 from turn_private.planning_model_dispatches d where d.turn_id=any($1) and d.owner_id=$6 and d.task_id=a.task_id and d.scope_id=a.scope_id and d.attempt_id=a.attempt_id) or exists(select 1 from turn_private.planning_v2_model_attempt_bindings ab where ab.turn_id=any($1) and ab.owner_id=$6 and ab.task_id=a.task_id and ab.scope_id=a.scope_id and ab.attempt_id=a.attempt_id)'
 else 'a.turn_id=any($1)' end
$$;
create function turn_data_private.export_source_v1(u uuid) returns jsonb
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare roots uuid[];msgs uuid[];arts uuid[];tasks uuid[];ex uuid[];g jsonb;refs jsonb;s record;v jsonb;r jsonb;group_rows jsonb[];groups_n jsonb[]:=array[]::jsonb[];ops jsonb[]:=array[]::jsonb[];fences jsonb[]:=array[]::jsonb[];
 auths jsonb:='[]';identity_n uuid;row_count_n integer:=0;byte_count_n integer:=0;item jsonb;witness jsonb;st text;
begin
 if turn_data_private.schema_supported_v1() is not true or u is null or not exists(select 1 from auth.users where id=u) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 select turn_data_private.union_ids_v1(array_agg(id)) into roots from(select id from public.turns where owner_id=u union select turn_id from turn_private.text_content where owner_id=u) a;
 if cardinality(roots)>10000 then raise exception 'TURN_CAPACITY';end if;
 for identity_n in select unnest(roots) order by 1 loop if not pg_try_advisory_xact_lock(hashtextextended('turn-data-entity:turnIds:'||identity_n::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;end loop;
 select turn_data_private.union_ids_v1(array_agg(id)) into arts from turn_private.result_artifacts a where a.source_turn_id=any(roots) or exists(select 1 from turn_private.result_revisions r where r.artifact_id=a.id and r.task_turn_id=any(roots));
 select turn_data_private.union_ids_v1(array_agg(id)) into msgs from turn_private.assistant_messages m where m.turn_id=any(roots) or exists(select 1 from turn_private.planning_comparisons p where p.turn_id=any(roots) and p.message_id=m.id) or exists(select 1 from turn_private.result_artifacts a where a.id=any(arts) and a.input_message_id=m.id);
 select turn_data_private.union_ids_v1(array_agg(task_id)) into tasks from(select task_id from turn_private.service_task_turns where turn_id=any(roots) union select task_id from turn_private.assistant_messages where id=any(msgs) union select task_id from turn_private.result_artifacts where id=any(arts) union select task_id from turn_private.planning_comparisons where turn_id=any(roots)) a;
 select turn_data_private.union_ids_v1(array_agg(id)) into ex from turn_private.planning_v2_execution_runs where turn_id=any(roots) and owner_id=u;
 g:=jsonb_build_object('turnIds',roots,'messageIds',msgs,'artifactIds',arts);refs:=jsonb_build_object('taskIds',tasks);
 for s in select * from turn_data_private.sources_v1() order by array_position(array['public.chat_turn_events','public.chat_turn_idempotency','public.memory_consumer_receipts','public.model_budget_attempts','public.turn_feedback','turn_private.assistant_message_source_receipts','turn_private.assistant_messages','turn_private.assistant_travel_intakes','turn_private.grounded_ai_assist_jobs','turn_private.grounded_turns','turn_private.planning_action_receipts','turn_private.planning_comparisons','turn_private.planning_intake_bindings','turn_private.planning_model_dispatches','turn_private.planning_observations','turn_private.planning_v2_collector_origins','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_completed_receipts','turn_private.planning_v2_completion_proofs','turn_private.planning_v2_execution_runs','turn_private.planning_v2_external_call_windows','turn_private.planning_v2_model_attempt_bindings','turn_private.planning_v2_model_local_journal','turn_private.planning_v2_place_checkpoints','turn_private.planning_v2_result_claims','turn_private.result_artifacts','turn_private.result_events','turn_private.result_revisions','turn_private.service_task_capacity','turn_private.service_task_turns','turn_private.service_tasks','turn_private.text_content','turn_private.text_dispatches','turn_private.work','public.turns']::text[],relation_name) loop
  group_rows:=array[]::jsonb[];
  for v in execute format('select to_jsonb(a) from %s a where %s order by %s limit 10001 for share nowait',s.relation_name,turn_data_private.export_predicate_v1(s.relation_name),(select string_agg(format('a.%I',k),',') from unnest(s.pk) k)) using roots,msgs,arts,tasks,ex,u loop
   if s.has_owner and v->>'owner_id' is distinct from u::text then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   if s.count_key='sourceReceipts' and (jsonb_typeof(v->'input_sources'->'evidence') is distinct from 'array' or jsonb_array_length(v->'input_sources'->'evidence')>0) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   if s.count_key='attemptBindings' and not exists(select 1 from turn_private.planning_comparisons pc join turn_private.text_content tc on tc.turn_id=pc.turn_id and tc.owner_id=pc.owner_id where pc.turn_id=(v->>'turn_id')::uuid and pc.owner_id=u and pc.task_id=(v->>'task_id')::uuid and pc.planning_policy_id=(v->>'planning_policy_id')::uuid and tc.policy_id=(v->>'text_policy_id')::uuid) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   if s.count_key='grounded' and (jsonb_typeof(v->'basis'->'publications') is distinct from 'array' or jsonb_array_length(v->'basis'->'publications')>0) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   r:=turn_data_private.export_row_v1(s.relation_name,v);row_count_n:=row_count_n+1;byte_count_n:=byte_count_n+octet_length(r::text);
   if row_count_n>10000 or byte_count_n>1000000 then raise exception 'TURN_CAPACITY';end if;
   group_rows:=array_append(group_rows,r);
   if v->>'policy_id' is not null and v->>'consent_id' is not null then auths:=auths||jsonb_build_array(jsonb_build_object('policyId',v->'policy_id','consentId',v->'consent_id'));end if;
   if v->>'planning_policy_id' is not null and v->>'planning_consent_id' is not null then auths:=auths||jsonb_build_array(jsonb_build_object('policyId',v->'planning_policy_id','consentId',v->'planning_consent_id'));end if;
  end loop;
  groups_n:=array_append(groups_n,jsonb_build_object('relation',s.relation_name,'rows',to_jsonb(group_rows)));
 end loop;
 for r in select turn_data_private.operation_row_v1(a) from turn_data_private.operations_v1 a where owner_id=u order by request_id limit 10001 for share nowait loop
  row_count_n:=row_count_n+1;byte_count_n:=byte_count_n+octet_length(r::text);if row_count_n>10000 or byte_count_n>1000000 then raise exception 'TURN_CAPACITY';end if;ops:=array_append(ops,r);auths:=auths||(r->'sourceAuthorities');
 end loop;
 for r in select jsonb_build_object('kind',kind_n,'objectId',id_n,'requestId',request_id,'createdAt',created_n) from (
  select distinct on(kind_n collate "C",id_n) kind_n,id_n,request_id,created_n from(
   select case e.key when 'turnIds' then 'turn' when 'messageIds' then 'message' else 'artifact' end kind_n,(x.value#>>'{}')::uuid id_n,a.request_id,(a.decision->>'decidedAt')::bigint created_n
    from turn_data_private.operations_v1 a cross join lateral jsonb_each(a.decision->'graph') e cross join lateral jsonb_array_elements(e.value) x where a.owner_id=u and a.state='erased' and a.scope='turn-sensitive-data/1'
   union all select 'operation',obj,request_id,(decision->>'decidedAt')::bigint from turn_data_private.operations_v1 a cross join lateral unnest(a.object_ids) obj where a.owner_id=u and a.state='erased' and a.scope='turn-delete-progress/1'
  ) all_n order by kind_n collate "C",id_n,created_n,request_id
 ) a order by kind_n collate "C",id_n loop
  row_count_n:=row_count_n+1;byte_count_n:=byte_count_n+octet_length(r::text);if row_count_n>10000 or byte_count_n>1000000 then raise exception 'TURN_CAPACITY';end if;fences:=array_append(fences,r);
 end loop;
 auths:=turn_data_private.authorities_union_v1(auths);witness:=turn_data_private.authorities_current_v1(u,auths);
 item:=jsonb_build_object('ownerId',u,'sources',to_jsonb(groups_n),'operations',to_jsonb(ops),'fences',to_jsonb(fences),'sourceRows',jsonb_build_object('data',row_count_n-cardinality(ops)-cardinality(fences),'operations',cardinality(ops),'fences',cardinality(fences)),'sourceAuthorities',auths);
 -- One final canonical pass; row/byte accumulation above never serializes a growing snapshot.
 st:=notification_private.canonical(jsonb_build_object('snapshot',jsonb_build_array(item)));
 if octet_length(st)>1000000 then raise exception 'TURN_CAPACITY';end if;
 return jsonb_build_object('snapshot',item,'sourceDigest',turn_data_private.digest_v1(st),'sourceStateDigest',turn_data_private.digest_v1(jsonb_build_array(item,witness)::text));
end$$;

create function export_private.core_turn_page_v1(v jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j export_private.core_jobs_v1;l uuid;g integer;src jsonb;page jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if notification_private.exact(v,array['requestId','leaseId','generation','section','cursor','limit']) is not true or notification_private.uuid(v->'requestId') is not true or notification_private.uuid(v->'leaseId') is not true or export_private.profile_natural_v1(v->'generation',3) is not true or v->'generation'='0' or v->>'section' is distinct from 'snapshot' or v->'cursor' is distinct from 'null'::jsonb or export_private.profile_natural_v1(v->'limit',100) is not true or v->'limit'='0' then raise exception 'INVALID_INPUT';end if;
 l:=(v->>'leaseId')::uuid;g:=(v->>'generation')::integer;j:=export_private.lock_job_v1((v->>'requestId')::uuid,true);
 if j.request_id is null or export_private.live_lease_v1(j,l,g) is not true then return jsonb_build_object('kind','unavailable');end if;
 if (v->>'limit')::integer>(j.policy_snapshot->>'page_size')::integer then raise exception 'INVALID_INPUT';end if;
 src:=turn_data_private.export_source_v1(j.owner_id);
 page:=jsonb_build_object('schemaVersion','turn-core-export/1','section','snapshot','sourceDigest',src->'sourceDigest','items',jsonb_build_array(src->'snapshot'),'hasMore',false,'nextCursor',null,'sectionComplete',true);
 if octet_length(notification_private.canonical(page))>1000000 then raise exception 'TURN_CAPACITY';end if;
 if export_private.live_lease_v1(j,l,g) is not true then return jsonb_build_object('kind','unavailable');end if;return page;
end$$;

create function export_private.turn_commit_qualifies_v1(j export_private.core_jobs_v1,modules jsonb,l uuid,g integer) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare m jsonb;item jsonb;begin
 if export_private.valid_modules_v1(modules,(j.policy_snapshot->>'max_pages')::integer) is not true then return false;end if;
 m:=modules->5;
 if m->'pages'='0' and m->'rows'='0' then return m->>'status' in('unavailable','failed','partial') and m->>'reason' in('HANDLER_MISSING','SOURCE_UNAVAILABLE','BOUNDED_LIMIT');end if;
 if m->>'status' is distinct from 'complete' or m->>'reason' is distinct from 'NONE' or m->'pages' is distinct from '1'::jsonb or m->'rows' is distinct from '1'::jsonb then return false;end if;
 if export_private.live_lease_v1(j,l,g) is not true then return false;end if;
 item:=turn_data_private.export_source_v1(j.owner_id);
 return item->>'sourceDigest'=m->>'digest' and export_private.live_lease_v1(j,l,g);
exception when lock_not_available then return false;end$$;

create function export_private.turn_managed_copy_v1(req uuid,u uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare j export_private.core_jobs_v1;p turn_data_private.export_provenance_v1;a export_private.core_artifacts_v1;m jsonb;intent public.privacy_requests;begin
 if turn_data_private.schema_supported_v1() is not true or turn_data_private.hooks_valid_v1() is not true then return false;end if;
 select * into j from export_private.core_jobs_v1 where request_id=req and owner_id=u;
 if not found or j.state not in('ready_partial','ready_complete') or export_private.valid_modules_v1(j.modules,(j.policy_snapshot->>'max_pages')::integer) is not true then return false;end if;
 select * into p from turn_data_private.export_provenance_v1 where request_id=req and generation=j.generation for share nowait;
 if not found then return false;end if;
 select * into a from export_private.core_artifacts_v1 where request_id=req;
 if not found then return false;end if;
 select * into intent from public.privacy_requests where id=req;
 if not found or intent.owner_id<>u or intent.action<>'export' or intent.scope_version<>'all-user-data-v1'
  or intent.status<>'requested' or intent.execution_state<>'not_started' then return false;end if;
 m:=j.modules->5;
 return coalesce(m->>'module'='turn' and m->>'status'='complete' and m->>'reason'='NONE' and m->'pages'='1' and m->'rows'='1' and m->>'digest'=p.source_digest
  and p.owner_id=j.owner_id and p.session_id=j.session_id and p.session_epoch=j.session_epoch and p.committed_lease=j.committed_lease
  and p.commit_digest=j.commit_digest and p.artifact_digest=j.artifact_digest and p.artifact_bytes=j.artifact_bytes
  and p.completed_at=j.completed_at and p.artifact_expires_at=j.artifact_expires_at and p.key_id=j.policy_snapshot->>'key_id'
  and a.owner_id=j.owner_id and a.generation=j.generation and a.lease_id=j.committed_lease and a.key_id=p.key_id
  and octet_length(a.nonce)=12 and octet_length(a.tag)=16 and octet_length(a.ciphertext)=p.artifact_bytes and a.plaintext_bytes=p.artifact_bytes
  and a.plaintext_digest=p.artifact_digest and a.ciphertext_digest=encode(sha256(a.ciphertext),'hex')
  and a.aad='["privacy-core-export/1",'||turn_private.planning_v2_json_string_v1(req::text)||','||turn_private.planning_v2_json_string_v1(u::text)||','||j.generation::text||']'
  and a.expires_at=p.artifact_expires_at and a.expires_at<=j.expires_at and p.completed_at>=j.created_at
  and a.created_at<=p.completed_at and p.completed_at<a.expires_at,false);
exception when lock_not_available then return false;end$$;

create function export_private.turn_source_current_v1(j export_private.core_jobs_v1) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare m jsonb;src jsonb;p turn_data_private.export_provenance_v1;
begin
 if j.modules='[]' then return not exists(select 1 from turn_data_private.export_provenance_v1 where request_id=j.request_id and generation=j.generation);end if;
 if export_private.valid_modules_v1(j.modules,(j.policy_snapshot->>'max_pages')::integer) is not true then return false;end if;
 m:=j.modules->5;
 if m->'pages'='0' and m->'rows'='0' then return not exists(select 1 from turn_data_private.export_provenance_v1 where request_id=j.request_id and generation=j.generation);end if;
 src:=turn_data_private.export_source_v1(j.owner_id);
 if export_private.turn_managed_copy_v1(j.request_id,j.owner_id) is not true then return false;end if;
 select * into p from turn_data_private.export_provenance_v1 where request_id=j.request_id and generation=j.generation for share nowait;
 return src->>'sourceDigest'=p.source_digest and src->>'sourceStateDigest'=p.source_state_digest and src->'snapshot'->'sourceRows'=jsonb_build_object('data',p.source_data_rows,'operations',p.source_operation_rows,'fences',p.source_fence_rows) and src->'snapshot'->'sourceAuthorities'=p.source_authorities;
exception when lock_not_available then return false;end$$;
create function export_private.record_turn_provenance_v1(committed export_private.core_jobs_v1,lease_deadline timestamptz) returns void language plpgsql volatile security definer set search_path='' as $$
declare j export_private.core_jobs_v1;a export_private.core_artifacts_v1;src jsonb;m jsonb;
begin
 select * into j from export_private.core_jobs_v1 where request_id=committed.request_id for update nowait;
 if not found or to_jsonb(j) is distinct from to_jsonb(committed) or j.state not in('ready_partial','ready_complete') or export_private.valid_modules_v1(j.modules,(j.policy_snapshot->>'max_pages')::integer) is not true then raise exception 'INVALID_OUTPUT';end if;
 m:=j.modules->5;
 if m->'pages'='0' and m->'rows'='0' then
  if exists(select 1 from turn_data_private.export_provenance_v1 where request_id=j.request_id and generation=j.generation) then raise exception 'INVALID_OUTPUT';end if;return;
 end if;
 if exists(select 1 from turn_data_private.export_provenance_v1 where request_id=j.request_id and generation=j.generation) then raise exception 'INVALID_OUTPUT';end if;
 src:=turn_data_private.export_source_v1(j.owner_id);
 if m->>'status' is distinct from 'complete' or m->>'reason' is distinct from 'NONE' or m->'pages' is distinct from '1'::jsonb or m->'rows' is distinct from '1'::jsonb or m->>'digest' is distinct from src->>'sourceDigest' then raise exception 'INVALID_OUTPUT';end if;
 select * into a from export_private.core_artifacts_v1 where request_id=j.request_id for share nowait;if not found then raise exception 'INVALID_OUTPUT';end if;
 if lease_deadline is null or lease_deadline<=clock_timestamp() or j.expires_at<=clock_timestamp() or j.artifact_expires_at<=clock_timestamp() or (j.policy_snapshot->>'valid_until')::timestamptz<=clock_timestamp() then raise exception 'INVALID_OUTPUT';end if;
 insert into turn_data_private.export_provenance_v1 values(j.request_id,j.generation,j.owner_id,j.session_id,j.session_epoch,j.committed_lease,src->>'sourceDigest',src->>'sourceStateDigest',
  (src->'snapshot'->'sourceRows'->>'data')::integer,(src->'snapshot'->'sourceRows'->>'operations')::integer,(src->'snapshot'->'sourceRows'->>'fences')::integer,src->'snapshot'->'sourceAuthorities',j.artifact_digest,j.artifact_bytes,j.commit_digest,j.completed_at,j.artifact_expires_at,a.key_id);
 if export_private.turn_managed_copy_v1(j.request_id,j.owner_id) is not true or lease_deadline<=clock_timestamp() then raise exception 'INVALID_OUTPUT';end if;
end$$;

create function turn_data_private.hooks_valid_v1() returns boolean language sql stable set search_path='' as $$ select false $$;
revoke all on function export_private.core_turn_page_v1(jsonb),export_private.turn_commit_qualifies_v1(export_private.core_jobs_v1,jsonb,uuid,integer),export_private.turn_managed_copy_v1(uuid,uuid),export_private.turn_source_current_v1(export_private.core_jobs_v1),export_private.record_turn_provenance_v1(export_private.core_jobs_v1,timestamp with time zone) from public,anon,authenticated,service_role;
