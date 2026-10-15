-- Authored Trip-only privacy projection. Original v1 registries/DTOs stay separate.
create function turn_private.trip_privacy_ids_v1(g jsonb,refs jsonb default '{}'::jsonb) returns uuid[] language sql stable set search_path='' as $$
 select privacy_private.linked_delete_array_v1(coalesce(g->'taskIds',refs->'taskIds','[]'::jsonb))
$$;
create function turn_private.trip_privacy_context_ids_v1(g jsonb) returns uuid[] language sql stable set search_path='' as $$
 select coalesce(array_agg(distinct context_id),array[]::uuid[]) from scoped_edit_private.work_v1 where turn_id=any(privacy_private.linked_delete_array_v1(g->'turnIds')) and task_id=any(privacy_private.linked_delete_array_v1(g->'tripTaskIds'))
$$;
create function turn_private.trip_privacy_related_v1(rel text,v jsonb,g jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare contexts uuid[]:=turn_private.trip_privacy_context_ids_v1(g);turns uuid[]:=privacy_private.linked_delete_array_v1(g->'turnIds');begin
 if rel='scoped_edit_private.work_v1' then return (v->>'turn_id')::uuid=any(turns) and (v->>'task_id')::uuid=any(privacy_private.linked_delete_array_v1(g->'tripTaskIds'));
 elsif rel='scoped_edit_private.requests_v1' then return exists(select 1 from scoped_edit_private.work_v1 j where j.turn_id=(v->>'turn_id')::uuid and j.turn_id=any(turns) and j.context_id=any(contexts));
 elsif rel='scoped_edit_private.contexts_v1' then return (v->>'id')::uuid=any(contexts);
 elsif rel='scoped_edit_private.operations_v1' then return exists(select 1 from scoped_edit_private.work_v1 j where j.turn_id=any(turns) and j.task_id=any(privacy_private.linked_delete_array_v1(g->'tripTaskIds')) and j.context_id=any(contexts) and j.owner_id=(v->>'owner_id')::uuid and j.operation_id=(v->>'operation_id')::uuid)
 or exists(select 1 from scoped_edit_private.lineage_v1 l where l.context_id=any(contexts) and l.owner_id=(v->>'owner_id')::uuid and l.operation_id=(v->>'operation_id')::uuid and exists(select 1 from turn_private.service_tasks t where t.id=any(privacy_private.linked_delete_array_v1(g->'tripTaskIds')) and t.trip_objective->>'proposalId'=l.proposal_id::text));
 elsif rel='scoped_edit_private.lineage_v1' then return (v->>'context_id')::uuid=any(contexts) and exists(select 1 from turn_private.service_tasks t where t.id=any(privacy_private.linked_delete_array_v1(g->'tripTaskIds')) and t.owner_id=(v->>'owner_id')::uuid and t.trip_objective->>'proposalId'=v->>'proposal_id');
 end if;return false;
end $$;
create function turn_private.trip_privacy_graph_v1(u uuid,g jsonb,refs jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tasks uuid[]:=turn_private.trip_privacy_ids_v1(g,refs);trips uuid[];context uuid;v jsonb;s turn_private.service_tasks%rowtype;
begin
 if cardinality(tasks)=0 then raise exception 'TRIP_PRIVACY_SCOPE_UNSUPPORTED';end if;
 foreach context in array tasks loop
 select * into s from turn_private.service_tasks where id=context and owner_id=u and expected_result='trip_modification' and trip_objective is not null;
 if not found then raise exception 'TRIP_PRIVACY_SCOPE_UNSUPPORTED';end if;
 end loop;
 select coalesce(array_agg(distinct h.trip_id) filter(where h.trip_id is not null),array[]::uuid[]) into trips from turn_private.service_tasks t join public.chat_threads h on h.id=t.thread_id and h.owner_id=u where t.id=any(tasks);
 return g||jsonb_build_object('tripTaskIds',tasks,'tripPrivacyTripIds',trips);
end $$;
create function turn_private.trip_privacy_exclusive_v1(u uuid,g jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare context uuid;v jsonb;turns uuid[]:=privacy_private.linked_delete_array_v1(g->'turnIds');contexts uuid[]:=turn_private.trip_privacy_context_ids_v1(g);begin
 foreach context in array contexts loop
 if not exists(select 1 from scoped_edit_private.contexts_v1 where id=context and owner_id=u) or exists(select 1 from scoped_edit_private.work_v1 where context_id=context and(not turn_id=any(turns) or owner_id<>u or not task_id=any(privacy_private.linked_delete_array_v1(g->'tripTaskIds')))) then return false;end if;
 for v in select to_jsonb(o) from scoped_edit_private.operations_v1 o where o.context_id=context loop if not turn_private.trip_privacy_related_v1('scoped_edit_private.operations_v1',v,g) then return false;end if;end loop;
 for v in select to_jsonb(l) from scoped_edit_private.lineage_v1 l where l.context_id=context loop if not turn_private.trip_privacy_related_v1('scoped_edit_private.lineage_v1',v,g) then return false;end if;end loop;
 if exists(select 1 from scoped_edit_private.proofs_v1 where context_id=context) then return false;end if;
 end loop;return true;
end $$;
create function turn_private.trip_privacy_c_related_v1(rel text,v jsonb,g jsonb,ex uuid[]) returns boolean language sql stable set search_path='' as $$
 select case when rel in('scoped_edit_private.contexts_v1','scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.operations_v1','scoped_edit_private.lineage_v1') then turn_private.trip_privacy_related_v1(rel,v,g) else conversation_data_private.related_v1(rel,case when rel='turn_private.service_tasks' then v-'trip_objective' else v end,g,ex) end
$$;
create function turn_private.trip_privacy_t_related_v1(rel text,v jsonb,g jsonb,refs jsonb,ex uuid[],u uuid) returns boolean language sql stable set search_path='' as $$
 select case when rel in('scoped_edit_private.contexts_v1','scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.operations_v1','scoped_edit_private.lineage_v1') then turn_private.trip_privacy_related_v1(rel,v,g) else turn_data_private.related_v1(rel,v,g,refs,ex,u) end
$$;
create function turn_private.trip_privacy_documents_v1(rel text,v jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when rel='turn_private.service_tasks' then v-'trip_objective' else conversation_data_private.documents_v1(rel,v) end
$$;
create function turn_private.trip_privacy_erase_order_v1() returns text[] language sql immutable set search_path='' as $$
 select array['scoped_edit_private.requests_v1','scoped_edit_private.work_v1','scoped_edit_private.lineage_v1','scoped_edit_private.operations_v1','scoped_edit_private.contexts_v1']::text[]||conversation_data_private.erase_order_v1()
$$;
create function turn_private.trip_privacy_assert_redacted_v1(u uuid,g jsonb) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if not turn_private.trip_privacy_exclusive_v1(u,g) or not (exists(select 1 from conversation_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id() and owner_id=u and graph=g and expires_at>floor(extract(epoch from clock_timestamp())*1000)) or exists(select 1 from turn_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id() and owner_id=u and graph=g and expires_at>floor(extract(epoch from clock_timestamp())*1000))) then raise exception 'TRIP_PRIVACY_AUTHORITY_REQUIRED';end if;
end $$;

create function turn_private.trip_privacy_c_boundaries_v1(scope_n text) returns jsonb language sql immutable set search_path='' as $$
 select conversation_data_private.boundaries_v1(scope_n)||jsonb_build_object('eraseFields',conversation_data_private.boundaries_v1(scope_n)->'eraseFields'||'["exclusive_trip_contexts_work_requests_operations_lineage"]'::jsonb,'redactFields',conversation_data_private.boundaries_v1(scope_n)->'redactFields'||'["trip_objective_scope_request_and_producer_references"]'::jsonb,'retained',conversation_data_private.boundaries_v1(scope_n)->'retained'||'["inert_trip_goal_and_proposal_fences"]'::jsonb)
$$;
create function turn_private.trip_privacy_t_boundaries_v1(scope_n text) returns jsonb language sql immutable set search_path='' as $$
 select turn_data_private.boundaries_v1(scope_n)||jsonb_build_object('eraseFields',turn_data_private.boundaries_v1(scope_n)->'eraseFields'||'["exclusive_trip_contexts_work_requests_operations_lineage"]'::jsonb,'redactFields',turn_data_private.boundaries_v1(scope_n)->'redactFields'||'["trip_objective_scope_request_and_producer_references"]'::jsonb,'retained',turn_data_private.boundaries_v1(scope_n)->'retained'||'["inert_trip_goal_and_proposal_fences"]'::jsonb)
$$;
create function turn_private.trip_privacy_export_predicate_v1(rel text) returns text language sql immutable set search_path='' as $$
 select case when rel='scoped_edit_private.work_v1' then 'a.turn_id=any($1) and a.task_id=any($4) and exists(select 1 from turn_private.service_tasks t where t.id=a.task_id and t.owner_id=$6 and t.expected_result=''trip_modification'')'
 when rel='scoped_edit_private.requests_v1' then 'exists(select 1 from scoped_edit_private.work_v1 j join turn_private.service_tasks t on t.id=j.task_id where j.turn_id=a.turn_id and j.turn_id=any($1) and t.id=any($4) and t.owner_id=$6 and t.expected_result=''trip_modification'')'
 when rel='scoped_edit_private.contexts_v1' then 'exists(select 1 from scoped_edit_private.work_v1 j join turn_private.service_tasks t on t.id=j.task_id where j.context_id=a.id and j.turn_id=any($1) and t.id=any($4) and t.owner_id=$6 and t.expected_result=''trip_modification'')'
 when rel in('scoped_edit_private.operations_v1','scoped_edit_private.lineage_v1') then 'exists(select 1 from scoped_edit_private.work_v1 j join turn_private.service_tasks t on t.id=j.task_id where j.context_id=a.context_id and j.turn_id=any($1) and t.id=any($4) and t.owner_id=$6 and t.expected_result=''trip_modification'')'
 else turn_data_private.export_predicate_v1(rel) end
$$;
create function turn_private.trip_privacy_goal_writer_v1(goal uuid,u uuid,current_version integer,body text) returns boolean language sql stable security definer set search_path='' as $$
 select current_version between 1 and 10000 and exists(
 select 1 from turn_private.assistant_goals g join turn_private.assistant_messages w on w.goal_id=g.id and w.owner_id=u and w.conversation_id=g.conversation_id and w.relationship in('goal_start','amendment')
 where g.id=goal and g.owner_id=u and g.scope_version=current_version and w.scope_version<=current_version and w.input_text=body
 and not exists(select 1 from turn_private.assistant_messages newer where newer.goal_id=g.id and newer.owner_id=u and newer.relationship in('goal_start','amendment') and newer.scope_version>w.scope_version)
 and not exists(select 1 from generate_series(w.scope_version+1,current_version) v where (select count(*) from turn_private.assistant_goal_trip_receipts r where r.goal_id=g.id and r.owner_id=u and r.conversation_id=g.conversation_id and r.source_kind='native_user_confirmed' and r.before_goal_scope_version=v-1 and r.after_goal_scope_version=v)<>1))
$$;
create function turn_private.trip_privacy_require_erased_v1(u uuid,g jsonb) returns void language plpgsql stable security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype;source_task_id uuid;begin
 foreach source_task_id in array privacy_private.linked_delete_array_v1(g->'tripTaskIds') loop
 select * into s from turn_private.service_tasks where service_tasks.id=source_task_id and owner_id=u and expected_result='trip_modification';
 if not found or s.trip_objective->>'schemaVersion' is distinct from 'trip-service-task-erased/1' or s.trip_objective->>'outcome' is distinct from 'erased'
 or not recovery_private.exact_v1(s.trip_objective,array['schemaVersion','outcome','goalId']||case when s.trip_objective ? 'proposalId' then array['proposalId'] else array[]::text[] end)
 or not recovery_private.uuid_v1(s.trip_objective->'goalId') or s.trip_objective ? 'proposalId' and not recovery_private.uuid_v1(s.trip_objective->'proposalId') then raise exception 'TRIP_OBJECTIVE_ERASURE_INCOMPLETE';end if;
 end loop;
end $$;
