CREATE OR REPLACE FUNCTION public.complete_text_work(p_turn_id uuid, p_lease_token uuid, p_kind text, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) then return jsonb_build_object('kind','blocked');end if;
 if exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id where l.turn_id=p_turn_id and s.trip_objective is not null) then raise exception 'SERVICE_TASK_SCOPE_CONFLICT';end if;
 if exists(select 1 from turn_private.service_task_turns where turn_id=p_turn_id) and not turn_private.lock_trip_account_v1((select owner_id from turn_private.service_task_turns where turn_id=p_turn_id)) then return jsonb_build_object('kind','blocked');end if;
 return public.complete_text_work_before_trip_v1(p_turn_id,p_lease_token,p_kind,p_text);
end $function$
;
