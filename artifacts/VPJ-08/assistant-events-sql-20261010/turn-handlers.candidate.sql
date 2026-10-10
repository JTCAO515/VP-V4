-- Exact final1b8 Turn source candidate only: turn_data_private.source_v1(u uuid, t uuid)
CREATE OR REPLACE FUNCTION turn_data_private.source_v1(u uuid, t uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b jsonb;g jsonb;refs jsonb;bad text[];spec record;v jsonb;pk_n jsonb;ref record;rel text;ex uuid[];parents uuid[];rows_n jsonb[]:=array[]::jsonb[];reverse_n jsonb[]:=array[]::jsonb[];
 impact_n jsonb;auths jsonb:='[]';witness jsonb;erase_n jsonb:=turn_data_private.zero_counts_v1('erase');redact_n jsonb:=turn_data_private.zero_counts_v1('redact');retain_n jsonb:=turn_data_private.zero_counts_v1('retain');total_n integer:=0;n integer;effect_n text;qualified boolean;fp jsonb;assistant_delivery_n jsonb;trips_n uuid[]:=array[]::uuid[];mems uuid[]:=array[]::uuid[];
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
   and n.nspname||'.'||c.relname not in ('turn_private.assistant_event_heads_v1','turn_private.assistant_events_v1')
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
    when exists(select 1 from turn_data_private.sources_v1() s where s.relation_name=rel) or rel in('turn_private.assistant_messages','turn_private.assistant_goal_trip_links','turn_private.assistant_goal_trip_receipts') then 'CROSS_TURN_REFERENCE'
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
 assistant_delivery_n:=turn_private.assistant_delivery_source_v1(u,g);
 fp:=jsonb_build_object('assistantDelivery',assistant_delivery_n,'graph',g,'rows',to_jsonb(rows_n),'reverse',to_jsonb(reverse_n),'retainedReferences',refs,'sourceAuthorities',auths,'authorityWitness',witness,'conflicts',turn_data_private.conflicts_v1(bad));
 if jsonb_array_length(assistant_delivery_n->'rows')+total_n+jsonb_array_length(witness)+cardinality(trips_n)+cardinality(mems)>4100 or octet_length(fp::text)>1000000 then bad:=array_append(bad,'SCOPE_TOO_LARGE');end if;
 return jsonb_build_object('graph',g,'retainedReferences',refs,'rows',to_jsonb(rows_n),'reverse',to_jsonb(reverse_n),'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',auths,'conflicts',turn_data_private.conflicts_v1(bad),'assistantDelivery',assistant_delivery_n,'sourceDigest',turn_data_private.digest_v1(fp::text));
end$function$
;

-- Exact final1b8 Turn source candidate only: turn_data_private.lock_source_v1(u uuid, src jsonb)
CREATE OR REPLACE FUNCTION turn_data_private.lock_source_v1(u uuid, src jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform turn_private.lock_assistant_delivery_v1(u,src->'graph',src->'assistantDelivery');
end$function$
;

-- Exact final1b8 Turn source candidate only: turn_data_private.erase_source_v1(u uuid, src jsonb)
CREATE OR REPLACE FUNCTION turn_data_private.erase_source_v1(u uuid, src jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare spec record;v jsonb;n integer;ec jsonb:=turn_data_private.zero_counts_v1('erase');rc jsonb:=turn_data_private.zero_counts_v1('redact');t uuid:=(src->'graph'->'turnIds'->>0)::uuid;rel text;remaining integer;keys_n jsonb;
begin
 if turn_data_private.runtime_supported_v1() is not true or turn_data_private.write_hooks_valid_v1() is not true then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
 perform turn_private.retire_assistant_delivery_v1(u,src->'graph',src->'assistantDelivery');
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
end$function$
;

-- Exact final1b8 Turn source candidate only: turn_data_private.write_hooks_valid_v1()
CREATE OR REPLACE FUNCTION turn_data_private.write_hooks_valid_v1()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select not exists(select 1 from unnest(array['turn_private.assistant_events_v1','turn_private.assistant_event_heads_v1','public.chat_turn_events','public.chat_turn_idempotency','public.memory_consumer_receipts','public.model_budget_attempts','public.turn_feedback','turn_private.assistant_message_source_receipts','turn_private.assistant_messages','turn_private.assistant_travel_intakes','turn_private.grounded_ai_assist_jobs','turn_private.grounded_turns','turn_private.planning_action_receipts','turn_private.planning_comparisons','turn_private.planning_intake_bindings','turn_private.planning_model_dispatches','turn_private.planning_observations','turn_private.planning_v2_collector_origins','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_completed_receipts','turn_private.planning_v2_completion_proofs','turn_private.planning_v2_execution_runs','turn_private.planning_v2_external_call_windows','turn_private.planning_v2_model_attempt_bindings','turn_private.planning_v2_model_local_journal','turn_private.planning_v2_place_checkpoints','turn_private.planning_v2_result_claims','turn_private.result_artifacts','turn_private.result_events','turn_private.result_revisions','turn_private.service_task_capacity','turn_private.service_task_turns','turn_private.service_tasks','turn_private.text_content','turn_private.text_dispatches','turn_private.work','public.turns','public.trip_proposals','turn_private.assistant_goal_trip_links','turn_private.assistant_goal_trip_receipts','knowledge_review_private.source_impact_sets','knowledge_review_private.source_impact_items','knowledge_review_private.source_impact_pages','knowledge_review_private.source_impact_outbox','knowledge_review_private.source_impact_projections','knowledge_review_private.source_impact_review_requests','readiness_private.scopes_v1','readiness_private.operations_v1','guide_private.bindings_v1','scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.contexts_v1','scoped_edit_private.operations_v1','notification_private.reminders','notification_private.watches','notification_private.dismissals','service_brief_private.briefs','service_brief_private.previews','service_brief_private.operations']::text[]) rel where not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(rel) and t.tgname='turn_data_parent_fence_v1' and t.tgenabled='O' and t.tgtype=31 and not t.tgisinternal and t.tgfoid=to_regprocedure('turn_data_private.guard_source_v1()')))
$function$
;
