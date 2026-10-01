-- A read-only readiness check for the opt-in planning target in the existing
-- hosted lifecycle. Does not claim, reserve, dispatch, install a policy or
-- change either stop switch. Existing per-poll SQL remains authoritative.
create function public.hosted_planning_target_v1(
  p_owner_id uuid,p_planning_policy_id uuid,p_scope_id uuid,p_price_version text,p_reserved_micros bigint,
  p_turn_id uuid default null,p_lease_token uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare scope public.model_budget_scopes%rowtype; tariff public.model_budget_provider_limits%rowtype;
  candidate record; total_cost numeric; provider_cost numeric; active_count bigint;
  task_cost numeric; task_count bigint; unknown_effect boolean;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  if p_owner_id is null or p_planning_policy_id is null or p_scope_id is null
    or p_price_version is null or p_price_version !~ '^[A-Za-z0-9._-]{1,100}$'
    or p_reserved_micros is null or p_reserved_micros not between 1 and 1000000000000
    or (p_turn_id is null) is distinct from (p_lease_token is null)
    then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from turn_private.hosted_worker_control where singleton and enabled)
    then return jsonb_build_object('kind','idle'); end if;
  if not exists(select 1 from turn_private.planning_policies p join turn_private.text_policies t on t.id=p.text_policy_id
    join turn_private.planning_consents c on c.policy_id=p.id and c.owner_id=p_owner_id and c.revoked_at is null
    where p.id=p_planning_policy_id and p.environment='staging' and turn_private.planning_policy_current(p.id)
      and t.provider='qwen') then return jsonb_build_object('kind','idle'); end if;
  select * into scope from public.model_budget_scopes where id=p_scope_id and owner_id=p_owner_id;
  if not found then return jsonb_build_object('kind','idle'); end if;
  select * into tariff from public.model_budget_provider_limits p where p.scope_id=scope.id and p.provider='qwen';
  if not found or tariff.model<>'qwen3.7-plus-2026-05-26' or tariff.price_version<>p_price_version
    then return jsonb_build_object('kind','idle'); end if;
  select coalesce(sum(case when status='settled' then actual_micros when status='released' then 0 else reserved_micros end),0),
    coalesce(sum(case when status='settled' then actual_micros when status='released' then 0 else reserved_micros end) filter(where a.provider='qwen'),0),
    count(*) filter(where status in ('reserved','dispatched','pending'))
    into total_cost,provider_cost,active_count from public.model_budget_attempts a where a.scope_id=scope.id;
  for candidate in select j.task_id,w.turn_id from turn_private.planning_comparisons j
    join turn_private.work w on w.turn_id=j.turn_id and w.owner_id=j.owner_id
    join public.turns t on t.id=w.turn_id and t.owner_id=w.owner_id and t.status='accepted'
    join turn_private.text_content x on x.turn_id=w.turn_id and x.owner_id=w.owner_id and x.hidden_at is null
    join turn_private.text_consents c on c.owner_id=x.owner_id and c.policy_id=x.policy_id and c.consent_id=x.consent_id and c.revoked_at is null
    join turn_private.planning_consents pc on pc.owner_id=j.owner_id and pc.policy_id=j.planning_policy_id
      and pc.consent_id=j.planning_consent_id and pc.revoked_at is null
    where j.owner_id=p_owner_id and j.planning_policy_id=p_planning_policy_id and j.state='queued'
      and w.execution_mode='planning_comparison_v1'
      and (case when p_turn_id is null then w.state='queued' or (w.state='leased' and w.expires_at<=clock_timestamp())
        else w.turn_id=p_turn_id and w.state='leased' and w.lease_token=p_lease_token and w.expires_at>clock_timestamp() end)
      and turn_private.text_policy_current(x.policy_id)
    order by w.created_at,w.turn_id limit 100 loop
    -- Let the existing claimer persist paused_unknown without another paid or
    -- tool call, even when this prior hold has consumed the scope's capacity.
    select exists(select 1 from public.model_budget_attempts a where a.task_id=candidate.task_id and a.status in ('dispatched','pending','settled'))
      or exists(select 1 from turn_private.planning_action_receipts a where a.turn_id=candidate.turn_id and a.state in ('started','unknown'))
      into unknown_effect;
    if p_turn_id is null and unknown_effect then return jsonb_build_object('kind','ready'); end if;
    if not scope.enabled or scope.frozen or scope.expires_at<=clock_timestamp() or not tariff.enabled
      or p_reserved_micros>tariff.attempt_limit_micros or total_cost+p_reserved_micros>scope.limit_micros
      or provider_cost+p_reserved_micros>tariff.limit_micros or active_count>=scope.concurrency_limit
      then continue; end if;
    select coalesce(sum(case when status='settled' then actual_micros when status='released' then 0 else reserved_micros end),0),count(*)
      into task_cost,task_count from public.model_budget_attempts where scope_id=scope.id and task_id=candidate.task_id;
    if task_cost+p_reserved_micros<=scope.task_limit_micros and task_count<scope.task_attempt_limit
      then return jsonb_build_object('kind','ready'); end if;
  end loop;
  return jsonb_build_object('kind','idle');
end $$;
revoke all on function public.hosted_planning_target_v1(uuid,uuid,uuid,text,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.hosted_planning_target_v1(uuid,uuid,uuid,text,bigint,uuid,uuid) to service_role;
notify pgrst,'reload schema';
