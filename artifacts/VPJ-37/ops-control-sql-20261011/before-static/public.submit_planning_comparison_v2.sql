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
