-- VPJ-59: server-only cost ledger. No scope, provider or dispatch is enabled by migration.
create table public.model_budget_scopes (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency in ('CNY', 'USD')),
  limit_micros bigint not null check (limit_micros between 1 and 1000000000000),
  task_limit_micros bigint not null check (task_limit_micros between 1 and limit_micros),
  task_attempt_limit integer not null check (task_attempt_limit between 1 and 1000),
  concurrency_limit integer not null check (concurrency_limit between 1 and 1000),
  enabled boolean not null default false,
  frozen boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.model_budget_provider_limits (
  scope_id uuid not null references public.model_budget_scopes(id) on delete restrict,
  provider text not null check (provider in ('qwen', 'glm', 'deepseek')),
  model text not null check (model ~ '^[A-Za-z0-9._-]{1,100}$'),
  price_version text not null check (price_version ~ '^[A-Za-z0-9._-]{1,100}$'),
  limit_micros bigint not null check (limit_micros between 1 and 1000000000000),
  attempt_limit_micros bigint not null check (attempt_limit_micros between 1 and limit_micros),
  enabled boolean not null default false,
  primary key (scope_id, provider)
);
create table public.model_budget_attempts (
  scope_id uuid not null,
  attempt_id uuid not null,
  task_id uuid not null,
  provider text not null,
  model text not null,
  price_version text not null,
  reserved_micros bigint not null check (reserved_micros between 1 and 1000000000000),
  actual_micros bigint check (actual_micros between 0 and 1000000000000),
  status text not null check (status in ('reserved','dispatched','pending','settled','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope_id, attempt_id),
  foreign key (scope_id, provider) references public.model_budget_provider_limits(scope_id, provider) on delete restrict,
  check ((status = 'settled') = (actual_micros is not null))
);
create index model_budget_attempts_task_idx on public.model_budget_attempts(scope_id, task_id);
create index model_budget_attempts_provider_idx on public.model_budget_attempts(scope_id, provider);
alter table public.model_budget_scopes enable row level security;
alter table public.model_budget_provider_limits enable row level security;
alter table public.model_budget_attempts enable row level security;
revoke all on public.model_budget_scopes, public.model_budget_provider_limits, public.model_budget_attempts from public, anon, authenticated;
grant select, insert, update on public.model_budget_scopes, public.model_budget_provider_limits, public.model_budget_attempts to service_role;

create function public.reserve_model_budget(
  p_scope_id uuid, p_owner_id uuid, p_task_id uuid, p_attempt_id uuid,
  p_provider text, p_model text, p_price_version text, p_reserved_micros bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.model_budget_scopes%rowtype;
  p public.model_budget_provider_limits%rowtype;
  a public.model_budget_attempts%rowtype;
  total_cost numeric; provider_cost numeric; task_cost numeric;
  active_count bigint; task_count bigint;
begin
  if p_scope_id is null or p_owner_id is null or p_task_id is null or p_attempt_id is null
    or p_provider is null or p_model is null or p_price_version is null
    or p_reserved_micros is null or p_reserved_micros < 1 or p_reserved_micros > 1000000000000 then
    return jsonb_build_object('kind','invalid');
  end if;
  select * into s from public.model_budget_scopes where id = p_scope_id for update;
  if not found or s.owner_id <> p_owner_id then return jsonb_build_object('kind','unavailable'); end if;
  select * into a from public.model_budget_attempts where scope_id = p_scope_id and attempt_id = p_attempt_id;
  if found then
    if a.task_id <> p_task_id or a.provider <> p_provider or a.model <> p_model
      or a.price_version <> p_price_version or a.reserved_micros <> p_reserved_micros then
      return jsonb_build_object('kind','conflict');
    end if;
    return jsonb_build_object('kind','duplicate','status',a.status);
  end if;
  select * into p from public.model_budget_provider_limits where scope_id = p_scope_id and provider = p_provider for share;
  if not found or p.model <> p_model or p.price_version <> p_price_version then return jsonb_build_object('kind','unavailable'); end if;
  if not s.enabled or s.frozen or not p.enabled then return jsonb_build_object('kind','disabled'); end if;
  if s.expires_at <= clock_timestamp() then return jsonb_build_object('kind','expired'); end if;
  select
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where provider = p_provider),0),
    coalesce(sum(case when status = 'settled' then actual_micros when status = 'released' then 0 else reserved_micros end) filter (where task_id = p_task_id),0),
    count(*) filter (where status in ('reserved','dispatched','pending')),
    count(*) filter (where task_id = p_task_id)
  into total_cost, provider_cost, task_cost, active_count, task_count
  from public.model_budget_attempts where scope_id = p_scope_id;
  if p_reserved_micros > p.attempt_limit_micros
    or total_cost + p_reserved_micros > s.limit_micros
    or provider_cost + p_reserved_micros > p.limit_micros
    or task_cost + p_reserved_micros > s.task_limit_micros
    or active_count >= s.concurrency_limit or task_count >= s.task_attempt_limit then
    return jsonb_build_object('kind','exhausted');
  end if;
  insert into public.model_budget_attempts(scope_id, attempt_id, task_id, provider, model, price_version, reserved_micros, status)
  values (p_scope_id,p_attempt_id,p_task_id,p_provider,p_model,p_price_version,p_reserved_micros,'reserved');
  return jsonb_build_object('kind','reserved');
end;
$$;

create function public.dispatch_model_budget(p_scope_id uuid, p_owner_id uuid, p_attempt_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
$$;

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
revoke all on function public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint) from public, anon, authenticated;
revoke all on function public.dispatch_model_budget(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.finish_model_budget(uuid,uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint) to service_role;
grant execute on function public.dispatch_model_budget(uuid,uuid,uuid) to service_role;
grant execute on function public.finish_model_budget(uuid,uuid,uuid,text,bigint) to service_role;
