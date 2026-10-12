CREATE OR REPLACE FUNCTION public.dispatch_model_budget(p_scope_id uuid, p_owner_id uuid, p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.model_budget_scopes%rowtype; a public.model_budget_attempts%rowtype; p public.model_budget_provider_limits%rowtype;
  total_cost numeric; provider_cost numeric; task_cost numeric; active_count bigint; task_count bigint;
begin
  select * into s from public.model_budget_scopes where id = p_scope_id for update;
  if not found or s.owner_id is distinct from p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
  select * into a from public.model_budget_attempts where scope_id = p_scope_id and attempt_id = p_attempt_id;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if a.status <> 'reserved' then return jsonb_build_object('kind','duplicate','status',a.status); end if;
  select * into p from public.model_budget_provider_limits where scope_id = p_scope_id and provider = a.provider for share;
  if not found or not s.enabled or s.frozen or not p.enabled or p.model <> a.model or p.price_version <> a.price_version then
    return jsonb_build_object('kind','disabled');
  end if;
  if s.expires_at <= clock_timestamp() then return jsonb_build_object('kind','expired'); end if;
  select
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where provider = a.provider),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where task_id = a.task_id),0),
    count(*) filter (where status in ('reserved','dispatched','pending')),
    count(*) filter (where task_id = a.task_id)
  into total_cost, provider_cost, task_cost, active_count, task_count
  from public.model_budget_attempts where scope_id = p_scope_id;
  if a.reserved_micros > p.attempt_limit_micros or total_cost > s.limit_micros
    or provider_cost > p.limit_micros or task_cost > s.task_limit_micros
    or active_count > s.concurrency_limit or task_count > s.task_attempt_limit then
    return jsonb_build_object('kind','exhausted');
  end if;
  update public.model_budget_attempts set status = 'dispatched', updated_at = clock_timestamp()
    where scope_id = p_scope_id and attempt_id = p_attempt_id;
  return jsonb_build_object('kind','dispatched');
end;
$function$
