CREATE OR REPLACE FUNCTION public.authorize_planning_dispatch_v1(p_turn_id uuid, p_lease_token uuid, p_context_digest text, p_scope_id uuid, p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ops_decision jsonb; payload jsonb; w turn_private.work%rowtype; c turn_private.text_content%rowtype; j turn_private.planning_comparisons%rowtype;
begin
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode in('planning_intake_comparison_v2','scoped_trip_edit_v1','travel_directions_v1')) then return jsonb_build_object('kind','blocked'); end if;
  if (select auth.role())<>'service_role' or p_context_digest !~ '^[a-f0-9]{64}$'
    or p_scope_id is null or p_attempt_id is null then raise exception 'INVALID_INPUT'; end if;
  payload:=public.read_planning_comparison_work_v1(p_turn_id,p_lease_token);
  if payload->>'kind'<>'planning_input' or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  select * into j from turn_private.planning_comparisons where turn_id=p_turn_id;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  if not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes s on s.id=a.scope_id
    where a.scope_id=p_scope_id and a.attempt_id=p_attempt_id and a.task_id=j.task_id and a.status='dispatched'
      and s.owner_id=w.owner_id and a.provider=payload->>'provider' and s.enabled and not s.frozen and s.expires_at>clock_timestamp())
    then return jsonb_build_object('kind','blocked'); end if;
  ops_decision:=ops_control_private.work_decision_v1(p_turn_id,p_lease_token,'model');if ops_decision->>'kind' is distinct from 'allowed' then if ops_decision ? 'code' then return ops_decision;end if;return jsonb_build_object('kind','blocked');end if;
insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id)
    values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  insert into turn_private.planning_model_dispatches(lease_token,turn_id,owner_id,task_id,scope_id,attempt_id)
    values(p_lease_token,p_turn_id,w.owner_id,j.task_id,p_scope_id,p_attempt_id) on conflict do nothing;
  if not found then raise exception 'DISPATCH_CONFLICT'; end if;
  return jsonb_build_object('kind','authorized');
end $function$
