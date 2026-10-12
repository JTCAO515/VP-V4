create function public.claim_planning_intake_work_v1(p_owner_id uuid,p_planning_policy_id uuid,p_execution_profile_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p turn_private.planning_v2_execution_profiles%rowtype;principal turn_private.planning_v2_collector_principals%rowtype;tar turn_private.planning_v2_registered_tariffs%rowtype;c record;w turn_private.work%rowtype;q jsonb;e jsonb;source jsonb;r turn_private.planning_v2_execution_runs%rowtype;execution_id uuid;origin text;task_row turn_private.service_tasks%rowtype;
begin
origin:=turn_private.planning_v2_collector_principal(p_execution_profile_id);if origin is null then return jsonb_build_object('kind','blocked');end if;
 select * into p from turn_private.planning_v2_execution_profiles where id=p_execution_profile_id;
 if p.owner_id<>p_owner_id or p.planning_policy_id<>p_planning_policy_id then return jsonb_build_object('kind','blocked');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,34));
 perform 1 from auth.users where id=p_owner_id for key share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 perform 1 from identity_private.mobile_accounts where owner_id=p_owner_id for update;if not found then return jsonb_build_object('kind','blocked');end if;
 for c in select j.task_id,j.turn_id,j.artifact_id,j.memory_basis,m.locale from turn_private.planning_comparisons j join turn_private.work candidate_work on candidate_work.turn_id=j.turn_id join turn_private.assistant_messages m on m.id=j.message_id
 where j.owner_id=p_owner_id and j.planning_policy_id=p_planning_policy_id and j.state='queued' and candidate_work.execution_mode='planning_intake_comparison_v2' and (candidate_work.state='queued' or candidate_work.state='leased' and candidate_work.expires_at<=clock_timestamp()) order by candidate_work.created_at,candidate_work.turn_id limit 100 loop
  select * into task_row from turn_private.service_tasks where id=c.task_id and owner_id=p_owner_id and policy_id=p.text_policy_id for update nowait;if not found then continue;end if;
  if task_row.budget_scope_id is not null and task_row.budget_scope_id is distinct from p.scope_id then return jsonb_build_object('kind','blocked');end if;
  if task_row.budget_scope_id is null and (exists(select 1 from public.model_budget_attempts where task_id=c.task_id) or exists(select 1 from turn_private.planning_v2_execution_runs where task_id=c.task_id)) then return jsonb_build_object('kind','blocked');end if;
  select * into w from turn_private.work where turn_id=c.turn_id;
  if not turn_private.lock_turn(c.turn_id,p_owner_id,w.session_id) then return jsonb_build_object('kind','blocked');end if;
  select * into w from turn_private.work where turn_id=c.turn_id for update nowait;
  if w.attempt>=w.max_attempts then return jsonb_build_object('kind','blocked');end if;
  select * into r from turn_private.planning_v2_execution_runs where turn_id=c.turn_id;
  if found then
   if r.profile_id<>p.id or r.profile_revision<>p.revision or (exists(select 1 from public.model_budget_attempts where task_id=c.task_id) and not exists(select 1 from turn_private.planning_v2_collector_outputs o join turn_private.planning_v2_collector_origins x on x.execution_id=o.execution_id join public.model_budget_attempts a on a.scope_id=x.scope_id and a.attempt_id=x.attempt_id where o.execution_id=r.id and a.status='settled' and a.actual_micros is not null and a.actual_micros=(o.usage_wire->>'actualMicros')::bigint)) or (not exists(select 1 from public.model_budget_attempts where task_id=c.task_id) and not exists(select 1 from turn_private.planning_v2_place_checkpoints cp where cp.turn_id=c.turn_id and cp.state='completed' and turn_private.valid_planning_v2_place_v1(cp.observation,p.environment) is true)) then return jsonb_build_object('kind','unknown_effect');end if;
  elsif exists(select 1 from public.model_budget_attempts where task_id=c.task_id) then return jsonb_build_object('kind','unknown_effect');end if;
  update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+least(w.lease_ms,120000)*interval '1 millisecond' where turn_id=c.turn_id returning * into w;
  q:=turn_private.read_planning_qualified_intake_v1(p_owner_id,c.turn_id,w.lease_token);
  if q->>'kind' is distinct from 'planning_intake_input' then raise exception 'STALE_BASIS';end if;
  perform 1 from public.model_budget_scopes where id=p.scope_id for share nowait;
  perform 1 from public.model_budget_provider_limits where scope_id=p.scope_id and provider='qwen' for share nowait;
  select * into tar from turn_private.planning_v2_registered_tariffs where id=p.tariff_id for share nowait;
  if not found or not tar.enabled or tar.valid_until<=clock_timestamp() or not exists(select 1 from public.model_budget_scopes s join public.model_budget_provider_limits l on l.scope_id=s.id where s.id=p.scope_id and s.owner_id=p_owner_id and s.currency='CNY' and s.enabled and not s.frozen and s.expires_at>clock_timestamp() and l.provider='qwen' and l.model=tar.model and l.price_version=tar.price_version and l.enabled) or p.reserved_micros<ceil((1048576::numeric*greatest(tar.input_rate,coalesce(tar.cached_input_rate,0))+p.max_output_tokens::numeric*tar.output_rate)/1000000) then raise exception 'EXECUTION_PROFILE_CONFLICT';end if;
  if task_row.budget_scope_id is null then update turn_private.service_tasks set budget_scope_id=p.scope_id where id=c.task_id and budget_scope_id is null;if not found then raise exception 'EXECUTION_PROFILE_CONFLICT';end if;end if;
  execution_id:=coalesce(r.id,gen_random_uuid());
  e:=jsonb_build_object('schemaVersion','planning-v2-execution/1','executionId',execution_id,'profileId',p.id,'profileRevision',p.revision,'textPolicyId',p.text_policy_id,'scopeId',p.scope_id,'provider','qwen','model',tar.model,'providerConfigurationId',p.provider_configuration_id,'providerConfigurationVersion',p.provider_configuration_version,'endpoint',p.endpoint,'priceVersion',tar.price_version,'reservedMicros',p.reserved_micros,'timeoutMs',p.timeout_ms,'maxOutputTokens',p.max_output_tokens,'inputMicrosPerMillion',tar.input_rate,'cachedInputMicrosPerMillion',tar.cached_input_rate,'outputMicrosPerMillion',tar.output_rate,'maxMapCalls',13,'maxSteps',4,'maxRetries',0,'deadlineMs',120000);
  source:=(q->'qualifiedIntake')-array['version','kind','schemaVersion','sourceKind','intake','contextDigest','readiness','readyForProvider'];
  if r.id is null then
    insert into turn_private.planning_v2_execution_runs(id,profile_id,profile_revision,owner_id,task_id,turn_id,original_lease,source,intake_digest,planning_digest,collector_principal_id,origin_kind,execution,profile_snapshot) values(execution_id,p.id,p.revision,p_owner_id,c.task_id,c.turn_id,w.lease_token,source,q->>'intakeContextDigest',q->>'planningContextDigest',p.collector_principal_id,origin,e,to_jsonb(p));
  else
    if r.execution is distinct from e or r.intake_digest<>q->>'intakeContextDigest' or r.planning_digest<>q->>'planningContextDigest' then raise exception 'STALE_BASIS';end if;
  end if;
  return jsonb_build_object('kind','leased','lease',jsonb_build_object('ownerId',p_owner_id,'taskId',c.task_id,'turnId',c.turn_id,'leaseToken',w.lease_token,'artifactId',c.artifact_id,'planningPolicyId',p.planning_policy_id,'intakeContextDigest',q->>'intakeContextDigest','planningContextDigest',q->>'planningContextDigest','source',source,'environment',p.environment,'locale',c.locale),'execution',e);
 end loop;
 return jsonb_build_object('kind','idle');
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
