CREATE OR REPLACE FUNCTION public.pause_planning_intake_work_v1(p_owner uuid, p_task uuid, p_turn uuid, p_lease uuid, p_intake_digest text, p_planning_digest text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ops_decision jsonb; q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null or p_reason not in ('waiting','reconciliation','stale','blocked') or p_reason is null then return jsonb_build_object('kind','blocked');end if;
 ops_decision:=ops_control_private.work_decision_v1(p_turn,p_lease,'model');
 if not(ops_decision ? 'code') then ops_decision:=ops_control_private.work_decision_v1(p_turn,p_lease,'tool');end if;
 if ops_decision->>'code' in('OPS_CONTROL_DISABLED','OPS_SCOPE_UNAVAILABLE') then
 declare ops_attempt record;ops_accounting text:='not_dispatched';ops_task uuid;begin
  ops_task:=p_task;
  for ops_attempt in select a.scope_id,a.attempt_id,a.status from public.model_budget_attempts a
   join public.model_budget_scopes s on s.id=a.scope_id where a.task_id=ops_task and s.owner_id=p_owner
   order by a.scope_id,a.attempt_id loop
   if ops_attempt.status in('dispatched','pending','settled') then ops_accounting:='pending';end if;
   if ops_attempt.status='dispatched' then perform public.finish_model_budget(ops_attempt.scope_id,p_owner,ops_attempt.attempt_id,'pending',null);
   elsif ops_attempt.status='reserved' then perform public.finish_model_budget(ops_attempt.scope_id,p_owner,ops_attempt.attempt_id,'release',null);end if;
  end loop;
  update turn_private.planning_comparisons set state='paused_unknown' where turn_id=p_turn and owner_id=p_owner;
  update turn_private.text_content set output_kind='blocked',output_text=case when locale='zh'
   then '此能力暂时停用，或当前城市范围无法核实。请打开已有行程或已保存成果，按原确认流程手工调整；不会自动重发已发送请求。'
   else 'This capability is paused or the current city scope cannot be qualified. Open an existing Trip or saved result and edit manually through its original confirmation flow. Sent requests will not be retried automatically.' end
   where turn_id=p_turn and owner_id=p_owner and hidden_at is null;
  perform turn_private.terminal(p_turn,'unavailable',(select attempt from turn_private.work where turn_id=p_turn));
  update turn_private.service_task_capacity set state='released',released_at=clock_timestamp() where task_id=ops_task and state='reserved';
  return jsonb_build_object('kind','ops_paused','code',ops_decision->>'code','accounting',ops_accounting,'taskId',p_task,'turnId',p_turn);
 end;end if;
update turn_private.planning_comparisons set state='paused_unknown' where turn_id=p_turn;
 update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=p_turn;
 update turn_private.service_task_capacity set state='released',released_at=clock_timestamp() where task_id=p_task and state='reserved';
 return jsonb_build_object('kind','paused','taskId',p_task,'turnId',p_turn);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $function$
