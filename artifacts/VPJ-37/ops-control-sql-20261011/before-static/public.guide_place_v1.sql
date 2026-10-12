create function public.guide_place_v1(p_trip uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=place_actions_private.actor_v1();ref uuid;t public.trips%rowtype;pr public.trip_place_references%rowtype;a text:=p_input->>'action';v jsonb;ids jsonb;records jsonb;bindings jsonb;b guide_private.bindings_v1%rowtype;submitted jsonb;city text;h text;
begin
 if p_trip is null or guide_private.valid_command_v1(p_input) is distinct from true then raise exception 'INVALID_INPUT';end if;ref:=(p_input->>'placeReferenceId')::uuid;
 select * into t from public.trips where id=p_trip and owner_id=u for share nowait;if not found then raise exception 'FORBIDDEN';end if;
 select * into pr from public.trip_place_references where id=ref and trip_id=p_trip and owner_id=u for share nowait;if not found then raise exception 'FORBIDDEN';end if;
 -- Cleanup is exact owner/object scoped even when the head/source/rights is stale.
 if a='forget' then
  delete from guide_private.progress_v1 where owner_id=u and reference_id=ref and locale=p_input->>'locale' and interest=p_input->>'interest';
  update guide_private.bindings_v1 set invalidated=true,completed_ids='[]' where owner_id=u and reference_id=ref and locale=p_input->>'locale' and interest=p_input->>'interest';
  return jsonb_build_object('kind','forgotten','operationId',p_input->'operationId');end if;
 if a<>'export' and (p_input->>'expectedTripVersion')::numeric>2147483647 then return guide_private.unavailable('source_changed');end if;
 v:=guide_private.projection_v1(u,p_trip,ref,case when a='export' then t.head_version else (p_input->>'expectedTripVersion')::numeric::integer end,p_input->>'locale',p_input->>'interest');
 delete from guide_private.progress_v1 where owner_id=u and reference_id=ref and locale=p_input->>'locale' and interest=p_input->>'interest' and (v->>'kind'<>'ready' or digest is distinct from v->>'digest' or expires_at<=clock_timestamp() or v->'rights'->>'cache'<>'true');
 if a='export' then
  update guide_private.bindings_v1 set invalidated=true,completed_ids='[]' where owner_id=u and reference_id=ref and expires_at<=clock_timestamp();
  update guide_private.bindings_v1 set completed_ids='[]' where owner_id=u and reference_id=ref and position_expires_at<=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('turnId',x.turn_id,'serviceTaskId',x.task_id,'operationId',x.operation_id,'canonicalPoiId',x.canonical_poi_id,'locale',x.locale,'interest',x.interest,'digest',x.digest,'rightsRevision',x.rights_revision,'expiresAt',guide_private.instant(x.expires_at),'tripVersion',x.trip_version,'invalidated',x.invalidated) order by x.turn_id),'[]') into bindings from(select * from guide_private.bindings_v1 where owner_id=u and reference_id=ref and trip_id=p_trip and locale=p_input->>'locale' and interest=p_input->>'interest' order by turn_id limit 101)x;
  if jsonb_array_length(bindings)>100 then return guide_private.unavailable('capacity');end if;
  select coalesce(jsonb_agg(jsonb_build_object('digest',p.digest,'canonicalPoiId',p.canonical_poi_id,'locale',p.locale,'interest',p.interest,'rightsRevision',p.rights_revision,'completedSegmentIds',p.completed_ids,'expiresAt',guide_private.instant(p.expires_at),'updatedAt',guide_private.instant(p.updated_at))),'[]') into records from guide_private.progress_v1 p where p.owner_id=u and p.reference_id=ref and p.locale=p_input->>'locale' and p.interest=p_input->>'interest' and p.session_id=(auth.jwt()->>'session_id')::uuid;
  return jsonb_build_object('kind','export','version',1,'tripId',p_trip,'placeReferenceId',ref,'records',records,'scope','guide_selection_metadata','coverage','complete_for_selection','bindings',bindings);end if;
 if v->>'kind'<>'ready' then return v;end if;
 if a in('replay','progress','follow_up') and v->>'digest' is distinct from p_input->>'expectedDigest' then return guide_private.unavailable('source_changed');end if;
 if a='progress' then
  if v->'rights'->>'cache'<>'true' then return guide_private.unavailable('rights_unavailable');end if;
  ids:=p_input->'completedSegmentIds';if exists(select 1 from jsonb_array_elements(ids)x where not exists(select 1 from jsonb_array_elements(v->'segments')s where s->'id'=x)) then raise exception 'INVALID_INPUT';end if;
  insert into guide_private.progress_v1(owner_id,session_id,trip_id,reference_id,canonical_poi_id,locale,interest,digest,rights_revision,completed_ids,expires_at)
   values(u,(auth.jwt()->>'session_id')::uuid,p_trip,ref,pr.canonical_poi_id,p_input->>'locale',p_input->>'interest',v->>'digest',(v->'rights'->>'revision')::bigint,ids,(v->>'expiresAt')::timestamptz)
   on conflict(owner_id,reference_id,locale,interest) do update set session_id=excluded.session_id,digest=excluded.digest,rights_revision=excluded.rights_revision,completed_ids=excluded.completed_ids,expires_at=excluded.expires_at,updated_at=clock_timestamp();
  return jsonb_set(v,'{completedSegmentIds}',ids);end if;
 if a<>'follow_up' then return v;end if;
 if v->'rights'->>'prompt'<>'true' then return guide_private.unavailable('rights_unavailable');end if;
 if exists(select 1 from jsonb_array_elements(p_input->'completedSegmentIds')x where not exists(select 1 from jsonb_array_elements(v->'segments')seg where seg->'id'=x)) then raise exception 'INVALID_INPUT';end if;
 perform 1 from public.chat_threads where id=(p_input->>'threadId')::uuid for update nowait;
 if found then if not exists(select 1 from public.chat_threads where id=(p_input->>'threadId')::uuid and owner_id=u and trip_id is null and status='active') then raise exception 'FORBIDDEN';end if;
 elsif p_input->'serviceTask'->>'relationship'<>'new_goal' then raise exception 'SERVICE_TASK_CONFLICT';end if;
 h:=guide_private.hash(p_input);select * into b from guide_private.bindings_v1 where owner_id=u and operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found then if b.command_digest<>h or b.turn_id<>(p_input->>'turnId')::uuid or b.invalidated or b.digest<>v->>'digest' then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;else
 if p_input->'serviceTask'->>'relationship'<>'new_goal' and not exists(select 1 from guide_private.bindings_v1 parent join turn_private.service_task_turns st on st.turn_id=parent.turn_id where parent.turn_id=(p_input->'serviceTask'->>'parentTurnId')::uuid and parent.owner_id=u and parent.trip_id=p_trip and parent.thread_id=(p_input->>'threadId')::uuid and parent.task_id=(p_input->'serviceTask'->>'id')::uuid and parent.reference_id=ref and parent.locale=p_input->>'locale' and parent.interest=p_input->>'interest' and parent.digest=v->>'digest' and parent.session_id=(auth.jwt()->>'session_id')::uuid and not parent.invalidated) then raise exception 'SERVICE_TASK_CONFLICT';end if;
 insert into guide_private.bindings_v1(turn_id,owner_id,session_id,trip_id,reference_id,trip_version,locale,interest,digest,operation_id,command_digest,thread_id,task_id,parent_turn_id,completed_ids,canonical_poi_id,rights_revision,expires_at,position_expires_at)
 values((p_input->>'turnId')::uuid,u,(auth.jwt()->>'session_id')::uuid,p_trip,ref,t.head_version,p_input->>'locale',p_input->>'interest',v->>'digest',(p_input->>'operationId')::uuid,h,(p_input->>'threadId')::uuid,(p_input->'serviceTask'->>'id')::uuid,(p_input->'serviceTask'->>'parentTurnId')::uuid,p_input->'completedSegmentIds',(v->>'canonicalPoiId')::uuid,(v->'rights'->>'revision')::bigint,(v->>'expiresAt')::timestamptz,least((v->>'expiresAt')::timestamptz,clock_timestamp()+interval '120 seconds'));end if;
 select m.basis_metadata->>'city' into city from trip_support_private.entity_mappings m where m.canonical_poi_id=pr.canonical_poi_id and m.statement_id=(v->'segments'->0->>'assertionId')::uuid and m.status='approved' and m.basis_metadata->>'locale'=p_input->>'locale' order by m.id limit 1;
 submitted:=public.submit_grounded_turn((p_input->>'threadId')::uuid,(p_input->>'turnId')::uuid,(p_input->>'operationId')::uuid,(p_input->>'policyId')::uuid,p_input->>'locale',p_input->>'question',(p_input->'serviceTask'->>'id')::uuid,1,p_input->'serviceTask'->>'relationship',(p_input->'serviceTask'->>'parentTurnId')::uuid,city);
 update guide_private.bindings_v1 bind set position_expires_at=least(bind.position_expires_at,(select expires_at from turn_private.work where turn_id=bind.turn_id)) where bind.turn_id=(p_input->>'turnId')::uuid;
 if submitted->>'kind'<>'accepted' or guide_private.bound_v1((p_input->>'turnId')::uuid,null) is null then raise exception 'DATA_POLICY_BLOCKED';end if;
 return jsonb_build_object('kind','submitted','version',1,'operationId',p_input->'operationId','tripId',p_trip,'turnId',p_input->'turnId','serviceTaskId',p_input->'serviceTask'->'id','scopeVersion',1,'relationship',p_input->'serviceTask'->'relationship','parentTurnId',p_input->'serviceTask'->'parentTurnId','guideDigest',v->>'digest','reused',submitted->'reused','generationCost',null);
end$$;
