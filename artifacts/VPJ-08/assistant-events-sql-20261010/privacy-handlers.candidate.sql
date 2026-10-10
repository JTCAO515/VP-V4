-- REVIEW CANDIDATE: exact original conversation_data_private.source_v1(u uuid, root_kind_n text, root_id_n uuid)
CREATE OR REPLACE FUNCTION conversation_data_private.source_v1(u uuid, root_kind_n text, root_id_n uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare closure_n jsonb;g jsonb;spec record;actual_n jsonb;key_n jsonb;ref record;qualified_n boolean;
 rows_n jsonb:='[]';reverse_n jsonb:='[]';authorities_n jsonb:='[]';witness_n jsonb;conflicts_n text[]:=array[]::text[];
 erase_n jsonb:=conversation_data_private.zero_counts_v1('erase');redact_n jsonb:=conversation_data_private.zero_counts_v1('redact');
 retain_n jsonb:=conversation_data_private.zero_counts_v1('retain');refs_n jsonb;trips_n uuid[]:=array[]::uuid[];memory_n uuid[]:=array[]::uuid[];
 executions uuid[]:=array[]::uuid[];turns uuid[];tasks uuid[];messages uuid[];goals uuid[];artifacts uuid[];threads uuid[];
 n integer;total_n integer:=0;reverse_total integer:=0;other_n jsonb;fingerprint_n jsonb;assistant_delivery_n jsonb;relation_n text;extra_n uuid[];
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
    select array_agg(coalesce(entry->>'memoryId',entry->>'id')::uuid) into extra_n from jsonb_array_elements(actual_n->'memory_basis') entry where notification_private.uuid(coalesce(entry->'memoryId',entry->'id')) is true;
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
  and a.attnum>0 and not a.attisdropped and (a.atttypid in('jsonb'::regtype,'json'::regtype) or conversation_data_private.reference_kind_v1(a.attname::text) is not null or n.nspname in('notification_private','service_brief_private','readiness_private','guide_private','scoped_edit_private'))
  and not exists(select 1 from conversation_data_private.sources_v1() s where s.relation_name=n.nspname||'.'||c.relname)
  -- Exact delivery relations covered by private witness and catalog pins.
  and n.nspname||'.'||c.relname not in ('turn_private.assistant_event_heads_v1','turn_private.assistant_events_v1')
  order by 1 loop
  n:=0;
  for actual_n in execute format('select to_jsonb(actual) from %s actual where conversation_data_private.related_v1(%L,conversation_data_private.documents_v1(%L,to_jsonb(actual)),$1,$2) order by to_jsonb(actual)::text collate "C" limit 10001',relation_n,relation_n,relation_n) using g,executions loop
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
 for relation_n in select unnest(array['export_private.core_jobs_v1','export_private.core_artifacts_v1']) loop
  n:=0;
  for actual_n in execute format('select to_jsonb(actual) from %s actual where owner_id=$1 order by request_id limit 10001',relation_n) using u loop
   n:=n+1;reverse_total:=reverse_total+1;
   if n>10000 or reverse_total+total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   reverse_n:=reverse_n||jsonb_build_array(jsonb_build_object('table',relation_n,'digest',conversation_data_private.digest_v1(actual_n::text)));
  end loop;
 end loop;
 if exists(select 1 from export_private.core_artifacts_v1 where owner_id=u)
  or exists(select 1 from export_private.core_jobs_v1 where owner_id=u and (state in('queued','running') or lease_expires_at>clock_timestamp())) then conflicts_n:=conflicts_n||array['CORE_EXPORT_COPY'];end if;
 if exists(select 1 from privacy_private.trip_deletions where owner_id=u and trip_id=any(trips_n) and state='queued')
  or exists(select 1 from privacy_private.linked_delete_fences_v1 f where exists(select 1 from jsonb_each(g) group_n where group_n.value ? f.entity_id::text))
  or exists(select 1 from privacy_private.memory_delete_jobs_v1 j join privacy_private.memory_delete_plans_v1 plan on plan.id=j.plan_id where j.owner_id=u and j.state='queued' and (privacy_private.memory_delete_ids_v1(plan.selection)&&memory_n or privacy_private.linked_delete_array_v1(plan.selection->'artifactIds')&&artifacts or privacy_private.linked_delete_array_v1(plan.selection->'generatedTurnIds')&&turns)) then conflicts_n:=conflicts_n||array['OTHER_DELETE_PENDING'];end if;
 if exists(select 1 from turn_private.result_revisions r where not r.artifact_id=any(artifacts)
  and exists(select 1 from conversation_data_private.json_references_v1(r.content) stored_ref where g->stored_ref.kind ? stored_ref.entity_id::text))
  or exists(select 1 from turn_private.assistant_message_source_receipts r where not r.message_id=any(messages)
   and (conversation_data_private.related_v1('reverse',r.input_sources,g,executions) or conversation_data_private.related_v1('reverse',r.captured_sources,g,executions))) then conflicts_n:=conflicts_n||array['CROSS_SCOPE_REFERENCE'];end if;
 assistant_delivery_n:=turn_private.assistant_delivery_source_v1(u,g);
 fingerprint_n:=jsonb_build_object('assistantDelivery',assistant_delivery_n,'graph',g,'rows',rows_n,'reverse',reverse_n,'sourceAuthorities',authorities_n,'authorityWitness',witness_n,
  'trips',(select coalesce(jsonb_agg(to_jsonb(actual) order by id),'[]') from public.trips actual where id=any(trips_n) and owner_id=u),
  'memory',(select coalesce(jsonb_agg(to_jsonb(actual) order by id),'[]') from public.memory_profiles actual where id=any(memory_n) and owner_id=u),
  'conflicts',conversation_data_private.conflicts_v1(conflicts_n));
 if jsonb_array_length(assistant_delivery_n->'rows')+total_n+reverse_total+jsonb_array_length(witness_n)+cardinality(trips_n)+cardinality(memory_n)>4100 or octet_length(fingerprint_n::text)>1000000 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 if conflicts_n @> array['SCOPE_TOO_LARGE'] then
  g:=jsonb_set(conversation_data_private.empty_graph_v1(),array[case root_kind_n when 'conversation' then 'conversationIds' else 'threadIds' end],to_jsonb(array[root_id_n]));
  erase_n:=conversation_data_private.zero_counts_v1('erase');redact_n:=conversation_data_private.zero_counts_v1('redact');retain_n:=conversation_data_private.zero_counts_v1('retain');rows_n:='[]';refs_n:='{"tripIds":[],"memoryIds":[]}';
 end if;
 return jsonb_build_object('graph',g,'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',authorities_n,'retainedReferences',refs_n,
  'conflicts',conversation_data_private.conflicts_v1(conflicts_n),'rows',rows_n,'assistantDelivery',assistant_delivery_n,'sourceDigest',conversation_data_private.digest_v1(fingerprint_n::text));
end$function$
;

-- REVIEW CANDIDATE: exact original conversation_data_private.lock_source_v1(u uuid, source_n jsonb)
CREATE OR REPLACE FUNCTION conversation_data_private.lock_source_v1(u uuid, source_n jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g jsonb:=source_n->'graph';identity_n uuid;ref record;row_n jsonb;table_n text;pk_n text[];
begin
 -- Original submit_service_task_turn identity pair precedes task/thread locks.
 for identity_n in select distinct value::uuid from (
  select jsonb_array_elements_text(g->'taskIds') value union select jsonb_array_elements_text(g->'turnIds') value) identities order by value::uuid loop
  if not pg_try_advisory_xact_lock(hashtextextended('service-task-identity:'||identity_n::text,0)) then raise lock_not_available using message='CONVERSATION_CONFLICT';end if;
 end loop;
 perform 1 from turn_private.service_tasks where id=any(privacy_private.linked_delete_array_v1(g->'taskIds')) and owner_id=u order by id for update nowait;
 perform 1 from public.trips where id=any(privacy_private.linked_delete_array_v1(source_n->'retainedReferences'->'tripIds')) and owner_id=u order by id for update nowait;
 for ref in select groups.key kind,ids.value::uuid entity_id from jsonb_each(g) groups cross join lateral jsonb_array_elements_text(groups.value) ids(value) order by groups.key collate "C",ids.value::uuid loop
  if not pg_try_advisory_xact_lock(hashtextextended('conversation-data-entity:'||ref.kind||':'||ref.entity_id::text,0)) then raise lock_not_available using message='CONVERSATION_CONFLICT';end if;
 end loop;
 perform 1 from turn_private.assistant_conversations where id=any(privacy_private.linked_delete_array_v1(g->'conversationIds')) and owner_id=u order by id for update nowait;
 perform 1 from public.chat_threads where id=any(privacy_private.linked_delete_array_v1(g->'threadIds')) and owner_id=u order by id for update nowait;
 perform 1 from public.turns where id=any(privacy_private.linked_delete_array_v1(g->'turnIds')) and owner_id=u order by id for update nowait;
 perform 1 from turn_private.assistant_goals where id=any(privacy_private.linked_delete_array_v1(g->'goalIds')) and owner_id=u order by id for update nowait;
 perform 1 from turn_private.assistant_messages where id=any(privacy_private.linked_delete_array_v1(g->'messageIds')) and owner_id=u order by id for update nowait;
 perform 1 from turn_private.result_artifacts where id=any(privacy_private.linked_delete_array_v1(g->'artifactIds')) and owner_id=u order by id for update nowait;
 perform 1 from public.memory_profiles where id=any(privacy_private.linked_delete_array_v1(source_n->'retainedReferences'->'memoryIds')) and owner_id=u order by id for share nowait;
 perform conversation_data_private.authorities_current_v1(u,source_n->'sourceAuthorities');
 for row_n in select value from jsonb_array_elements(source_n->'rows') order by value->>'table' collate "C",(value->'pk')::text collate "C" loop
  table_n:=row_n->>'table';select pk into pk_n from conversation_data_private.sources_v1() where relation_name=table_n;
  if pk_n is null then raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';end if;
  execute format('select 1 from %s actual where conversation_data_private.row_key_v1(to_jsonb(actual),$1)=$2 for update nowait',table_n) using pk_n,row_n->'pk';
 end loop;
 perform turn_private.lock_assistant_delivery_v1(u,source_n->'graph',source_n->'assistantDelivery');
end$function$
;

-- REVIEW CANDIDATE: exact original conversation_data_private.erase_source_v1(u uuid, source_n jsonb)
CREATE OR REPLACE FUNCTION conversation_data_private.erase_source_v1(u uuid, source_n jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare relation_n text;spec record;key_n jsonb;selected_n jsonb;count_n integer;sum_n integer;progress_n integer;remaining_n integer;
 actual_erase jsonb:=conversation_data_private.zero_counts_v1('erase');actual_redact jsonb:=conversation_data_private.zero_counts_v1('redact');
 turns uuid[]:=privacy_private.linked_delete_array_v1(source_n->'graph'->'turnIds');tasks uuid[]:=privacy_private.linked_delete_array_v1(source_n->'graph'->'taskIds');
begin
 perform turn_private.retire_assistant_delivery_v1(u,source_n->'graph',source_n->'assistantDelivery');
 -- Exactly selected text keeps its original NOT NULL and retained task FK.
 update turn_private.text_content set input_text='[deleted by scoped conversation request]',output_kind=null,output_text=null,hidden_at=coalesce(hidden_at,clock_timestamp())
  where turn_id=any(turns) and owner_id=u;get diagnostics count_n=row_count;
 actual_redact:=jsonb_set(actual_redact,'{textBodies}',to_jsonb(count_n));
 update turn_private.service_tasks set goal_digest=conversation_data_private.digest_v1('[deleted by scoped conversation request]') where id=any(tasks) and owner_id=u;
 get diagnostics count_n=row_count;actual_redact:=jsonb_set(actual_redact,'{taskDigests}',to_jsonb(count_n));
 foreach relation_n in array conversation_data_private.erase_order_v1() loop
  select * into spec from conversation_data_private.sources_v1() where relation_name=relation_n;
  select coalesce(jsonb_agg(value->'pk' order by (value->'pk')::text collate "C"),'[]'::jsonb) into selected_n
   from jsonb_array_elements(source_n->'rows') where value->>'table'=relation_n;
  sum_n:=0;
  if relation_n in('turn_private.assistant_messages','turn_private.result_artifacts') then
   loop
    execute format('delete from %s actual where conversation_data_private.row_key_v1(to_jsonb(actual),$1) in(select value from jsonb_array_elements($2)) and actual.owner_id=$3 and not exists(select 1 from %s child where child.%I=actual.id)',
     relation_n,relation_n,case relation_n when 'turn_private.assistant_messages' then 'parent_message_id' else 'source_result_id' end)
     using spec.pk,selected_n,u;get diagnostics progress_n=row_count;sum_n:=sum_n+progress_n;exit when progress_n=0;
   end loop;
   execute format('select count(*) from %s actual where conversation_data_private.row_key_v1(to_jsonb(actual),$1) in(select value from jsonb_array_elements($2))',relation_n)
    into remaining_n using spec.pk,selected_n;
   if remaining_n<>0 then raise exception 'CONVERSATION_SOURCE_CHANGED';end if;
  else
   for key_n in select value from jsonb_array_elements(selected_n) order by value::text collate "C" loop
    execute format('delete from %s actual where conversation_data_private.row_key_v1(to_jsonb(actual),$1)=$2',relation_n) using spec.pk,key_n;
    get diagnostics count_n=row_count;sum_n:=sum_n+count_n;
   end loop;
  end if;
  actual_erase:=jsonb_set(actual_erase,array[spec.count_key],to_jsonb(sum_n));
 end loop;
 if actual_erase is distinct from source_n->'eraseCounts' or actual_redact is distinct from source_n->'redactCounts' then raise exception 'CONVERSATION_SOURCE_CHANGED';end if;
 return jsonb_build_object('erasedCounts',actual_erase,'redactedCounts',actual_redact,'retainedCounts',source_n->'retainCounts');
end$function$
;

-- REVIEW CANDIDATE: exact original result_data_private.source_v1(u uuid, root_n uuid)
CREATE OR REPLACE FUNCTION result_data_private.source_v1(u uuid, root_n uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a turn_private.result_artifacts%rowtype;m turn_private.assistant_messages%rowtype;t turn_private.service_tasks%rowtype;
 refs_n jsonb:=result_data_private.empty_refs_v1();g jsonb:=result_data_private.empty_graph_v1();rows_n jsonb:='[]';reverse_n jsonb:='[]';fingerprint_n jsonb;assistant_delivery_n jsonb;
 erase_n jsonb:=result_data_private.zero_counts_v1('erase');retain_n jsonb:=result_data_private.zero_counts_v1('retain');authorities_n jsonb:='[]';witness_n jsonb;
 spec record;v jsonb;doc_n jsonb;key_n jsonb;r record;count_key text;effect_n text;conflicts_n text[]:=array[]::text[];
 turns_n uuid[];jobs_n uuid[];impact_n uuid[];id_n uuid;tuple_n jsonb;qualified_n boolean;n integer;total_n integer:=0;raw_bytes_n bigint:=0;
begin
 select * into a from turn_private.result_artifacts where id=root_n and owner_id=u;
 if not found then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 select * into m from turn_private.assistant_messages where id=a.input_message_id and owner_id=u;
 select * into t from turn_private.service_tasks where id=a.task_id and owner_id=u;
 if m.id is null or t.id is null or m.goal_id<>a.goal_id or m.task_id<>a.task_id or not exists(select 1 from turn_private.assistant_goals original where original.id=a.goal_id and original.owner_id=u and original.conversation_id=m.conversation_id) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 authorities_n:=jsonb_build_array(jsonb_build_object('policyId',m.policy_id,'consentId',m.consent_id),jsonb_build_object('policyId',t.policy_id,'consentId',t.consent_id));
 authorities_n:=conversation_data_private.authorities_union_v1(authorities_n);
 perform conversation_data_private.authorities_current_v1(u,authorities_n);
 if not result_data_private.schema_supported_v1() then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 refs_n:=refs_n||jsonb_build_object('conversationIds',jsonb_build_array(m.conversation_id),'goalIds',jsonb_build_array(a.goal_id),'messageIds',jsonb_build_array(m.id),
  'taskIds',jsonb_build_array(t.id),'threadIds',case when t.thread_id is null then '[]'::jsonb else jsonb_build_array(t.thread_id) end,
  'tripIds',case when a.trip_id is null then '[]'::jsonb else jsonb_build_array(a.trip_id) end,
  'sourceArtifactIds',case when a.source_result_id is null then '[]'::jsonb else jsonb_build_array(a.source_result_id) end,
  'proposalIds',case when a.proposal_id is null then '[]'::jsonb else jsonb_build_array(a.proposal_id) end);
 select conversation_data_private.union_ids_v1(array_agg(task_turn_id)||array[t.goal_turn_id,t.last_turn_id,a.source_turn_id]) into turns_n from turn_private.result_revisions where artifact_id=root_n;
 refs_n:=jsonb_set(refs_n,'{turnIds}',to_jsonb(turns_n));
 select coalesce(jsonb_agg(id order by id),'[]') into doc_n from public.memory_profiles where owner_id=u and id in(
  select coalesce(b->>'memoryId',b->>'id')::uuid from turn_private.result_revisions x cross join lateral jsonb_array_elements(x.memory_basis) b
  where x.artifact_id=root_n and notification_private.uuid(coalesce(b->'memoryId',b->'id')));
 refs_n:=jsonb_set(refs_n,'{memoryIds}',doc_n);
 if exists(select 1 from turn_private.result_revisions x cross join lateral jsonb_array_elements(x.memory_basis) basis
  where x.artifact_id=root_n and (notification_private.uuid(coalesce(basis->'memoryId',basis->'id')) is not true or not exists(select 1 from public.memory_profiles mp where mp.id::text=coalesce(basis->>'memoryId',basis->>'id') and mp.owner_id=u))) then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 select g||jsonb_build_object('artifactIds',jsonb_build_array(root_n),'revisions',coalesce(jsonb_agg(revision order by revision),'[]'),
  'publicationKeys',coalesce(jsonb_agg(idempotency_key order by idempotency_key),'[]')) into g from turn_private.result_revisions where artifact_id=root_n;
 select jsonb_set(g,'{eventIds}',coalesce(jsonb_agg(id::text order by id),'[]')) into g from turn_private.result_events where artifact_id=root_n;
 if jsonb_array_length(g->'revisions')<>a.current_revision or g->'revisions' is distinct from(select jsonb_agg(x) from generate_series(1,a.current_revision) x)
  or (select count(distinct idempotency_key) from turn_private.result_revisions where artifact_id=root_n)<>a.current_revision
  or exists(select 1 from turn_private.result_revisions where artifact_id=root_n and owner_id<>u)
  or exists(select 1 from turn_private.result_events where artifact_id=root_n and (owner_id<>u or id<=0 or revision not between 1 and a.current_revision))
  or jsonb_array_length(g->'eventIds')<a.current_revision then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if exists(select 1 from turn_private.result_revisions historical_n where historical_n.artifact_id=root_n and (historical_n.input_sequence<>m.sequence
  or not exists(select 1 from turn_private.service_task_turns st where st.turn_id=historical_n.task_turn_id and st.task_id=a.task_id and st.owner_id=u)
  or turn_private.valid_result_content_v2(historical_n.content) is not true or turn_private.valid_result_evidence_v2(historical_n.evidence_basis) is not true
  or not exists(select 1 from turn_private.result_events e where e.artifact_id=root_n and e.owner_id=u and e.revision=historical_n.revision and e.event_type=case historical_n.revision when 1 then 'ready' else 'revised' end))) then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if exists(select 1 from turn_private.result_revisions where artifact_id=root_n and (content->>'schemaVersion' not in('comparison/1','decision/1','journey-draft/1','practical/1','change-proposal-reference/1') or content->>'schemaVersion' is null)) then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if a.proposal_id is not null or exists(select 1 from turn_private.result_revisions where artifact_id=root_n and content->>'schemaVersion'='change-proposal-reference/1') then conflicts_n:=conflicts_n||array['PROPOSAL_REFERENCE'];end if;
 if a.source_result_id is not null or exists(select 1 from turn_private.result_revisions where artifact_id=root_n and content->>'schemaVersion'='decision/1') then conflicts_n:=conflicts_n||array['DECISION_REFERENCE'];end if;
 select coalesce(array_agg(turn_id order by turn_id),array[]::uuid[]) into jobs_n from turn_private.planning_comparisons where artifact_id=root_n;
 if cardinality(jobs_n)>1 then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 for id_n in select id from turn_private.planning_v2_execution_runs where turn_id=any(jobs_n) or task_id=a.task_id loop
  if cardinality(jobs_n)=1 and result_data_private.completed_copy_v1(u,root_n,id_n) then g:=jsonb_set(g,'{executionIds}',(g->'executionIds')||to_jsonb(id_n));
  else conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
 end loop;
 for id_n in select request_id from turn_private.planning_v2_model_local_journal where turn_id=any(jobs_n) loop
  if result_data_private.journal_copy_v1(u,root_n,id_n) then g:=jsonb_set(g,'{journalIds}',(g->'journalIds')||to_jsonb(id_n));else conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
 end loop;
 if jsonb_array_length(g->'executionIds')>1 or jsonb_array_length(g->'journalIds')>1 then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 impact_n:=result_data_private.impact_sets_v1(g);
 if cardinality(impact_n)>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 -- Every fixed relation is searched for scalar, typed JSON and original BYTEA
 -- dependencies; foreign rows enter only internal hashes and blocker names.
 for spec in select * from result_data_private.relations_v1() order by relation_name collate "C" loop
  n:=0;
  for v in execute format('select to_jsonb(actual) from %s actual where result_data_private.erase_member_v1(%L,to_jsonb(actual),$1) is not null or result_data_private.source_member_v1(%L,to_jsonb(actual),$2,$3) is not null or result_data_private.related_v1(%L,to_jsonb(actual),$1) or result_data_private.reverse_binding_v1(%L,to_jsonb(actual),$3,$6) or (%L like ''knowledge_review_private.source_impact_%%'' and (to_jsonb(actual)->>''set_id''=any($4::text[]) or %L=''knowledge_review_private.source_impact_sets'' and to_jsonb(actual)->>''id''=any($4::text[]) or %L=''knowledge_review_private.source_impact_review_requests'' and (to_jsonb(actual)->>''delivery_id'' in(select id::text from knowledge_review_private.source_impact_outbox where set_id=any($4)) or to_jsonb(actual)->>''projection_id'' in(select id::text from knowledge_review_private.source_impact_projections where set_id=any($4))))) or (%L in(''export_private.core_jobs_v1'',''export_private.core_artifacts_v1'') and to_jsonb(actual)->>''owner_id''=$5::text) order by to_jsonb(actual)::text collate "C" limit 10001',
   spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name)
   using g,refs_n,jobs_n,impact_n,u,a.task_id loop
   n:=n+1;total_n:=total_n+1;raw_bytes_n:=raw_bytes_n+octet_length(v::text);
   if n>10000 or total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   key_n:=result_data_private.row_key_v1(v,spec.pk);
   if cardinality(spec.pk)=0 then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
   count_key:=result_data_private.erase_member_v1(spec.relation_name,v,g);effect_n:='erase';
   if count_key is null then count_key:=result_data_private.source_member_v1(spec.relation_name,v,refs_n,jobs_n);effect_n:='retain';end if;
   if count_key is not null then
    qualified_n:=v->>'owner_id'=u::text;
    if v->>'owner_id' is null then
     if spec.relation_name='public.model_budget_attempts' then qualified_n:=exists(select 1 from public.model_budget_scopes where id=(v->>'scope_id')::uuid and owner_id=u);
     elsif spec.relation_name='public.model_budget_provider_limits' then qualified_n:=exists(select 1 from public.model_budget_scopes where id=(v->>'scope_id')::uuid and owner_id=u);
     elsif spec.relation_name='turn_private.planning_v2_registered_tariffs' then qualified_n:=exists(select 1 from turn_private.planning_v2_execution_runs admitted join turn_private.planning_v2_execution_profiles profile on profile.id=admitted.profile_id where admitted.owner_id=u and g->'executionIds' ? admitted.id::text and profile.tariff_id::text=v->>'id');
     elsif spec.relation_name='turn_private.planning_v2_collector_principals' then qualified_n:=exists(select 1 from turn_private.planning_v2_execution_runs admitted where admitted.owner_id=u and g->'executionIds' ? admitted.id::text and admitted.collector_principal_id::text=v->>'id');
     elsif spec.relation_name='turn_private.text_dispatches' then qualified_n:=exists(select 1 from turn_private.text_content where turn_id=(v->>'turn_id')::uuid and owner_id=u);
     else qualified_n:=exists(select 1 from turn_private.planning_v2_execution_runs where id=(v->>'execution_id')::uuid and owner_id=u and g->'executionIds' ? id::text);end if;
    end if;
    if qualified_n is not true then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
    rows_n:=rows_n||jsonb_build_array(jsonb_build_object('table',spec.relation_name,'pk',key_n,'digest',result_data_private.digest_v1(v::text),'effect',effect_n,'countKey',count_key));
    if effect_n='erase' then erase_n:=jsonb_set(erase_n,array[count_key],to_jsonb((erase_n->>count_key)::integer+1));
    else retain_n:=jsonb_set(retain_n,array[count_key],to_jsonb((retain_n->>count_key)::integer+1));end if;
    if v->>'policy_id' is not null and v->>'consent_id' is not null then authorities_n:=authorities_n||jsonb_build_array(jsonb_build_object('policyId',v->'policy_id','consentId',v->'consent_id'));end if;
    if v->>'planning_policy_id' is not null and v->>'planning_consent_id' is not null then authorities_n:=authorities_n||jsonb_build_array(jsonb_build_object('policyId',v->'planning_policy_id','consentId',v->'planning_consent_id'));end if;
    if spec.relation_name='public.turns' and v->>'status' not in('completed','unavailable','failed','cancelled')
     or spec.relation_name='turn_private.work' and v->>'state' not in('completed','failed','cancelled')
     or spec.relation_name='turn_private.grounded_ai_assist_jobs' and v->>'status' in('queued','running')
     or spec.relation_name='turn_private.service_task_capacity' and v->>'state'='reserved'
     or spec.relation_name='public.model_budget_attempts' and v->>'status' not in('settled','released')
     or spec.relation_name='turn_private.planning_comparisons' and v->>'state'<>'completed'
     or spec.relation_name='turn_private.planning_v2_place_checkpoints' and v->>'state'<>'completed'
     or spec.relation_name='turn_private.planning_v2_model_attempt_bindings' and v->>'unknown_at' is not null
     or spec.relation_name='turn_private.planning_action_receipts' and v->>'state'<>'completed' then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
    if effect_n='retain' and spec.relation_name<>'turn_private.planning_comparisons' and result_data_private.related_v1(spec.relation_name,v,g) then
     conflicts_n:=conflicts_n||case when spec.relation_name='turn_private.assistant_message_source_receipts' then 'CONVERSATION_SOURCE_REFERENCE' else 'SOURCE_UNSUPPORTED' end;
    end if;
   else
    reverse_n:=reverse_n||jsonb_build_array(jsonb_build_object('table',spec.relation_name,'pk',key_n,'digest',result_data_private.digest_v1(v::text)));
    conflicts_n:=conflicts_n||case
     when spec.relation_name='turn_private.result_artifacts' or spec.relation_name='turn_private.result_revisions' then case when v->'content'->>'schemaVersion'='decision/1' or v->>'source_result_id'=root_n::text then 'DECISION_REFERENCE' else 'CROSS_RESULT_REFERENCE' end
     when spec.relation_name='turn_private.assistant_message_source_receipts' then 'CONVERSATION_SOURCE_REFERENCE'
     when result_data_private.reverse_binding_v1(spec.relation_name,v,jobs_n,a.task_id) then 'SHARED_OR_FOREIGN_SCOPE'
     when spec.relation_name like 'readiness_private.%' then 'READINESS_REFERENCE' when spec.relation_name like 'guide_private.%' then 'GUIDE_REFERENCE'
     when spec.relation_name like 'scoped_edit_private.%' then 'SCOPED_EDIT_REFERENCE' when spec.relation_name like 'notification_private.%' or spec.relation_name like 'notification_exit_private.%' then 'NOTIFICATION_REFERENCE'
     when spec.relation_name like 'service_brief_private.%' then 'BRIEF_REFERENCE' when spec.relation_name like 'knowledge_review_private.source_impact_%' then 'KNOWLEDGE_MIXED_COPY'
     when spec.relation_name='public.trip_proposals' then 'PROPOSAL_REFERENCE'
     when spec.relation_name in('export_private.core_jobs_v1','export_private.core_artifacts_v1') then null
     when spec.relation_name like 'privacy_private.%' or spec.relation_name like 'conversation_data_private.%' then 'OTHER_DELETE_PENDING'
     else 'SOURCE_UNSUPPORTED' end;
   end if;
  end loop;
  if 'SCOPE_TOO_LARGE'=any(conflicts_n) then exit;end if;
 end loop;
 -- References and source identities are owner-qualified exactly, including every
 -- historical turn; absence/foreign mismatch is never reported as an eligible graph.
 if (retain_n->>'conversations')::integer<>1 or (retain_n->>'goals')::integer<>1 or (retain_n->>'messages')::integer<>1 or (retain_n->>'tasks')::integer<>1
  or (retain_n->>'turns')::integer<>cardinality(turns_n)
  or (retain_n->>'threads')::integer<>jsonb_array_length(refs_n->'threadIds')
  or (retain_n->>'trips')::integer<>jsonb_array_length(refs_n->'tripIds')
  or (retain_n->>'sourceArtifacts')::integer<>jsonb_array_length(refs_n->'sourceArtifactIds')
  or (retain_n->>'proposals')::integer<>jsonb_array_length(refs_n->'proposalIds') then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 if exists(select 1 from export_private.core_artifacts_v1 where owner_id=u) or exists(select 1 from export_private.core_jobs_v1 where owner_id=u and (state in('queued','running') or lease_expires_at>clock_timestamp())) then conflicts_n:=conflicts_n||array['CORE_EXPORT_COPY'];end if;
 if exists(select 1 from privacy_private.trip_deletions where owner_id=u and state='queued' and refs_n->'tripIds' ? trip_id::text)
  or exists(select 1 from privacy_private.linked_delete_fences_v1 where entity_id=root_n or refs_n->'turnIds' ? entity_id::text)
  or exists(select 1 from privacy_private.memory_delete_jobs_v1 j join privacy_private.memory_delete_plans_v1 p on p.id=j.plan_id where j.owner_id=u and j.state='queued' and (p.selection->'artifactIds' ? root_n::text or privacy_private.memory_delete_ids_v1(p.selection)&&privacy_private.linked_delete_array_v1(refs_n->'memoryIds')))
  or exists(select 1 from conversation_data_private.operations_v1 o where owner_id=u and state='previewed' and not preview_erased and expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint and (o.graph->'artifactIds' ? root_n::text or o.graph->'taskIds' ? a.task_id::text or o.graph->'turnIds' ?| array(select jsonb_array_elements_text(refs_n->'turnIds'))))
  or exists(select 1 from conversation_data_private.operations_v1 o where state='erased' and (o.decision->'graph'->'artifactIds' ? root_n::text or o.decision->'graph'->'taskIds' ? a.task_id::text)) then conflicts_n:=conflicts_n||array['OTHER_DELETE_PENDING'];end if;
 for r in select * from result_data_private.deletion_witnesses_v1(u,refs_n,g) order by relation_name collate "C",document_n::text collate "C" limit 4101 loop
  total_n:=total_n+1;raw_bytes_n:=raw_bytes_n+octet_length(r.document_n::text);
  select pk into spec from result_data_private.relations_v1() where relation_name=r.relation_name;
  key_n:=case when r.relation_name='conversation_data_private.operations_v1' then jsonb_build_object('request_id',r.document_n->'request_id') else result_data_private.row_key_v1(r.document_n,spec.pk) end;
  reverse_n:=reverse_n||jsonb_build_array(jsonb_build_object('table',r.relation_name,'pk',key_n,'digest',result_data_private.digest_v1(r.document_n::text)));
  conflicts_n:=conflicts_n||array['OTHER_DELETE_PENDING'];
 end loop;
 authorities_n:=conversation_data_private.authorities_union_v1(authorities_n);
 if jsonb_array_length(authorities_n)>100 then raise exception 'RESULT_CAPACITY';end if;
 witness_n:=conversation_data_private.authorities_current_v1(u,authorities_n);
 assistant_delivery_n:=turn_private.assistant_delivery_source_v1(u,g);
 fingerprint_n:=jsonb_build_object('assistantDelivery',assistant_delivery_n,'graph',g,'rows',rows_n,'reverse',reverse_n,'retainedReferences',refs_n,'authorities',authorities_n,'witness',witness_n,'conflicts',result_data_private.conflicts_v1(conflicts_n));
 if jsonb_array_length(assistant_delivery_n->'rows')+total_n+coalesce(jsonb_array_length(witness_n),0)>4100 or raw_bytes_n>1000000 or (select sum(jsonb_array_length(value)) from jsonb_each(g))>4100 or octet_length(fingerprint_n::text)>1000000 or jsonb_array_length(g->'eventIds')>3000 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 if 'SCOPE_TOO_LARGE'=any(conflicts_n) then
  g:=jsonb_set(result_data_private.empty_graph_v1(),'{artifactIds}',jsonb_build_array(root_n));refs_n:=result_data_private.empty_refs_v1();
  erase_n:=result_data_private.zero_counts_v1('erase');retain_n:=result_data_private.zero_counts_v1('retain');rows_n:='[]';
 end if;
 return jsonb_build_object('graph',g,'eraseCounts',erase_n,'retainCounts',retain_n,'retainedReferences',refs_n,'conflicts',result_data_private.conflicts_v1(conflicts_n),
  'sourceAuthorities',authorities_n,'rows',rows_n,'reverse',reverse_n,'assistantDelivery',assistant_delivery_n,'sourceDigest',result_data_private.digest_v1(fingerprint_n::text));
end$function$
;

-- REVIEW CANDIDATE: exact original result_data_private.lock_source_v1(u uuid, source_n jsonb)
CREATE OR REPLACE FUNCTION result_data_private.lock_source_v1(u uuid, source_n jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;v jsonb;pk_n text[];refs_n jsonb:=source_n->'retainedReferences';
begin
 -- Existing publication idempotency locks precede source parent locks. No
 -- owner-wide producer lock is added; only the eraser has exclusive entities.
 for r in select jsonb_array_elements_text(source_n->'graph'->'publicationKeys') id order by 1 loop
  if not pg_try_advisory_xact_lock(hashtextextended('result-idempotency:'||u||':'||r.id,0)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
 end loop;
 perform 1 from turn_private.service_tasks where owner_id=u and refs_n->'taskIds' ? id::text order by id for update nowait;
 perform 1 from public.trips where owner_id=u and refs_n->'tripIds' ? id::text order by id for update nowait;
 perform 1 from turn_private.assistant_conversations where owner_id=u and refs_n->'conversationIds' ? id::text order by id for update nowait;
 perform 1 from public.chat_threads where owner_id=u and refs_n->'threadIds' ? id::text order by id for update nowait;
 perform 1 from public.turns where owner_id=u and refs_n->'turnIds' ? id::text order by id for update nowait;
 perform 1 from turn_private.assistant_goals where owner_id=u and refs_n->'goalIds' ? id::text order by id for update nowait;
 perform 1 from turn_private.assistant_messages where owner_id=u and refs_n->'messageIds' ? id::text order by id for update nowait;
 for r in select groups.key kind,ids.value::uuid id from jsonb_each(source_n->'graph') groups cross join lateral jsonb_array_elements_text(groups.value) ids(value)
  where groups.key in('artifactIds','executionIds','journalIds','publicationKeys') order by groups.key collate "C",ids.value::uuid loop
  if not pg_try_advisory_xact_lock(hashtextextended('result-data-entity:'||r.kind||':'||r.id::text,0)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
  if result_data_private.fenced_v1(r.kind,r.id) then raise exception 'RESULT_CONFLICT';end if;
 end loop;
 perform conversation_data_private.authorities_current_v1(u,source_n->'sourceAuthorities');
 for v in select value from jsonb_array_elements((source_n->'rows')||(source_n->'reverse')) order by value->>'table' collate "C",(value->'pk')::text collate "C" loop
  select pk into pk_n from result_data_private.relations_v1() where relation_name=v->>'table';
  if v->>'table'='conversation_data_private.operations_v1' then pk_n:=array['request_id'];end if;
  if pk_n is null or cardinality(pk_n)=0 then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
  execute format('select 1 from %s actual where result_data_private.row_key_v1(to_jsonb(actual),$1)=$2 for update nowait',v->>'table') using pk_n,v->'pk';
 end loop;
 perform turn_private.lock_assistant_delivery_v1(u,source_n->'graph',source_n->'assistantDelivery');
end$function$
;

-- REVIEW CANDIDATE: exact original result_data_private.erase_source_v1(u uuid, source_n jsonb)
CREATE OR REPLACE FUNCTION result_data_private.erase_source_v1(u uuid, source_n jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare relation_n text;v jsonb;pk_n text[];count_key text;expected_n integer;actual_n integer;counts_n jsonb:=result_data_private.zero_counts_v1('erase');
begin
 perform turn_private.retire_assistant_delivery_v1(u,source_n->'graph',source_n->'assistantDelivery');
 -- Children are explicit and counted. This order leaves no FK cascade effect.
 foreach relation_n in array array['turn_private.result_events','turn_private.result_revisions','turn_private.planning_v2_completed_receipts','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_model_local_journal','turn_private.planning_v2_result_claims','turn_private.planning_v2_external_call_windows','turn_private.planning_v2_collector_origins','turn_private.planning_v2_completion_proofs','turn_private.planning_v2_execution_runs','turn_private.result_artifacts'] loop
  select pk into pk_n from result_data_private.relations_v1() where relation_name=relation_n;
  for v in select value from jsonb_array_elements(source_n->'rows') where value->>'table'=relation_n and value->>'effect'='erase' order by (value->'pk')::text collate "C" loop
   execute format('delete from %s actual where result_data_private.row_key_v1(to_jsonb(actual),$1)=$2 and result_data_private.digest_v1(to_jsonb(actual)::text)=$3',relation_n)
    using pk_n,v->'pk',v->>'digest';get diagnostics actual_n=row_count;
   if actual_n<>1 then raise exception 'RESULT_SOURCE_CHANGED';end if;
   count_key:=v->>'countKey';counts_n:=jsonb_set(counts_n,array[count_key],to_jsonb((counts_n->>count_key)::integer+actual_n));
  end loop;
 end loop;
 if counts_n is distinct from source_n->'eraseCounts' then raise exception 'RESULT_SOURCE_CHANGED';end if;
 -- Source preservation verified after all actual triggers/effects, by full rows.
 for v in select value from jsonb_array_elements(source_n->'rows') where value->>'effect'='retain' loop
  select pk into pk_n from result_data_private.relations_v1() where relation_name=v->>'table';
  execute format('select count(*) from %s actual where result_data_private.row_key_v1(to_jsonb(actual),$1)=$2 and result_data_private.digest_v1(to_jsonb(actual)::text)=$3',v->>'table') into actual_n using pk_n,v->'pk',v->>'digest';
  if actual_n<>1 then raise exception 'RESULT_SOURCE_CHANGED';end if;
 end loop;
 return jsonb_build_object('erasedCounts',counts_n,'retainedCounts',source_n->'retainCounts');
end$function$
;
