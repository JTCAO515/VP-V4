create or replace function turn_private.valid_current_v2_completion_proof(p_turn uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare proof turn_private.planning_v2_completion_proofs%rowtype;r turn_private.planning_v2_execution_runs%rowtype;o turn_private.planning_v2_collector_origins%rowtype;v turn_private.planning_v2_collector_outputs%rowtype;claim turn_private.planning_v2_result_claims%rowtype;
begin
select * into proof from turn_private.planning_v2_completion_proofs where turn_id=p_turn and transaction_id=pg_current_xact_id();if not found then return false;end if;
 select * into r from turn_private.planning_v2_execution_runs where id=proof.execution_id;
 if not found or r.owner_id<>proof.owner_id or r.task_id<>proof.task_id or r.turn_id<>p_turn or r.intake_digest<>proof.intake_digest or r.planning_digest<>proof.planning_digest or not turn_private.planning_v2_completed_current(r.id) then return false;end if;
 select * into o from turn_private.planning_v2_collector_origins where execution_id=r.id;
 select * into v from turn_private.planning_v2_collector_outputs where execution_id=r.id;
 select * into claim from turn_private.planning_v2_result_claims where execution_id=r.id;
 if o.execution_id is null or v.execution_id is null or claim.execution_id is null or o.origin_kind<>r.origin_kind or o.unknown_at is not null or o.response_buffered_at is null or o.binding->>'lease' is distinct from proof.original_lease::text or o.scope_id<>proof.scope_id or o.attempt_id<>proof.attempt_id
 or not exists(select 1 from turn_private.planning_v2_model_attempt_bindings mb where mb.turn_id=p_turn and mb.owner_id=proof.owner_id and mb.task_id=proof.task_id and mb.claim_lease=proof.original_lease and mb.scope_id=proof.scope_id and mb.attempt_id=proof.attempt_id and mb.intake_digest=proof.intake_digest and mb.planning_digest=proof.planning_digest and mb.unknown_at is null)
 or v.output_digest<>proof.output_digest or v.usage_digest<>proof.usage_digest or claim.action_key<>proof.action_key or claim.content_digest<>proof.content_digest or claim.lease_token<>proof.current_lease or claim.state not in ('started','completed')
 or turn_private.planning_v2_content_digest(proof.content) is distinct from proof.content_digest or turn_private.validate_planning_v2_output_v1(v.output_wire,o.binding) is distinct from true
 or not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes sc on sc.id=a.scope_id where a.scope_id=proof.scope_id and a.attempt_id=proof.attempt_id and a.task_id=proof.task_id and sc.owner_id=proof.owner_id and sc.currency='CNY' and a.provider=r.execution->>'provider' and a.model=r.execution->>'model' and a.price_version=r.execution->>'priceVersion' and a.reserved_micros=(r.execution->>'reservedMicros')::bigint and a.status='settled' and a.actual_micros is not null and a.actual_micros=turn_private.planning_v2_usage_cost(v.output_wire,r.execution))
 or not exists(select 1 from turn_private.planning_comparisons where turn_id=p_turn and owner_id=proof.owner_id and task_id=proof.task_id and artifact_id=proof.artifact_id) then return false;end if;
 -- The original transaction proof remains the only terminal/publication gate.
 -- Its immutable collector output also fixes option order, including recovered
 -- original attempts. Caller supplied selection/content digests cannot override it.
 if proof.content->'actions' is distinct from '[]'::jsonb
  or jsonb_array_length(proof.content->'options') is distinct from 2
  or proof.content->'options'->0->>'id' is distinct from
   (case v.output_wire->'output'->>'highlight' when 'peoples_square' then 'peoples_square' when 'jingan' then 'jingan' when 'none' then 'jingan' end)
  or proof.content->'options'->1->>'id' is distinct from
   (case v.output_wire->'output'->>'highlight' when 'peoples_square' then 'jingan' when 'jingan' then 'peoples_square' when 'none' then 'peoples_square' end)
 then return false;end if;
 return true;
exception when lock_not_available then return false;
end $$;
revoke all on function turn_private.valid_current_v2_completion_proof(uuid) from public,anon,authenticated,service_role;
