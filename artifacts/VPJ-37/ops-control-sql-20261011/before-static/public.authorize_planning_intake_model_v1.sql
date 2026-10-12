create function public.authorize_planning_intake_model_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_effect text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;b jsonb;a public.model_budget_attempts%rowtype;
begin
q:=turn_private.planning_v2_exact_model_basis(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 if not exists(select 1 from turn_private.planning_v2_place_checkpoints cp join turn_private.planning_policies pp on pp.id=p_planning_policy where cp.turn_id=p_turn and cp.owner_id=p_owner and cp.task_id=p_task and cp.state='completed' and turn_private.valid_planning_v2_place_v1(cp.observation,pp.environment) is true) then return jsonb_build_object('kind','blocked');end if;
 if p_effect='model_reserve' then
  if exists(select 1 from public.model_budget_attempts where task_id=p_task) then return jsonb_build_object('kind','blocked');end if;
 elsif p_effect='model_dispatch' then
  b:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
  if b->>'ledgerStatus' is distinct from 'reserved' or b->'unknown' is distinct from 'false'::jsonb or exists(select 1 from turn_private.planning_v2_collector_origins where execution_id=(q->>'runId')::uuid) then return jsonb_build_object('kind','blocked');end if;
 else return jsonb_build_object('kind','blocked');end if;
 return jsonb_build_object('schemaVersion','planning-v2-effect-authority/1','kind','authorized','effect',p_effect,'binding',jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest));
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
