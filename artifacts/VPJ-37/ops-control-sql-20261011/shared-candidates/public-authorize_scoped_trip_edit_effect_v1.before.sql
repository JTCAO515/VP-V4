CREATE OR REPLACE FUNCTION public.authorize_scoped_trip_edit_effect_v1(p_binding jsonb, p_effect text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare a public.model_budget_attempts%rowtype;begin
 if p_effect not in('reserve','dispatch','publish') or not scoped_edit_private.work_current_v1(p_binding) then return jsonb_build_object('kind','pending');end if;
 select * into a from public.model_budget_attempts where scope_id=(p_binding->>'scopeId')::uuid and attempt_id=(p_binding->>'attemptId')::uuid;
 if found and (a.task_id<>(p_binding->>'taskId')::uuid or a.provider<>p_binding->>'provider' or a.model<>p_binding->>'model' or a.price_version<>p_binding->>'priceVersion') then return jsonb_build_object('kind','pending');end if;
 if p_effect='reserve' and a.status is not null and a.status<>'reserved' or p_effect='dispatch' and coalesce(a.status,'') not in('reserved','dispatched') or p_effect='publish' and (a.status is distinct from 'settled' or not exists(select 1 from scoped_edit_private.work_v1 where binding=p_binding and output is not null and actual_micros=a.actual_micros)) then return jsonb_build_object('kind','pending');end if;
 return jsonb_build_object('kind','authorized','effect',p_effect,'binding',p_binding);
end $function$
