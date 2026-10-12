-- Private candidate only; no service/public RPC grant or retained state.
create function turn_private.journey_idea_result_content_v1(
 p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,
 p_scope uuid,p_attempt uuid,p_output_digest text,p_usage_digest text,p_locale text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;model jsonb;projection jsonb;place jsonb;content jsonb;selection text;
begin
 q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);
 if q is null then return null;end if;
 -- The caller supplies only an expected receipt tuple, never selection authority.
 -- This existing reader requalifies the durable origin, original attempt lease,
 -- execution profile, actual settled usage and current source/work lease.
 model:=public.read_planning_intake_model_output_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_scope,
  (q->'execution'->>'textPolicyId')::uuid,q->'execution'->>'priceVersion');
 if model->>'state' is distinct from 'settled' or model->'binding'->>'attempt' is distinct from p_attempt::text
  or model->'output'->>'outputDigest' is distinct from p_output_digest
  or model->'output'->>'usageDigest' is distinct from p_usage_digest then return null;end if;
 select observation into place from turn_private.planning_v2_place_checkpoints where turn_id=p_turn and state='completed' for share nowait;
 if not found then return null;end if;
 -- Reuse all original factual construction and qualification, including locale,
 -- observation freshness, independent planning purpose and unknown fields.
 projection:=turn_private.project_planning_qualified_comparison_v1(p_owner,p_turn,p_lease,p_intake_digest,p_planning_digest,place,p_locale);
 if projection is null then return null;end if;
 content:=projection->'content';selection:=model->'output'->'output'->>'highlight';
 if selection='peoples_square' then
  content:=jsonb_set(content,'{options}',jsonb_build_array(content->'options'->1,content->'options'->0));
 elsif selection is null or selection not in ('jingan','none') then return null;end if;
 return content;
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.journey_idea_result_content_v1(uuid,uuid,uuid,uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

create or replace function public.complete_planning_intake_comparison_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_action_key text,p_scope uuid,p_attempt uuid,p_output_digest text,p_usage_digest text,p_content jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;model jsonb;digest text;key text;c turn_private.planning_v2_result_claims%rowtype;job turn_private.planning_comparisons%rowtype;place turn_private.planning_v2_place_checkpoints%rowtype;w turn_private.work%rowtype;cap turn_private.service_task_capacity%rowtype;locale text;published jsonb;receipt jsonb;capacity_required boolean;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 model:=public.read_planning_intake_model_output_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_scope,(q->'execution'->>'textPolicyId')::uuid,q->'execution'->>'priceVersion');
 if model->>'state' is distinct from 'settled' or model->'binding'->>'attempt' is distinct from p_attempt::text or model->'output'->>'outputDigest' is distinct from p_output_digest or model->'output'->>'usageDigest' is distinct from p_usage_digest then return jsonb_build_object('kind','blocked');end if;
 select * into place from turn_private.planning_v2_place_checkpoints where turn_id=p_turn for share nowait;
 select m.locale into locale from turn_private.planning_comparisons j join turn_private.assistant_messages m on m.id=j.message_id where j.turn_id=p_turn;
 if not found or place.state<>'completed' or p_content is distinct from turn_private.journey_idea_result_content_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest,p_scope,p_attempt,p_output_digest,p_usage_digest,locale) or p_content is null then return jsonb_build_object('kind','blocked');end if;
 digest:=turn_private.planning_v2_content_digest(p_content);
 key:=encode(sha256(convert_to('['||turn_private.planning_v2_json_string_v1(p_task::text)||','||turn_private.planning_v2_json_string_v1(p_turn::text)||','||turn_private.planning_v2_json_string_v1(p_intake_digest)||','||turn_private.planning_v2_json_string_v1(p_planning_digest)||',"result.prepare",'||turn_private.planning_v2_json_string_v1(digest)||']','UTF8')),'hex');
 select * into c from turn_private.planning_v2_result_claims where execution_id=(q->>'runId')::uuid for update nowait;
 if not found or c.state<>'started' or c.lease_token<>p_lease or c.action_key is distinct from p_action_key or c.action_key is distinct from key or c.content_digest is distinct from digest then return jsonb_build_object('kind','unknown');end if;
 select * into job from turn_private.planning_comparisons where turn_id=p_turn for update nowait;
 select * into w from turn_private.work where turn_id=p_turn for update nowait;
 select * into cap from turn_private.service_task_capacity where task_id=p_task for update nowait;
 if not found then
  select capacity_enforced into capacity_required from turn_private.service_tasks where id=p_task;
  if capacity_required then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 elsif cap.state<>'reserved' then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 if cap.tier='journey_pass' and not exists(select 1 from public.storekit_grants g where g.environment=cap.grant_environment and g.transaction_id=cap.grant_transaction_id and g.owner_id=p_owner and g.state='active' and g.starts_at<=cap.admitted_at and g.ends_at>clock_timestamp() for share) then raise exception 'SERVICE_TASK_GRANT_UNAVAILABLE';end if;
 insert into turn_private.planning_v2_completion_proofs values((q->>'runId')::uuid,pg_current_xact_id(),p_owner,p_task,p_turn,(model->'binding'->>'lease')::uuid,p_lease,p_intake_digest,p_planning_digest,p_action_key,digest,job.artifact_id,p_scope,p_attempt,p_output_digest,p_usage_digest,p_content,clock_timestamp());
 update turn_private.text_content set output_kind='answered',output_text=p_content->>'summary' where turn_id=p_turn and owner_id=p_owner;
 perform turn_private.terminal(p_turn,'completed',w.attempt);
 update turn_private.service_task_capacity set state='settled',settled_turn_id=p_turn,settled_at=clock_timestamp() where task_id=p_task;
 published:=public.publish_comparison_result_v1(p_owner,job.artifact_id,0,job.publication_key,p_task,job.goal_id,job.message_id,null,null,job.goal_version,job.memory_basis,p_content);
 if published->>'kind' is distinct from 'published' or published->'reused' is distinct from 'false'::jsonb then raise exception 'PLANNING_INCOMPLETE';end if;
 update turn_private.planning_v2_result_claims set state='completed' where execution_id=(q->>'runId')::uuid;
 update turn_private.planning_comparisons set state='completed' where turn_id=p_turn;
 receipt:=jsonb_build_object('kind','published','taskId',p_task,'turnId',p_turn,'artifactId',job.artifact_id,'revision',1);
 insert into turn_private.planning_v2_completed_receipts values((q->>'runId')::uuid,p_owner,p_task,p_turn,job.artifact_id,1,receipt);
 return receipt;
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function public.complete_planning_intake_comparison_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

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
