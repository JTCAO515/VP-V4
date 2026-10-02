-- Exact ordinary-auth initial admission binding. No v2 worker/claimer/provider
-- is enabled. Requires the reviewed explicit intake migration first.
do $$begin
 if to_regclass('turn_private.assistant_travel_intakes') is null then raise exception 'EXPLICIT_INTAKE_DEPENDENCY_MISSING'; end if;
end $$;
alter table turn_private.work drop constraint work_execution_mode_check;
alter table turn_private.work add constraint work_execution_mode_check
 check(execution_mode in ('text','planning_comparison_v1','planning_intake_comparison_v2'));

create table turn_private.planning_intake_bindings(
 turn_id uuid primary key references turn_private.planning_comparisons(turn_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_message_id uuid not null references turn_private.assistant_messages(id) on delete cascade,
 source_sequence bigint not null,source_revision integer not null,source_goal_version integer not null,
 source_digest text not null check(source_digest~'^[a-f0-9]{64}$'),
 message_id uuid not null unique references turn_private.assistant_travel_intakes(message_id) on delete cascade,
 intake_revision integer not null,new_digest text not null check(new_digest~'^[a-f0-9]{64}$'),
 request_key uuid not null,request_digest text not null check(request_digest~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),unique(owner_id,request_key)
);
alter table turn_private.planning_intake_bindings enable row level security;
revoke all on turn_private.planning_intake_bindings from public,anon,authenticated,service_role;
create function turn_private.immutable_planning_intake_binding_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_BINDING'; end $$;
create trigger immutable_planning_intake_binding before update on turn_private.planning_intake_bindings
 for each row execute function turn_private.immutable_planning_intake_binding_v1();
revoke all on function turn_private.immutable_planning_intake_binding_v1() from public,anon,authenticated,service_role;

create function turn_private.bind_planning_travel_intake_v1(
 p_owner uuid,p_turn uuid,p_source uuid,p_source_sequence bigint,p_revision integer,p_goal_version integer,
 p_old_digest text,p_intake jsonb,p_memory_basis jsonb,p_request_key uuid,p_request_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare j turn_private.planning_comparisons%rowtype; old turn_private.assistant_travel_intakes%rowtype;
 m turn_private.assistant_messages%rowtype; next_revision integer; new_digest text; expected_refs jsonb; actual_refs jsonb;
begin
 select * into j from turn_private.planning_comparisons where turn_id=p_turn and owner_id=p_owner;
 select * into old from turn_private.assistant_travel_intakes where message_id=p_source and owner_id=p_owner;
 select * into m from turn_private.assistant_messages where id=j.message_id and owner_id=p_owner;
 if j.turn_id is null or old.message_id is null or m.id is null or m.parent_message_id<>old.message_id
  or m.conversation_id<>old.conversation_id or m.goal_id<>old.goal_id or j.goal_id<>old.goal_id or j.task_id<>m.task_id
  or j.goal_version<>p_goal_version or m.scope_version<>p_goal_version or old.goal_version<>p_goal_version
  or old.intake_revision<>p_revision or old.message_sequence<>p_source_sequence or m.sequence<=p_source_sequence
  or m.policy_id<>old.policy_id or m.consent_id<>old.consent_id or m.relationship<>'follow_up'
  or not turn_private.valid_explicit_travel_intake_v1(p_intake) or p_intake is distinct from old.intake
  or p_old_digest is null or p_old_digest!~'^[a-f0-9]{64}$' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 -- The caller already validated old current digest BEFORE appending m. Never
 -- call the old-source current helper here; old latest-source is now invalid.
 if turn_private.explicit_intake_memory_binding_v1(p_owner,p_memory_basis) is null then raise exception 'MEMORY_CONFLICT'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',(v->>'id')::uuid,'revision',(v->>'revision')::bigint) order by (v->>'id')::uuid),'[]') into expected_refs from jsonb_array_elements(old.memory_basis) v;
 select coalesce(jsonb_agg(jsonb_build_object('id',(v->>'id')::uuid,'revision',(v->>'revision')::bigint) order by (v->>'id')::uuid),'[]') into actual_refs from jsonb_array_elements(p_memory_basis) v;
 if actual_refs is distinct from expected_refs then raise exception 'MEMORY_CONFLICT'; end if;
 perform 1 from turn_private.assistant_conversations where id=m.conversation_id and owner_id=p_owner and next_sequence=m.sequence+1 for update;
 if not found then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 perform 1 from turn_private.assistant_goals where id=m.goal_id and owner_id=p_owner and scope_version=p_goal_version for update;
 if not found or m.sequence<>(select max(sequence) from turn_private.assistant_messages where goal_id=m.goal_id) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 select coalesce(max(intake_revision),0)+1 into next_revision from turn_private.assistant_travel_intakes where goal_id=m.goal_id;
 if next_revision<>p_revision+1 or next_revision>1000 then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 insert into turn_private.assistant_travel_intakes(message_id,owner_id,conversation_id,goal_id,policy_id,consent_id,message_sequence,goal_version,intake_revision,idempotency_key,request_digest,intake,memory_basis)
 values(m.id,p_owner,m.conversation_id,m.goal_id,m.policy_id,m.consent_id,m.sequence,m.scope_version,next_revision,p_request_key,p_request_digest,p_intake,actual_refs);
 new_digest:=turn_private.assistant_travel_current_basis_v1(p_owner,m.id);
 if new_digest is null or new_digest=p_old_digest then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 insert into turn_private.planning_intake_bindings(turn_id,owner_id,source_message_id,source_sequence,source_revision,source_goal_version,source_digest,message_id,intake_revision,new_digest,request_key,request_digest)
 values(p_turn,p_owner,p_source,p_source_sequence,p_revision,p_goal_version,p_old_digest,m.id,next_revision,new_digest,p_request_key,p_request_digest);
 return jsonb_build_object('intakeRevision',next_revision,'intakeContextDigest',new_digest);
end $$;
revoke all on function turn_private.bind_planning_travel_intake_v1(uuid,uuid,uuid,bigint,integer,integer,text,jsonb,jsonb,uuid,text) from public,anon,authenticated,service_role;

create function turn_private.read_planning_qualified_intake_v1(p_owner uuid,p_turn uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;j turn_private.planning_comparisons%rowtype;b turn_private.planning_intake_bindings%rowtype;
 i turn_private.assistant_travel_intakes%rowtype;m turn_private.assistant_messages%rowtype;g turn_private.assistant_goals%rowtype;
 t turn_private.text_policies%rowtype;d text;basis text;qualified jsonb;payload jsonb;unknowns jsonb:='[]';k text;
begin
 select * into w from turn_private.work where turn_id=p_turn and owner_id=p_owner;
 if not found or w.execution_mode<>'planning_intake_comparison_v2' then return jsonb_build_object('kind','blocked'); end if;
 if p_lease is null then
  if w.state<>'queued' then return jsonb_build_object('kind','blocked'); end if;
 else
  if not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','blocked'); end if;
  select * into w from turn_private.work where turn_id=p_turn for update;
  if w.state<>'leased' or w.lease_token is distinct from p_lease or w.expires_at<=clock_timestamp() then return jsonb_build_object('kind','blocked'); end if;
 end if;
 if not exists(select 1 from public.turns where id=p_turn and owner_id=p_owner and status='accepted') then return jsonb_build_object('kind','blocked'); end if;
 select * into j from turn_private.planning_comparisons where turn_id=p_turn and owner_id=p_owner and state='queued';
 select * into b from turn_private.planning_intake_bindings where turn_id=p_turn and owner_id=p_owner;
 select * into i from turn_private.assistant_travel_intakes where message_id=b.message_id and owner_id=p_owner;
 select * into m from turn_private.assistant_messages where id=j.message_id and owner_id=p_owner;
 select * into g from turn_private.assistant_goals where id=j.goal_id and owner_id=p_owner;
 select * into t from turn_private.text_policies where id=i.policy_id;
 if j.turn_id is null or b.turn_id is null or i.message_id is null or m.id is null or g.id is null or t.id is null
  or j.message_id<>i.message_id or j.task_id<>m.task_id or j.goal_id<>i.goal_id or j.goal_version<>i.goal_version
  or b.intake_revision<>i.intake_revision or not turn_private.planning_policy_current(j.planning_policy_id)
  or not exists(select 1 from turn_private.planning_consents c where c.owner_id=p_owner and c.policy_id=j.planning_policy_id and c.consent_id=j.planning_consent_id and c.revoked_at is null)
  then return jsonb_build_object('kind','blocked'); end if;
 basis:=turn_private.planning_action_basis(p_turn,p_owner,j.message_id,j.memory_basis);
 d:=turn_private.assistant_travel_current_basis_v1(p_owner,i.message_id);
 if basis is null or d is null or d<>b.new_digest then return jsonb_build_object('kind','blocked'); end if;
 foreach k in array array['city','comparisonTarget','durationDays','partySize','interests','pace','lodgingBudget','dates','mobilityConstraints'] loop
  if i.intake->k='null'::jsonb then unknowns:=unknowns||to_jsonb(k); end if;
 end loop;
 if i.intake->>'city' is distinct from 'shanghai' or i.intake->>'comparisonTarget' is distinct from 'area_transport' then return jsonb_build_object('kind','blocked'); end if;
 qualified:=jsonb_build_object('version',5,'kind','travel_intake','schemaVersion','assistant-travel-current-basis/1','conversationId',i.conversation_id,'goalId',i.goal_id,'goalVersion',i.goal_version,
  'messageId',i.message_id,'messageSequence',i.message_sequence,'intakeRevision',i.intake_revision,'sourceKind','explicit_current_input','intake',i.intake,'memoryBasis',i.memory_basis,'contextDigest',d,
  'readiness',jsonb_build_object('kind','ready','scope','transport_screening','unknown',unknowns),'readyForProvider',false);
 payload:=jsonb_build_object('kind','planning_intake_input','schemaVersion','planning-intake-context/2','ownerId',p_owner,'turnId',p_turn,'taskId',j.task_id,'artifactId',j.artifact_id,
  'planningPolicyId',j.planning_policy_id,'provider',t.provider,'endpoint',t.endpoint,'goalText',g.current_text,'delegation',m.input_text,'planningActionBasis',basis,'qualifiedIntake',qualified,'intakeContextDigest',d,
  'executionAvailable',false,'readyForProvider',false);
 return payload||jsonb_build_object('planningContextDigest',encode(pg_catalog.sha256(convert_to(payload::text,'UTF8')),'hex'));
end $$;
revoke all on function turn_private.read_planning_qualified_intake_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.submit_planning_comparison_v2(
 p_conversation_id uuid,p_goal_id uuid,p_expected_goal_version integer,p_parent_message_id uuid,p_message_id uuid,p_message_key uuid,
 p_thread_id uuid,p_turn_id uuid,p_task_id uuid,p_task_key uuid,p_text_policy_id uuid,p_planning_policy_id uuid,p_locale text,p_text text,p_memory_basis jsonb,
 p_expected_intake_message_id uuid,p_expected_source_sequence bigint,p_expected_intake_revision integer,p_expected_intake_digest text,p_intake jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();p turn_private.planning_policies%rowtype;c turn_private.planning_consents%rowtype;tc turn_private.text_consents%rowtype;
 prior turn_private.planning_intake_bindings%rowtype;old turn_private.assistant_travel_intakes%rowtype;j turn_private.planning_comparisons%rowtype;
 digest text;d text;item jsonb;admitted jsonb;linked jsonb;bound jsonb;readback jsonb;receipt jsonb;expected_refs jsonb;actual_refs jsonb;
begin
 if p_conversation_id is null or p_goal_id is null or p_expected_goal_version is null or p_expected_goal_version not between 1 and 10000
  or p_parent_message_id is null or p_message_id is null or p_message_key is null or p_thread_id is null or p_turn_id is null or p_task_id is null or p_task_key is null
  or p_text_policy_id is null or p_planning_policy_id is null or p_locale not in ('zh','en') or p_locale is null or not turn_private.valid_text(p_text,4000)
  or p_expected_intake_message_id is distinct from p_parent_message_id or p_expected_source_sequence is null or p_expected_source_sequence not between 1 and 999999
  or p_expected_intake_revision is null or p_expected_intake_revision not between 1 and 999
  or p_expected_intake_digest is null or p_expected_intake_digest!~'^[a-f0-9]{64}$'
  or not turn_private.valid_explicit_travel_intake_v1(p_intake) then raise exception 'INVALID_INPUT'; end if;
 if p_memory_basis is null or jsonb_typeof(p_memory_basis)<>'array' or jsonb_array_length(p_memory_basis)>3 then raise exception 'INVALID_INPUT'; end if;
 for item in select value from jsonb_array_elements(p_memory_basis) loop
  if jsonb_typeof(item)<>'object' or item-'id'-'revision'<>'{}' or not(item ?& array['id','revision'])
   or jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'revision') is distinct from 'number'
   or item->>'revision'!~'^[1-9][0-9]{0,14}$' then raise exception 'INVALID_INPUT'; end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',(v->>'id')::uuid,'revision',(v->>'revision')::bigint) order by (v->>'id')::uuid),'[]') into actual_refs from jsonb_array_elements(p_memory_basis) v;
 if (select count(distinct (v->>'id')::uuid) from jsonb_array_elements(p_memory_basis) v)<>jsonb_array_length(p_memory_basis) then raise exception 'MEMORY_CONFLICT'; end if;
 select * into p from turn_private.planning_policies where id=p_planning_policy_id and text_policy_id=p_text_policy_id;
 if not found or not turn_private.planning_policy_current(p.id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
 select * into c from turn_private.planning_consents where owner_id=u and policy_id=p.id and revoked_at is null for share;
 if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
 select * into tc from turn_private.text_consents where owner_id=u and policy_id=p_text_policy_id and revoked_at is null for share;
 if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
 digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_conversation_id,p_goal_id,p_expected_goal_version,p_parent_message_id,p_message_id,p_message_key,p_thread_id,p_turn_id,p_task_id,p_task_key,
  p_text_policy_id,p_planning_policy_id,p_locale,p_text,actual_refs,p_expected_intake_message_id,p_expected_source_sequence,p_expected_intake_revision,p_expected_intake_digest,p_intake)::text,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-message:'||u::text||':'||p_message_key::text,0));
 select * into prior from turn_private.planning_intake_bindings where owner_id=u and request_key=p_message_key;
 if found then
  if prior.request_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
  select * into j from turn_private.planning_comparisons where turn_id=prior.turn_id and owner_id=u;
  if j.turn_id is null or j.planning_consent_id<>c.consent_id or not exists(select 1 from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u and policy_id=p_text_policy_id and consent_id=tc.consent_id)
   or not exists(select 1 from turn_private.text_content where turn_id=j.turn_id and owner_id=u and hidden_at is null) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into old from turn_private.assistant_travel_intakes where message_id=prior.message_id and owner_id=u;
  receipt:=jsonb_build_object('kind','accepted','reused',true,'taskId',j.task_id,'turnId',j.turn_id,'artifactId',j.artifact_id,'conversationId',old.conversation_id,'goalId',old.goal_id,
   'goalVersion',old.goal_version,'messageId',old.message_id,'messageSequence',old.message_sequence,'intakeRevision',old.intake_revision,'current',false,'readyForProvider',false,'executionAvailable',false);
  readback:=turn_private.read_planning_qualified_intake_v1(u,j.turn_id,null);
  if readback->>'kind'='planning_intake_input' then receipt:=receipt||jsonb_build_object('current',true,'intakeContextDigest',readback->>'intakeContextDigest','planningContextDigest',readback->>'planningContextDigest'); end if;
  return receipt;
 end if;
 -- Initial new Task only; existing identities require their own immutable receipt.
 if exists(select 1 from turn_private.service_tasks where id=p_task_id) or exists(select 1 from public.turns where id=p_turn_id)
  or exists(select 1 from public.chat_threads where id=p_thread_id) or exists(select 1 from turn_private.assistant_messages where id=p_message_id or (owner_id=u and idempotency_key=p_message_key))
  then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 admitted:=public.submit_service_task_turn(p_thread_id,p_turn_id,p_task_key,p_text_policy_id,p_locale,p_text,p_task_id,1,'new_goal',null);
 if admitted->>'kind'<>'accepted' or admitted->>'reused'='true' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 -- NOWAIT avoids the pre-existing nonempty Task-message C/G->Task inversion.
 perform 1 from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u and policy_id=p_text_policy_id and consent_id=tc.consent_id for update nowait;
 if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
 perform 1 from turn_private.assistant_goals where id=p_goal_id and conversation_id=p_conversation_id and owner_id=u and scope_version=p_expected_goal_version and not trip_terminal for update nowait;
 if not found then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 select * into old from turn_private.assistant_travel_intakes where message_id=p_expected_intake_message_id and owner_id=u;
 if not found or old.conversation_id<>p_conversation_id or old.goal_id<>p_goal_id or old.goal_version<>p_expected_goal_version or old.intake_revision<>p_expected_intake_revision
  or old.message_sequence<>p_expected_source_sequence or old.policy_id<>p_text_policy_id or old.consent_id<>tc.consent_id or old.intake is distinct from p_intake
  or p_expected_intake_message_id is distinct from (select id from turn_private.assistant_messages where goal_id=p_goal_id order by sequence desc limit 1)
  then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 d:=turn_private.assistant_travel_current_basis_v1(u,old.message_id);
 if d is null or d<>p_expected_intake_digest then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 if p_intake->>'city' is distinct from 'shanghai' or p_intake->>'comparisonTarget' is distinct from 'area_transport' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 if turn_private.explicit_intake_memory_binding_v1(u,p_memory_basis) is null then raise exception 'MEMORY_CONFLICT'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',(v->>'id')::uuid,'revision',(v->>'revision')::bigint) order by (v->>'id')::uuid),'[]') into expected_refs from jsonb_array_elements(old.memory_basis) v;
 select coalesce(jsonb_agg(jsonb_build_object('id',(v->>'id')::uuid,'revision',(v->>'revision')::bigint) order by (v->>'id')::uuid),'[]') into actual_refs from jsonb_array_elements(p_memory_basis) v;
 if actual_refs is distinct from expected_refs then raise exception 'MEMORY_CONFLICT'; end if;
 linked:=public.submit_assistant_message_v1(p_conversation_id,p_message_id,p_message_key,p_text_policy_id,p_locale,p_text,'follow_up',p_goal_id,p_expected_goal_version,p_task_id,p_parent_message_id,null);
 if linked->>'kind'<>'accepted' or linked->>'reused'='true' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 if exists(select 1 from turn_private.assistant_goal_trip_links where goal_id=p_goal_id and owner_id=u and (trip_id is not null or terminal_unlinked)) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 update turn_private.work set execution_mode='planning_intake_comparison_v2' where turn_id=p_turn_id and owner_id=u and state='queued';
 if not found then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 insert into turn_private.planning_comparisons(turn_id,owner_id,task_id,goal_id,message_id,goal_version,planning_policy_id,planning_consent_id,memory_basis,artifact_id,publication_key)
 values(p_turn_id,u,p_task_id,p_goal_id,p_message_id,p_expected_goal_version,p.id,c.consent_id,actual_refs,gen_random_uuid(),gen_random_uuid());
 bound:=turn_private.bind_planning_travel_intake_v1(u,p_turn_id,old.message_id,old.message_sequence,old.intake_revision,old.goal_version,d,p_intake,actual_refs,p_message_key,digest);
 readback:=turn_private.read_planning_qualified_intake_v1(u,p_turn_id,null);
 if readback->>'kind' is distinct from 'planning_intake_input' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
 select * into j from turn_private.planning_comparisons where turn_id=p_turn_id;
 return jsonb_build_object('kind','accepted','reused',false,'taskId',j.task_id,'turnId',j.turn_id,'artifactId',j.artifact_id,'conversationId',p_conversation_id,'goalId',p_goal_id,
  'goalVersion',p_expected_goal_version,'messageId',p_message_id,'messageSequence',(linked->>'sequence')::bigint,'intakeRevision',(bound->>'intakeRevision')::integer,
  'current',true,'intakeContextDigest',readback->>'intakeContextDigest','planningContextDigest',readback->>'planningContextDigest','readyForProvider',false,'executionAvailable',false);
exception when lock_not_available then raise exception 'SERVICE_TASK_CONFLICT';
 when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INPUT';
end $$;
revoke all on function public.submit_planning_comparison_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,uuid,bigint,integer,text,jsonb) from public,anon,service_role;
grant execute on function public.submit_planning_comparison_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,uuid,bigint,integer,text,jsonb) to authenticated;

-- Preserve every old signature/body/ACL outside one exact new-mode rejection.
-- No historical migration or private intake helper is rewritten.
do $$
declare signature text;proc oid;body text;definition text;guard text;tag text;
begin
 foreach signature in array array[
  'public.read_text_work(uuid,uuid)','public.authorize_text_dispatch(uuid,uuid,uuid,text)','public.authorize_text_task_dispatch(uuid,uuid,uuid,text,text)',
  'public.complete_text_work(uuid,uuid,text,text)','public.read_grounded_work(uuid,uuid)','public.authorize_grounded_dispatch(uuid,uuid,uuid,text,text)',
  'public.complete_grounded_work_with_needs(uuid,uuid,text,text,text)',
  'public.complete_grounded_place_work(uuid,uuid,text,text,text,text)',
  'public.finish_turn_work(uuid,uuid,text)','public.claim_planning_action_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)',
  'public.finish_planning_action_v1(uuid,uuid,uuid,text,text)','public.read_planning_comparison_work_v1(uuid,uuid)',
  'public.authorize_planning_read_v1(uuid,uuid,text)','public.authorize_planning_dispatch_v1(uuid,uuid,text,uuid,uuid)',
  'public.pause_planning_comparison_v1(uuid,uuid)','public.complete_planning_observation_v1(uuid,uuid,uuid,text,jsonb)',
  'public.read_planning_observations_v1(uuid,uuid)','public.complete_planning_comparison_v1(uuid,uuid,uuid,text,uuid,text,jsonb)'
 ] loop
  proc:=to_regprocedure(signature);if proc is null then raise exception 'LEGACY_ENTRY_MISSING: %',signature;end if;
  select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid=proc;
  if strpos(body,E'\nbegin\n')=0 then raise exception 'LEGACY_ENTRY_BODY_UNEXPECTED: %',signature;end if;
  tag:=case when signature like '%read_%' or signature like '%authorize_%' then 'blocked' else 'stale' end;
  guard:=E'\nbegin\n  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode=''planning_intake_comparison_v2'') then return jsonb_build_object(''kind'','''||tag||E'''); end if;\n';
  execute replace(definition,body,regexp_replace(body,E'\nbegin\n',guard));
 end loop;
end $$;

-- This existing SQL-language wrapper has no PL/pgSQL BEGIN to prepend.
create or replace function public.complete_grounded_work(p_turn_id uuid,p_lease_token uuid,p_intent text,p_request_scope text)
returns jsonb language sql security definer set search_path='' as $$
 select case when exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode='planning_intake_comparison_v2')
  then jsonb_build_object('kind','stale')
  else turn_private.complete_selected_grounded_work(p_turn_id,p_lease_token,p_intent,p_request_scope,null) end
$$;

create function turn_private.reject_unavailable_intake_completion_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if new.state='completed' and exists(select 1 from turn_private.work where turn_id=new.turn_id and execution_mode='planning_intake_comparison_v2')
  then raise exception 'V2_EXECUTION_UNAVAILABLE';end if;return new;
end $$;
create trigger reject_unavailable_intake_completion before update of state on turn_private.planning_comparisons
 for each row execute function turn_private.reject_unavailable_intake_completion_v1();
revoke all on function turn_private.reject_unavailable_intake_completion_v1() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
