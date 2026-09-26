-- VPJ-35 U1. Development-only capacity ledger for text ServiceTasks.
-- Disabled by default; no live sale or historical Turn is charged by this migration.
create table turn_private.service_task_capacity_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  policy_version text not null default 'service-task-development/1'
);
insert into turn_private.service_task_capacity_settings(singleton) values(true);
alter table turn_private.service_tasks add column capacity_enforced boolean not null default false;

create table turn_private.service_task_capacity (
  task_id uuid primary key references turn_private.service_tasks(id),
  owner_id uuid not null,
  policy_version text not null check (policy_version='service-task-development/1'),
  tier text not null check (tier in ('free','journey_pass')),
  grant_environment text,
  grant_transaction_id text,
  admitted_at timestamptz not null,
  state text not null check (state in ('reserved','settled','released')),
  settled_turn_id uuid,
  settled_at timestamptz,
  released_at timestamptz,
  check ((tier='free' and grant_environment is null and grant_transaction_id is null)
    or (tier='journey_pass' and grant_environment='Sandbox' and grant_transaction_id is not null)),
  check ((state='settled')=(settled_turn_id is not null and settled_at is not null)),
  check ((state='released')=(released_at is not null))
);
create index service_task_capacity_owner_window on turn_private.service_task_capacity(owner_id,admitted_at)
  where state in ('reserved','settled');
alter table turn_private.service_task_capacity_settings enable row level security;
alter table turn_private.service_task_capacity enable row level security;
revoke all on turn_private.service_task_capacity_settings,turn_private.service_task_capacity from public,anon,authenticated,service_role;

-- Keep the existing owner/scope/idempotency admission contract in one place.
alter function public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) set schema turn_private;
alter function turn_private.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) rename to submit_service_task_turn_unmetered;
revoke all on function turn_private.submit_service_task_turn_unmetered(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) from public,anon,authenticated,service_role;

create function turn_private.reserve_service_task_capacity(p_task_id uuid,p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare active_grant public.storekit_grants%rowtype; at_time timestamptz:=pg_catalog.clock_timestamp();
  period_limit integer; burst_limit integer; used_period integer; used_burst integer;
begin
  select * into active_grant from public.storekit_grants g
    where g.owner_id=p_owner and g.state='active' and g.starts_at<=at_time and g.ends_at>at_time
    order by g.starts_at desc limit 1;
  if found then
    if active_grant.policy_version<>'service-task-development/1'
      or active_grant.capacity_snapshot->'period'->>'kind'<>'per_grant'
      or active_grant.capacity_snapshot->'burst'->>'kind'<>'account_rolling'
      or active_grant.capacity_snapshot->'period'->>'hours'<>'720'
      or active_grant.capacity_snapshot->'burst'->>'hours'<>'24'
      or active_grant.capacity_snapshot->'period'->>'quantity'<>'80'
      or active_grant.capacity_snapshot->'burst'->>'quantity'<>'12'
      then raise exception 'CAPACITY_POLICY_UNAVAILABLE'; end if;
    period_limit:=80;burst_limit:=12;
    select count(*) into used_period from turn_private.service_task_capacity c
      where c.owner_id=p_owner and c.state in ('reserved','settled')
      and c.grant_environment=active_grant.environment and c.grant_transaction_id=active_grant.transaction_id;
  else
    period_limit:=4;burst_limit:=2;
    select count(*) into used_period from turn_private.service_task_capacity c
      where c.owner_id=p_owner and c.tier='free' and c.state in ('reserved','settled')
      and c.admitted_at>at_time-interval '168 hours';
  end if;
  select count(*) into used_burst from turn_private.service_task_capacity c
    where c.owner_id=p_owner and c.state in ('reserved','settled') and c.admitted_at>at_time-interval '24 hours';
  if used_period>=period_limit or used_burst>=burst_limit then raise exception 'SERVICE_TASK_CAPACITY_EXHAUSTED'; end if;
  insert into turn_private.service_task_capacity(task_id,owner_id,policy_version,tier,grant_environment,grant_transaction_id,admitted_at,state)
    values(p_task_id,p_owner,'service-task-development/1',case when active_grant.transaction_id is null then 'free' else 'journey_pass' end,
      active_grant.environment,active_grant.transaction_id,at_time,'reserved')
    on conflict(task_id) do update set state='reserved',tier=excluded.tier,grant_environment=excluded.grant_environment,
      grant_transaction_id=excluded.grant_transaction_id,admitted_at=excluded.admitted_at,released_at=null
      where turn_private.service_task_capacity.state='released' and turn_private.service_task_capacity.owner_id=p_owner;
  if not found then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT'; end if;
end $$;
revoke all on function turn_private.reserve_service_task_capacity(uuid,uuid) from public,anon,authenticated,service_role;

create function public.submit_service_task_turn(
  p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,
  p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); result jsonb;
  current_policy turn_private.service_task_capacity_settings%rowtype;
  prior_capacity turn_private.service_task_capacity%rowtype;
  task_enforced boolean;
begin
  -- Same lock as grant issuance/revocation, held through task admission and reservation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34));
  result:=turn_private.submit_service_task_turn_unmetered(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,
    p_task_id,p_scope_version,p_relationship,p_parent_turn_id);
  if result->>'reused'='true' then return result; end if;
  select capacity_enforced into task_enforced from turn_private.service_tasks where id=p_task_id;
  select * into prior_capacity from turn_private.service_task_capacity where task_id=p_task_id;
  select * into current_policy from turn_private.service_task_capacity_settings where singleton=true;
  if not current_policy.enabled then
    if task_enforced then
      if prior_capacity.task_id is null or prior_capacity.state='released' then raise exception 'CAPACITY_POLICY_UNAVAILABLE'; end if;
      return result||jsonb_build_object('capacityMode','development','capacityState',prior_capacity.state);
    end if;
    return result||jsonb_build_object('capacityMode','record_only');
  end if;
  if current_policy.policy_version<>'service-task-development/1' then raise exception 'CAPACITY_POLICY_UNAVAILABLE'; end if;
  if p_relationship<>'new_goal' and prior_capacity.task_id is null then
    if task_enforced then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT'; end if;
    return result||jsonb_build_object('capacityMode','record_only');
  end if;
  if p_relationship='new_goal' or (p_relationship='repair' and prior_capacity.state='released') then
    perform turn_private.reserve_service_task_capacity(p_task_id,u);
  end if;
  if p_relationship='new_goal' then update turn_private.service_tasks set capacity_enforced=true where id=p_task_id; end if;
  return result||jsonb_build_object('capacityMode','development','capacityState',
    case when prior_capacity.state='settled' then 'settled' else 'reserved' end);
