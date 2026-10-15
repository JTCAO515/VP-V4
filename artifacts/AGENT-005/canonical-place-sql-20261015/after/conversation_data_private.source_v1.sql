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
 n integer;total_n integer:=0;reverse_total integer:=0;other_n jsonb;fingerprint_n jsonb;assistant_delivery_n jsonb;directions_n jsonb;directions_raw_bytes_n bigint:=0;relation_n text;extra_n uuid[];
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
   actual_n:=place_actions_private.ask_source_row_v1(spec.relation_name,actual_n);
   n:=n+1;total_n:=total_n+1;
   if n>10000 or total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   key_n:=conversation_data_private.row_key_v1(actual_n,spec.pk);
   directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(actual_n::text);
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
  and n.nspname||'.'||c.relname not in ('turn_private.assistant_event_heads_v1','turn_private.assistant_events_v1','turn_private.assistant_directions_intakes_v1','turn_private.directions_result_sources_v1','turn_private.directions_operations_v1')
  order by 1 loop
  n:=0;
  for actual_n in execute format('select to_jsonb(actual) from %s actual where conversation_data_private.related_v1(%L,conversation_data_private.documents_v1(%L,to_jsonb(actual)),$1,$2) order by to_jsonb(actual)::text collate "C" limit 10001',relation_n,relation_n,relation_n) using g,executions loop
   actual_n:=place_actions_private.ask_source_row_v1(relation_n,actual_n);
   n:=n+1;reverse_total:=reverse_total+1;
   if n>10000 or reverse_total+total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(actual_n::text);
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
   actual_n:=place_actions_private.ask_source_row_v1(relation_n,actual_n);
   n:=n+1;reverse_total:=reverse_total+1;
   if n>10000 or reverse_total+total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(actual_n::text);
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
 directions_n:=turn_private.directions_source_witness_v1(u,'conversation',g);
 fingerprint_n:=jsonb_build_object('directionsSource',directions_n,'assistantDelivery',assistant_delivery_n,'graph',g,'rows',rows_n,'reverse',reverse_n,'sourceAuthorities',authorities_n,'authorityWitness',witness_n,
  'trips',(select coalesce(jsonb_agg(to_jsonb(actual) order by id),'[]') from public.trips actual where id=any(trips_n) and owner_id=u),
  'memory',(select coalesce(jsonb_agg(to_jsonb(actual) order by id),'[]') from public.memory_profiles actual where id=any(memory_n) and owner_id=u),
  'conflicts',conversation_data_private.conflicts_v1(conflicts_n));
 if (directions_n->>'rowCount')::integer+jsonb_array_length(assistant_delivery_n->'rows')+total_n+reverse_total+jsonb_array_length(witness_n)+cardinality(trips_n)+cardinality(memory_n)>4100 or directions_raw_bytes_n+(directions_n->>'bytes')::bigint>1000000 or octet_length(fingerprint_n::text)>1000000 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 if conflicts_n @> array['SCOPE_TOO_LARGE'] then
  g:=jsonb_set(conversation_data_private.empty_graph_v1(),array[case root_kind_n when 'conversation' then 'conversationIds' else 'threadIds' end],to_jsonb(array[root_id_n]));
  erase_n:=conversation_data_private.zero_counts_v1('erase');redact_n:=conversation_data_private.zero_counts_v1('redact');retain_n:=conversation_data_private.zero_counts_v1('retain');rows_n:='[]';refs_n:='{"tripIds":[],"memoryIds":[]}';
 end if;
 return jsonb_build_object('graph',g,'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',authorities_n,'retainedReferences',refs_n,
  'conflicts',conversation_data_private.conflicts_v1(conflicts_n),'rows',rows_n,'directionsSource',directions_n,'assistantDelivery',assistant_delivery_n,'sourceDigest',conversation_data_private.digest_v1(fingerprint_n::text));
end$function$
;
