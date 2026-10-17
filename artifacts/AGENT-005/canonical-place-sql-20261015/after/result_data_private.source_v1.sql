CREATE OR REPLACE FUNCTION result_data_private.source_v1(u uuid, root_n uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a turn_private.result_artifacts%rowtype;m turn_private.assistant_messages%rowtype;t turn_private.service_tasks%rowtype;
 refs_n jsonb:=result_data_private.empty_refs_v1();g jsonb:=result_data_private.empty_graph_v1();rows_n jsonb:='[]';reverse_n jsonb:='[]';fingerprint_n jsonb;assistant_delivery_n jsonb;directions_n jsonb;
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
 if exists(select 1 from turn_private.result_revisions where artifact_id=root_n and (content->>'schemaVersion' not in('comparison/1','decision/1','journey-draft/1','practical/1','change-proposal-reference/1','travel-directions/1') or content->>'schemaVersion' is null)) then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if exists(select 1 from turn_private.result_revisions directions_revision where directions_revision.artifact_id=root_n and directions_revision.content->>'schemaVersion'='travel-directions/1' and not exists(select 1 from turn_private.directions_result_sources_v1 ds join turn_private.assistant_directions_intakes_v1 di on di.message_id=ds.message_id and di.owner_id=ds.owner_id where ds.artifact_id=root_n and ds.owner_id=u and ds.message_id=m.id and ds.task_turn_id=directions_revision.task_turn_id and di.task_id=a.task_id and di.goal_id=a.goal_id)) then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
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
   v:=place_actions_private.ask_source_row_v1(spec.relation_name,v);
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
 directions_n:=turn_private.directions_source_witness_v1(u,'result',g);
 fingerprint_n:=jsonb_build_object('directionsSource',directions_n,'assistantDelivery',assistant_delivery_n,'graph',g,'rows',rows_n,'reverse',reverse_n,'retainedReferences',refs_n,'authorities',authorities_n,'witness',witness_n,'conflicts',result_data_private.conflicts_v1(conflicts_n));
 if (directions_n->>'rowCount')::integer+jsonb_array_length(assistant_delivery_n->'rows')+total_n+coalesce(jsonb_array_length(witness_n),0)>4100 or raw_bytes_n+(directions_n->>'bytes')::bigint>1000000 or (select sum(jsonb_array_length(value)) from jsonb_each(g))>4100 or octet_length(fingerprint_n::text)>1000000 or jsonb_array_length(g->'eventIds')>3000 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 if 'SCOPE_TOO_LARGE'=any(conflicts_n) then
  g:=jsonb_set(result_data_private.empty_graph_v1(),'{artifactIds}',jsonb_build_array(root_n));refs_n:=result_data_private.empty_refs_v1();
  erase_n:=result_data_private.zero_counts_v1('erase');retain_n:=result_data_private.zero_counts_v1('retain');rows_n:='[]';
 end if;
 return jsonb_build_object('graph',g,'eraseCounts',erase_n,'retainCounts',retain_n,'retainedReferences',refs_n,'conflicts',result_data_private.conflicts_v1(conflicts_n),
  'sourceAuthorities',authorities_n,'rows',rows_n,'reverse',reverse_n,'directionsSource',directions_n,'assistantDelivery',assistant_delivery_n,'sourceDigest',result_data_private.digest_v1(fingerprint_n::text));
end$function$
;
