CREATE OR REPLACE FUNCTION turn_data_private.export_source_v1(u uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare roots uuid[];msgs uuid[];arts uuid[];tasks uuid[];ex uuid[];g jsonb;refs jsonb;s record;v jsonb;r jsonb;group_rows jsonb[];groups_n jsonb[]:=array[]::jsonb[];ops jsonb[]:=array[]::jsonb[];fences jsonb[]:=array[]::jsonb[];source_keys jsonb[]:=array[]::jsonb[];op_n turn_data_private.operations_v1;key_count integer;sort_n text;
 auths jsonb:='[]';identity_n uuid;row_count_n integer:=0;byte_count_n integer:=0;item jsonb;witness jsonb;st text;
begin
 if exists(select 1 from turn_private.service_tasks where owner_id=u and expected_result='trip_modification') then perform turn_private.require_trip_runtime_v1();return turn_private.trip_privacy_t_export_source_v1(u);end if;
 if turn_data_private.runtime_supported_v1() is not true or turn_data_private.schema_supported_v1() is not true or u is null or not exists(select 1 from auth.users where id=u) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 select turn_data_private.union_ids_v1(array_agg(id)) into roots from(select id from public.turns where owner_id=u union select turn_id from turn_private.text_content where owner_id=u) a;
 if cardinality(roots)>10000 then raise exception 'TURN_CAPACITY';end if;
 for identity_n in select unnest(roots) order by 1 loop if not pg_try_advisory_xact_lock(hashtextextended('turn-data-entity:turnIds:'||identity_n::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;end loop;
 select turn_data_private.union_ids_v1(array_agg(id)) into arts from turn_private.result_artifacts a where a.source_turn_id=any(roots) or exists(select 1 from turn_private.result_revisions r where r.artifact_id=a.id and r.task_turn_id=any(roots));
 select turn_data_private.union_ids_v1(array_agg(id)) into msgs from turn_private.assistant_messages m where m.turn_id=any(roots) or exists(select 1 from turn_private.planning_comparisons p where p.turn_id=any(roots) and p.message_id=m.id) or exists(select 1 from turn_private.result_artifacts a where a.id=any(arts) and a.input_message_id=m.id)
  or exists(select 1 from turn_private.assistant_directions_intakes_v1 retained_i
 join turn_private.assistant_messages owned_message on owned_message.id=retained_i.message_id and owned_message.owner_id=u
 join turn_private.assistant_conversations owned_conversation on owned_conversation.id=retained_i.conversation_id and owned_conversation.owner_id=u
 join turn_private.assistant_goals owned_goal on owned_goal.id=retained_i.goal_id and owned_goal.owner_id=u and owned_goal.conversation_id=owned_conversation.id
 join turn_private.service_tasks owned_task on owned_task.id=retained_i.task_id and owned_task.owner_id=u
 join turn_private.service_task_turns owned_task_turn on owned_task_turn.turn_id=retained_i.task_turn_id and owned_task_turn.task_id=owned_task.id and owned_task_turn.owner_id=u
 join public.turns owned_turn on owned_turn.id=retained_i.task_turn_id and owned_turn.owner_id=u
 join turn_private.text_content owned_text on owned_text.turn_id=owned_turn.id and owned_text.owner_id=u
 where retained_i.owner_id=u and retained_i.task_turn_id=any(roots)
 and owned_message.relationship='follow_up' and owned_message.turn_id is null
 and owned_message.task_id=owned_task.id and owned_message.conversation_id=owned_conversation.id and owned_message.goal_id=owned_goal.id
 and owned_message.sequence=retained_i.message_sequence and owned_message.scope_version=retained_i.goal_version
 and owned_message.policy_id=retained_i.policy_id and owned_message.consent_id=retained_i.consent_id
 and owned_task.policy_id=retained_i.policy_id and owned_task.consent_id=retained_i.consent_id
 and owned_text.policy_id=retained_i.policy_id and owned_text.consent_id=retained_i.consent_id
 and owned_turn.thread_id=owned_task.thread_id and owned_text.thread_id=owned_task.thread_id and retained_i.message_id=m.id);
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
   r:=turn_data_private.export_row_v1(s.relation_name,case when s.relation_name='turn_private.service_tasks' then v-'trip_objective' else v end);row_count_n:=row_count_n+1;byte_count_n:=byte_count_n+octet_length(r::text);
   if row_count_n>10000 or byte_count_n>1000000 then raise exception 'TURN_CAPACITY';end if;
   group_rows:=array_append(group_rows,r);
   if v->>'policy_id' is not null and v->>'consent_id' is not null then auths:=auths||jsonb_build_array(jsonb_build_object('policyId',v->'policy_id','consentId',v->'consent_id'));end if;
   if v->>'planning_policy_id' is not null and v->>'planning_consent_id' is not null then auths:=auths||jsonb_build_array(jsonb_build_object('policyId',v->'planning_policy_id','consentId',v->'planning_consent_id'));end if;
  end loop;
  groups_n:=array_append(groups_n,jsonb_build_object('relation',s.relation_name,'rows',to_jsonb(group_rows)));
 end loop;
 -- New conversations sections share the original qualified snapshot/sourceState
 -- digest and managed-copy qualification; no new module/provenance authority.
 for s in select * from(values
  ('turn_private.assistant_directions_intakes_v1'::text,'message_id'::text),
  ('turn_private.directions_result_sources_v1','artifact_id'),
  ('turn_private.directions_operations_v1','operation_id')) exact_sources(relation_name,key_name) loop
  group_rows:=array[]::jsonb[];
  for v in execute format('select to_jsonb(a) from %s a where owner_id=$1 order by %I limit 10001 for share nowait',s.relation_name,s.key_name) using u loop
   if v->>'owner_id' is distinct from u::text then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   if s.relation_name='turn_private.assistant_directions_intakes_v1' and not exists(select 1 from turn_private.assistant_directions_intakes_v1 retained_i
 join turn_private.assistant_messages owned_message on owned_message.id=retained_i.message_id and owned_message.owner_id=u
 join turn_private.assistant_conversations owned_conversation on owned_conversation.id=retained_i.conversation_id and owned_conversation.owner_id=u
 join turn_private.assistant_goals owned_goal on owned_goal.id=retained_i.goal_id and owned_goal.owner_id=u and owned_goal.conversation_id=owned_conversation.id
 join turn_private.service_tasks owned_task on owned_task.id=retained_i.task_id and owned_task.owner_id=u
 join turn_private.service_task_turns owned_task_turn on owned_task_turn.turn_id=retained_i.task_turn_id and owned_task_turn.task_id=owned_task.id and owned_task_turn.owner_id=u
 join public.turns owned_turn on owned_turn.id=retained_i.task_turn_id and owned_turn.owner_id=u
 join turn_private.text_content owned_text on owned_text.turn_id=owned_turn.id and owned_text.owner_id=u
 where retained_i.owner_id=u and retained_i.task_turn_id=any(roots)
 and owned_message.relationship='follow_up' and owned_message.turn_id is null
 and owned_message.task_id=owned_task.id and owned_message.conversation_id=owned_conversation.id and owned_message.goal_id=owned_goal.id
 and owned_message.sequence=retained_i.message_sequence and owned_message.scope_version=retained_i.goal_version
 and owned_message.policy_id=retained_i.policy_id and owned_message.consent_id=retained_i.consent_id
 and owned_task.policy_id=retained_i.policy_id and owned_task.consent_id=retained_i.consent_id
 and owned_text.policy_id=retained_i.policy_id and owned_text.consent_id=retained_i.consent_id
 and owned_turn.thread_id=owned_task.thread_id and owned_text.thread_id=owned_task.thread_id and retained_i.message_id=(v->>'message_id')::uuid) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   r:=turn_data_private.export_row_v1(s.relation_name,v);
   row_count_n:=row_count_n+1;byte_count_n:=byte_count_n+octet_length(r::text);
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
 -- Exact private terminal source-PK proof, in request/relation/native-PK order.
 for op_n in select * from turn_data_private.operations_v1 where owner_id=u and scope='turn-sensitive-data/1' and state='erased' order by request_id for share nowait loop
  key_count:=0;
  if jsonb_typeof(op_n.source_identity_keys) is distinct from 'array' then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
  for s in select * from turn_data_private.sources_v1() where effect='erase' order by relation_name collate "C" loop
   select string_agg(format('((key->''pk''->>%L)::%s)',k,format_type(a.atttypid,a.atttypmod)),',' order by ord) into sort_n from unnest(s.pk) with ordinality p(k,ord) join pg_attribute a on a.attrelid=s.relation_name::regclass and a.attname=k and a.attnum>0 and not a.attisdropped;
   if (select count(*) from jsonb_array_elements(op_n.source_identity_keys) key where key->>'relation'=s.relation_name) is distinct from (op_n.decision->'erasedCounts'->>s.count_key)::integer then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   for v in execute format('select key->''pk'' from jsonb_array_elements($1) key where key->>''relation''=$2 order by %s',sort_n) using op_n.source_identity_keys,s.relation_name loop
    if notification_private.exact(v,s.pk) is not true then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
    key_count:=key_count+1;r:=jsonb_build_object('requestId',op_n.request_id,'relation',s.relation_name,'pk',turn_data_private.export_row_v1(s.relation_name,v));
    row_count_n:=row_count_n+1;byte_count_n:=byte_count_n+octet_length(r::text);
    if row_count_n>10000 or byte_count_n>1000000 then raise exception 'TURN_CAPACITY';end if;
    source_keys:=array_append(source_keys,r);
   end loop;
  end loop;
  if key_count<>jsonb_array_length(op_n.source_identity_keys) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 end loop;
 auths:=turn_data_private.authorities_union_v1(auths);witness:=turn_data_private.authorities_current_v1(u,auths);
 item:=jsonb_build_object('ownerId',u,'sources',to_jsonb(groups_n),'operations',to_jsonb(ops),'fences',to_jsonb(fences),'sourceIdentityKeys',to_jsonb(source_keys),'sourceRows',jsonb_build_object('data',row_count_n-cardinality(ops)-cardinality(fences)-cardinality(source_keys),'operations',cardinality(ops),'fences',cardinality(fences),'sourceIdentityKeys',cardinality(source_keys)),'sourceAuthorities',auths);
 -- One final canonical pass; row/byte accumulation above never serializes a growing snapshot.
 st:=notification_private.canonical(jsonb_build_object('snapshot',jsonb_build_array(item)));
 if octet_length(st)>1000000 then raise exception 'TURN_CAPACITY';end if;
 return jsonb_build_object('snapshot',item,'sourceDigest',turn_data_private.digest_v1(st),'sourceStateDigest',turn_data_private.digest_v1(jsonb_build_array(item,witness)::text));
end$function$
