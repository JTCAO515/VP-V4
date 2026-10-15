CREATE OR REPLACE FUNCTION public.submit_service_task_turn(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_task_id uuid, p_scope_version integer, p_relationship text, p_parent_turn_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=turn_private.text_owner(); result jsonb;
  current_policy turn_private.service_task_capacity_settings%rowtype;
  prior_capacity turn_private.service_task_capacity%rowtype;
  task_enforced boolean;
begin
  -- Same lock as grant issuance/revocation, held through task admission and reservation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34));
  result:=turn_private.submit_service_task_turn_unmetered(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,
    p_task_id,p_scope_version,p_relationship,p_parent_turn_id);
  if result->>'reused'='true' then return result; end if;
  select capacity_enforced into task_enforced from turn_private.service_tasks where id=p_task_id;
  select * into prior_capacity from turn_private.service_task_capacity where task_id=p_task_id;
  select * into current_policy from turn_private.service_task_capacity_settings where singleton=true;
  if not found then raise exception 'CAPACITY_POLICY_UNAVAILABLE'; end if;
  if not current_policy.enabled then
    if task_enforced then
      if prior_capacity.task_id is null or prior_capacity.state='released' then raise exception 'CAPACITY_POLICY_UNAVAILABLE'; end if;
      return result||jsonb_build_object('capacityMode','development','capacityState',prior_capacity.state);
    end if;
    return result||jsonb_build_object('capacityMode','record_only');
  end if;
  if current_policy.policy_version<>'service-task-development/1' then raise exception 'CAPACITY_POLICY_UNAVAILABLE'; end if;
  if p_relationship<>'new_goal' and prior_capacity.task_id is null then
    if task_enforced then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT'; end if;
    return result||jsonb_build_object('capacityMode','record_only');
  end if;
  if p_relationship='new_goal' or (p_relationship='repair' and prior_capacity.state='released') then
    perform turn_private.reserve_service_task_capacity(p_task_id,u);
  end if;
  if p_relationship='new_goal' then update turn_private.service_tasks set capacity_enforced=true where id=p_task_id; end if;
  return result||jsonb_build_object('capacityMode','development','capacityState',
    case when prior_capacity.state='settled' then 'settled' else 'reserved' end);
end $function$
