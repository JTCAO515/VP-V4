CREATE OR REPLACE FUNCTION turn_data_private.source_v1(u uuid, t uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b jsonb;g jsonb;refs jsonb;bad text[];spec record;v jsonb;pk_n jsonb;ref record;rel text;ex uuid[];parents uuid[];rows_n jsonb[]:=array[]::jsonb[];reverse_n jsonb[]:=array[]::jsonb[];
 impact_n jsonb;auths jsonb:='[]';witness jsonb;erase_n jsonb:=turn_data_private.zero_counts_v1('erase');redact_n jsonb:=turn_data_private.zero_counts_v1('redact');retain_n jsonb:=turn_data_private.zero_counts_v1('retain');total_n integer:=0;n integer;effect_n text;qualified boolean;fp jsonb;assistant_delivery_n jsonb;directions_n jsonb;directions_raw_bytes_n bigint:=0;trips_n uuid[]:=array[]::uuid[];mems uuid[]:=array[]::uuid[];
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
   directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(v::text);
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
   directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(v::text);
   total_n:=total_n+1;reverse_n:=array_append(reverse_n,jsonb_build_object('table',rel,'pk',jsonb_build_object('id',v->'id'),'digest',turn_data_private.digest_v1(v::text)));
  end loop;
 end loop;
 retain_n:=retain_n||jsonb_build_object('threads',jsonb_array_length(refs->'threadIds'),'conversations',jsonb_array_length(refs->'conversationIds'),'goals',jsonb_array_length(refs->'goalIds'));
 for v in select to_jsonb(w) from turn_private.assistant_messages w join turn_private.assistant_goals goal on goal.id=w.goal_id and goal.conversation_id=w.conversation_id and goal.owner_id=w.owner_id and goal.scope_version=w.scope_version where goal.id=any(privacy_private.linked_delete_array_v1(refs->'goalIds')) and w.owner_id=u and w.relationship in('goal_start','amendment') order by w.id loop
  directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(v::text);
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
   and n.nspname||'.'||c.relname not in ('turn_private.assistant_event_heads_v1','turn_private.assistant_events_v1','turn_private.assistant_directions_intakes_v1','turn_private.directions_result_sources_v1','turn_private.directions_operations_v1')
    and (a.atttypid in('json'::regtype,'jsonb'::regtype) or turn_data_private.reference_kind_v1(a.attname::text) is not null) order by 1 loop
  for v in execute format('select to_jsonb(a) from %s a where exists(select 1 from turn_data_private.json_references_v1(conversation_data_private.documents_v1(%L,to_jsonb(a))) r where $1->r.kind ? r.entity_id::text) order by to_jsonb(a)::text collate "C" limit 4101',rel,rel) using g loop
   if exists(select 1 from unnest(rows_n) r where r->>'table'=rel and r->'digest'=to_jsonb(turn_data_private.digest_v1(v::text))) then continue;end if;
   -- Retained task/identity source and own authority diagnostics do not become parent sweeps.
   directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(v::text);
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
   directions_raw_bytes_n:=directions_raw_bytes_n+octet_length(v::text);
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
 directions_n:=turn_private.directions_source_witness_v1(u,'turn',g);
 fp:=jsonb_build_object('directionsSource',directions_n,'assistantDelivery',assistant_delivery_n,'graph',g,'rows',to_jsonb(rows_n),'reverse',to_jsonb(reverse_n),'retainedReferences',refs,'sourceAuthorities',auths,'authorityWitness',witness,'conflicts',turn_data_private.conflicts_v1(bad));
 if (directions_n->>'rowCount')::integer+jsonb_array_length(assistant_delivery_n->'rows')+total_n+jsonb_array_length(witness)+cardinality(trips_n)+cardinality(mems)>4100 or directions_raw_bytes_n+(directions_n->>'bytes')::bigint>1000000 or octet_length(fp::text)>1000000 then bad:=array_append(bad,'SCOPE_TOO_LARGE');end if;
 return jsonb_build_object('graph',g,'retainedReferences',refs,'rows',to_jsonb(rows_n),'reverse',to_jsonb(reverse_n),'eraseCounts',erase_n,'redactCounts',redact_n,'retainCounts',retain_n,'sourceAuthorities',auths,'conflicts',turn_data_private.conflicts_v1(bad),'directionsSource',directions_n,'assistantDelivery',assistant_delivery_n,'sourceDigest',turn_data_private.digest_v1(fp::text));
end$function$
