create function public.planning_intake_budget_v1(p_effect text,p_binding jsonb,p_reserved_micros bigint default null,p_actual_micros bigint default null,p_outcome text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;b jsonb;a public.model_budget_attempts%rowtype;saved turn_private.planning_v2_collector_outputs%rowtype;decision jsonb;
begin
 if turn_private.planning_v2_binding_bytes_v1(p_binding) is null or p_effect not in ('reserve','dispatch','finish') or p_effect is null then return jsonb_build_object('kind','invalid');end if;
 b:=p_binding;
 q:=turn_private.planning_v2_exact_model_basis((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest');
 if q is null then return jsonb_build_object('kind','unavailable');end if;
 if p_effect='reserve' then
  if p_reserved_micros is distinct from (q->'execution'->>'reservedMicros')::bigint or p_actual_micros is not null or p_outcome is not null then return jsonb_build_object('kind','invalid');end if;
  decision:=public.authorize_planning_intake_model_v1((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest','model_reserve');
  if decision->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','unavailable');end if;
  return public.reserve_model_budget((b->>'scope')::uuid,(b->>'owner')::uuid,(b->>'task')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',p_reserved_micros);
 end if;
 if p_reserved_micros is not null then return jsonb_build_object('kind','invalid');end if;
 if p_effect='dispatch' then
  if p_actual_micros is not null or p_outcome is not null then return jsonb_build_object('kind','invalid');end if;
  decision:=public.authorize_planning_intake_model_v1((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest','model_dispatch');
  if decision->>'kind' is distinct from 'authorized' then return jsonb_build_object('kind','unavailable');end if;
  return public.dispatch_model_budget((b->>'scope')::uuid,(b->>'owner')::uuid,(b->>'attempt')::uuid);
 end if;
 select * into a from public.model_budget_attempts where scope_id=(b->>'scope')::uuid and attempt_id=(b->>'attempt')::uuid for share nowait;
 if not found or a.task_id::text<>b->>'task' or a.provider<>b->>'provider' or a.model<>b->>'model' or a.price_version<>b->>'priceVersion' or (select count(*) from public.model_budget_attempts where task_id=(b->>'task')::uuid)<>1 then return jsonb_build_object('kind','unavailable');end if;
 if p_outcome='settle' then
  select * into saved from turn_private.planning_v2_collector_outputs where execution_id=(q->>'runId')::uuid;
  if not found or p_actual_micros is null or p_actual_micros is distinct from turn_private.planning_v2_usage_cost(saved.output_wire,q->'execution') or saved.output_wire->'binding' is distinct from b
  or public.read_planning_intake_model_output_receipt_v1((b->>'owner')::uuid,(b->>'task')::uuid,(b->>'turn')::uuid,(b->>'lease')::uuid,(b->>'textPolicy')::uuid,(b->>'planningPolicy')::uuid,(b->>'scope')::uuid,(b->>'attempt')::uuid,b->>'provider',b->>'model',b->>'priceVersion',b->>'intakeDigest',b->>'planningDigest',saved.output_digest,saved.usage_digest)->>'kind' is distinct from 'output_recorded' then return jsonb_build_object('kind','unavailable');end if;
 elsif p_outcome='pending' then
  if p_actual_micros is not null or a.status not in ('dispatched','pending') then return jsonb_build_object('kind','conflict');end if;
 elsif p_outcome='release' then
  if p_actual_micros is not null or a.status<>'reserved' or exists(select 1 from turn_private.planning_v2_collector_origins where execution_id=(q->>'runId')::uuid) then return jsonb_build_object('kind','conflict');end if;
 else return jsonb_build_object('kind','invalid');end if;
 return public.finish_model_budget((b->>'scope')::uuid,(b->>'owner')::uuid,(b->>'attempt')::uuid,p_outcome,p_actual_micros);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
