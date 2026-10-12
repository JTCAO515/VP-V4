create function public.finish_model_budget(p_scope_id uuid, p_owner_id uuid, p_attempt_id uuid, p_action text, p_actual_micros bigint default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.model_budget_scopes%rowtype; a public.model_budget_attempts%rowtype;
begin
  if p_action is null or p_action not in ('settle','pending','release')
    or (p_action = 'settle' and (p_actual_micros is null or p_actual_micros < 0 or p_actual_micros > 1000000000000))
    or (p_action <> 'settle' and p_actual_micros is not null) then return jsonb_build_object('kind','invalid'); end if;
  select * into s from public.model_budget_scopes where id = p_scope_id for update;
  if not found or s.owner_id is distinct from p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
  select * into a from public.model_budget_attempts where scope_id = p_scope_id and attempt_id = p_attempt_id;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if p_action = 'release' then
    if a.status = 'released' then return jsonb_build_object('kind','duplicate','status','released'); end if;
    if a.status <> 'reserved' then return jsonb_build_object('kind','conflict'); end if;
    update public.model_budget_attempts set status = 'released', updated_at = clock_timestamp() where scope_id = p_scope_id and attempt_id = p_attempt_id;
    return jsonb_build_object('kind','released');
  elsif p_action = 'pending' then
    if a.status = 'pending' then return jsonb_build_object('kind','duplicate','status','pending'); end if;
    if a.status <> 'dispatched' then return jsonb_build_object('kind','conflict'); end if;
    update public.model_budget_attempts set status = 'pending', updated_at = clock_timestamp() where scope_id = p_scope_id and attempt_id = p_attempt_id;
    return jsonb_build_object('kind','pending');
  else
    if a.status = 'settled' then
      if a.actual_micros = p_actual_micros then return jsonb_build_object('kind','duplicate','status','settled'); end if;
      return jsonb_build_object('kind','conflict');
    end if;
    if a.status not in ('dispatched','pending') then return jsonb_build_object('kind','conflict'); end if;
    update public.model_budget_attempts set status = 'settled', actual_micros = p_actual_micros, updated_at = clock_timestamp()
      where scope_id = p_scope_id and attempt_id = p_attempt_id;
    if p_actual_micros > a.reserved_micros then update public.model_budget_scopes set frozen = true where id = p_scope_id; end if;
    return jsonb_build_object('kind','settled','overrun',p_actual_micros > a.reserved_micros);
  end if;
end;
$$;