end $$;
revoke all on function public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) from public,anon,service_role;
grant execute on function public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) to authenticated;

-- The existing worker function validates lease, dispatch, consent and durable output
-- inside this same transaction. A failed call rolls back both output and settlement.
alter function public.complete_text_work(uuid,uuid,text,text) set schema turn_private;
alter function turn_private.complete_text_work(uuid,uuid,text,text) rename to complete_text_work_unmetered;
revoke all on function turn_private.complete_text_work_unmetered(uuid,uuid,text,text) from public,anon,authenticated,service_role;
create function public.complete_text_work(p_turn_id uuid,p_lease_token uuid,p_kind text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; task uuid; task_owner uuid; capacity turn_private.service_task_capacity%rowtype; task_enforced boolean;
begin
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
  elsif p_kind in ('blocked','technical_failure') then
    update turn_private.service_task_capacity set state='released',released_at=pg_catalog.clock_timestamp()
      where task_id=task and state='reserved';
  end if;
  return result;
end $$;
revoke all on function public.complete_text_work(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_text_work(uuid,uuid,text,text) to service_role;

alter function public.cancel_chat_turn(uuid) set schema turn_private;
alter function turn_private.cancel_chat_turn(uuid) rename to cancel_chat_turn_unmetered;
revoke all on function turn_private.cancel_chat_turn_unmetered(uuid) from public,anon,authenticated,service_role;
create function public.cancel_chat_turn(p_turn_id uuid)
returns table(sequence integer,state text) language plpgsql security definer set search_path='' as $$
declare task uuid; task_owner uuid; cancelled record;
begin
  select l.task_id,l.owner_id into task,task_owner from turn_private.service_task_turns l
    where l.turn_id=p_turn_id and l.owner_id=(select auth.uid());
  if task is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(task_owner::text,34)); end if;
  select * into cancelled from turn_private.cancel_chat_turn_unmetered(p_turn_id);
  if task is not null and cancelled.state='cancelled' then
    update turn_private.service_task_capacity c set state='released',released_at=pg_catalog.clock_timestamp()
      where c.task_id=task and c.owner_id=task_owner and c.state='reserved';
  end if;
  return query select cancelled.sequence::integer,cancelled.state::text;
end $$;
revoke all on function public.cancel_chat_turn(uuid) from public,anon,service_role;
grant execute on function public.cancel_chat_turn(uuid) to authenticated;

create function public.service_task_capacity_export_owner_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('taskId',task_id,'policyVersion',policy_version,
    'tier',tier,'grantEnvironment',grant_environment,'grantTransactionId',grant_transaction_id,
    'admittedAt',admitted_at,'state',state,'settledTurnId',settled_turn_id,
    'settledAt',settled_at,'releasedAt',released_at) order by admitted_at),'[]'::jsonb) into rows
    from turn_private.service_task_capacity where owner_id=p_owner;
  return rows;
end $$;
revoke all on function public.service_task_capacity_export_owner_v1(uuid) from public,anon,authenticated;
grant execute on function public.service_task_capacity_export_owner_v1(uuid) to service_role;
create function public.service_task_capacity_erase_owner_v1(p_owner uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  delete from turn_private.service_task_capacity where owner_id=p_owner;
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function public.service_task_capacity_erase_owner_v1(uuid) from public,anon,authenticated;
grant execute on function public.service_task_capacity_erase_owner_v1(uuid) to service_role;
notify pgrst,'reload schema';
