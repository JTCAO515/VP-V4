create function public.reserve_model_budget(
  p_scope_id uuid,p_owner_id uuid,p_task_id uuid,p_attempt_id uuid,
  p_provider text,p_model text,p_price_version text,p_reserved_micros bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare canonical uuid; s turn_private.service_tasks%rowtype; result jsonb;
begin
  select task_id into canonical from turn_private.service_task_turns where turn_id=p_task_id;
  if canonical is null then select id into canonical from turn_private.service_tasks where id=p_task_id; end if;
  if canonical is not null then
    select * into s from turn_private.service_tasks where id=canonical for update;
    if s.owner_id is distinct from p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
    if s.budget_scope_id is not null and s.budget_scope_id is distinct from p_scope_id then return jsonb_build_object('kind','conflict'); end if;
  end if;
  result:=turn_private.reserve_model_budget_unbound(p_scope_id,p_owner_id,coalesce(canonical,p_task_id),p_attempt_id,p_provider,p_model,p_price_version,p_reserved_micros);
  if canonical is not null and result->>'kind'='reserved' and s.budget_scope_id is null then
    update turn_private.service_tasks set budget_scope_id=p_scope_id where id=canonical;
  end if;
  return result;
end $$;
