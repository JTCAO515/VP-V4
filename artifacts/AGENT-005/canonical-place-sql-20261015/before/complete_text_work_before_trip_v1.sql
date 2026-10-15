CREATE OR REPLACE FUNCTION public.complete_text_work_before_trip_v1(p_turn_id uuid, p_lease_token uuid, p_kind text, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; task uuid; task_owner uuid; capacity turn_private.service_task_capacity%rowtype; task_enforced boolean;
begin
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode='planning_intake_comparison_v2') then return jsonb_build_object('kind','stale'); end if;
  select l.task_id,l.owner_id into task,task_owner from turn_private.service_task_turns l where l.turn_id=p_turn_id;
  if task is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(task_owner::text,34)); end if;
  result:=turn_private.complete_text_work_unmetered(p_turn_id,p_lease_token,p_kind,p_text);
  if result->>'kind'<>'finished' or task is null then return result; end if;
  select * into capacity from turn_private.service_task_capacity where task_id=task for update;
  if not found then
    select capacity_enforced into task_enforced from turn_private.service_tasks where id=task;
    if task_enforced then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT'; end if;
    return result; -- Existing record-only task.
  end if;
  if capacity.state<>'reserved' then return result; end if;
  if p_kind='answered' then
    -- The result was written and its terminal event committed by the wrapped function.
    -- Check the owner's current readable scope before the same transaction commits.
    if not exists(select 1 from turn_private.text_content c
      join public.turns t on t.id=c.turn_id and t.owner_id=c.owner_id and t.status='completed'
      join public.chat_threads h on h.id=c.thread_id and h.owner_id=c.owner_id and h.status='active'
      join turn_private.text_consents consent on consent.owner_id=c.owner_id and consent.policy_id=c.policy_id
        and consent.consent_id=c.consent_id and consent.revoked_at is null
      where c.turn_id=p_turn_id and c.owner_id=task_owner and c.hidden_at is null
        and c.output_kind='answered' and c.output_text=p_text and turn_private.text_policy_current(c.policy_id))
      then raise exception 'SERVICE_TASK_RESULT_UNREADABLE'; end if;
    if capacity.tier='journey_pass' and not exists(select 1 from public.storekit_grants g
      where g.environment=capacity.grant_environment and g.transaction_id=capacity.grant_transaction_id
        and g.owner_id=task_owner and g.state='active' and g.starts_at<=capacity.admitted_at
        and g.ends_at>pg_catalog.clock_timestamp()) then raise exception 'SERVICE_TASK_GRANT_UNAVAILABLE'; end if;
    update turn_private.service_task_capacity set state='settled',settled_turn_id=p_turn_id,settled_at=pg_catalog.clock_timestamp()
      where task_id=task and state='reserved';
  elsif p_kind in ('partial','blocked','technical_failure') then
    update turn_private.service_task_capacity set state='released',released_at=pg_catalog.clock_timestamp()
      where task_id=task and state='reserved';
  end if;
  return result;
end $function$
