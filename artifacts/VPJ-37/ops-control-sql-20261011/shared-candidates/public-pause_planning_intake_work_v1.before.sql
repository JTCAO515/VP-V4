CREATE OR REPLACE FUNCTION public.pause_planning_intake_work_v1(p_owner uuid, p_task uuid, p_turn uuid, p_lease uuid, p_intake_digest text, p_planning_digest text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null or p_reason not in ('waiting','reconciliation','stale','blocked') or p_reason is null then return jsonb_build_object('kind','blocked');end if;
 update turn_private.planning_comparisons set state='paused_unknown' where turn_id=p_turn;
 update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=p_turn;
 update turn_private.service_task_capacity set state='released',released_at=clock_timestamp() where task_id=p_task and state='reserved';
 return jsonb_build_object('kind','paused','taskId',p_task,'turnId',p_turn);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $function$
