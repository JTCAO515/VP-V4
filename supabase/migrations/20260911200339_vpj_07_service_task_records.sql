-- Record-only ServiceTask scope. No charge, new recipient, policy or history dispatch.
-- Retained IDs deliberately reference text_content, not deletable user/Turn rows.
create table turn_private.service_tasks (
  id uuid primary key,
  owner_id uuid not null,
  thread_id uuid not null unique,
  goal_turn_id uuid not null references turn_private.text_content(turn_id) deferrable initially deferred,
  last_turn_id uuid not null references turn_private.text_content(turn_id) deferrable initially deferred,
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null,
  scope_version integer not null check(scope_version=1),
  expected_result text not null default 'text_answer' check(expected_result='text_answer'),
  goal_digest text not null check(goal_digest ~ '^[a-f0-9]{64}$'),
  budget_scope_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create table turn_private.service_task_turns (
  turn_id uuid primary key references turn_private.text_content(turn_id) deferrable initially deferred,
  task_id uuid not null references turn_private.service_tasks(id),
  owner_id uuid not null,
  parent_turn_id uuid references turn_private.text_content(turn_id),
  relationship text not null check(relationship in ('new_goal','clarification','repair')),
  idempotency_key uuid not null,
  request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
  unique(owner_id,task_id,idempotency_key),
  unique(task_id,parent_turn_id),
  check((relationship='new_goal')=(parent_turn_id is null))
);
alter table turn_private.service_tasks enable row level security;
alter table turn_private.service_task_turns enable row level security;
revoke all on turn_private.service_tasks,turn_private.service_task_turns from public,anon,authenticated,service_role;

create or replace function public.start_chat_turn(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_digest text)
returns table(turn_id uuid, reused boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  thread public.chat_threads%rowtype;
  previous public.chat_turn_idempotency%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if p_digest <> 'chat-state-control-v1' then raise exception 'invalid state control digest'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||p_turn_id::text,0));
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  select * into thread from public.chat_threads where id = p_thread_id and owner_id = (select auth.uid()) for update;
  if not found or thread.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.chat_turn_idempotency
    where owner_id = (select auth.uid()) and thread_id = p_thread_id and idempotency_key = p_idempotency_key::text for update;
  if found then
    if previous.digest <> p_digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return query select previous.turn_id, true;
    return;
  end if;
  -- Old native and state-control clients may replay existing turns, but cannot
  -- append an unassociated turn to a v2 task, even during a mixed-worker rollout.
  if exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id)
    and not exists(select 1 from turn_private.service_task_turns l
      join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=p_turn_id and l.owner_id=auth.uid() and s.thread_id=p_thread_id)
  then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into public.turns(id, owner_id, thread_id, trip_id, status)
    values (p_turn_id, thread.owner_id, thread.id, thread.trip_id, 'accepted');
  insert into public.chat_turn_events(owner_id, thread_id, turn_id, event_id, sequence, schema_version, event_type, state)
    values (thread.owner_id, thread.id, p_turn_id, 'accepted', 1, 'turn-sse-v1', 'accepted', 'accepted');
  insert into public.chat_turn_idempotency(owner_id, thread_id, idempotency_key, digest, turn_id)
    values (thread.owner_id, thread.id, p_idempotency_key::text, p_digest, p_turn_id);
  update public.chat_threads set updated_at = now() where id = thread.id;
  return query select p_turn_id, false;
end;
$$;
revoke all on function public.start_chat_turn(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.start_chat_turn(uuid, uuid, uuid, text) to authenticated;

create function public.submit_service_task_turn(
  p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,
  p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  s turn_private.service_tasks%rowtype; prior turn_private.service_task_turns%rowtype;
  parent turn_private.text_content%rowtype; digest text; result jsonb;
begin
  if p_thread_id is null or p_turn_id is null or p_task_id is null or p_turn_id=p_task_id
    or p_idempotency_key is null or p_scope_version is distinct from 1
    or p_relationship is null or p_relationship not in ('new_goal','clarification','repair')
    or ((p_relationship='new_goal') is distinct from (p_parent_turn_id is null))
    or p_locale is null or p_locale not in ('zh','en','es','ru','ar')
    or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,p_scope_version,p_relationship,p_parent_turn_id)::text,'UTF8')),'hex');
  -- Shared identity locks precede thread locks; acquire the pair in UUID order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
  if p_relationship='new_goal' then
    insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
  end if;
  perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into s from turn_private.service_tasks where id=p_task_id for update;
  if found then
    if s.owner_id<>u or s.thread_id<>p_thread_id or s.policy_id<>p_policy_id or s.consent_id<>c.consent_id
      or s.scope_version<>p_scope_version then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    perform 1 from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=s.goal_turn_id and g.owner_id=u and g.hidden_at is null;
    if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
    select * into prior from turn_private.service_task_turns where owner_id=u and task_id=s.id and idempotency_key=p_idempotency_key;
    if found then
      if prior.request_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      -- Existing admission rechecks original content visibility/consent and never enqueues again.
      result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
      if result->>'kind'<>'accepted' then raise exception 'DATA_POLICY_BLOCKED'; end if;
      return result||jsonb_build_object('serviceTaskId',s.id,'scopeVersion',s.scope_version,'relationship',prior.relationship,'parentTurnId',prior.parent_turn_id);
    end if;
    if p_relationship='new_goal' or s.last_turn_id is distinct from p_parent_turn_id then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    select g.* into parent from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=p_parent_turn_id and g.owner_id=u and g.thread_id=p_thread_id and g.hidden_at is null
      and t.status in ('completed','failed');
    if not found or parent.policy_id<>p_policy_id or parent.consent_id<>c.consent_id
      or (p_relationship='clarification' and parent.output_kind is distinct from 'clarification')
      or (p_relationship='repair' and parent.output_kind is distinct from 'technical_failure') then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  else
    if p_relationship<>'new_goal' or exists(select 1 from public.turns where thread_id=p_thread_id)
      or exists(select 1 from public.turns where id=p_task_id)
      or exists(select 1 from turn_private.text_content where thread_id=p_thread_id or turn_id=p_task_id)
      or exists(select 1 from public.model_budget_attempts where task_id=p_task_id)
      or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id)
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
      values(p_task_id,u,p_thread_id,p_turn_id,p_turn_id,p_policy_id,c.consent_id,p_scope_version,
        encode(pg_catalog.sha256(convert_to(p_text,'UTF8')),'hex'));
  end if;
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)
    or exists(select 1 from public.turns where id=p_turn_id)
    or exists(select 1 from turn_private.text_content where turn_id=p_turn_id)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
    values(p_turn_id,p_task_id,u,p_parent_turn_id,p_relationship,p_idempotency_key,digest);
  result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
  if result->>'kind'<>'accepted' or result->>'reused'<>'false' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.service_tasks set last_turn_id=p_turn_id where id=p_task_id;
  return result||jsonb_build_object('serviceTaskId',p_task_id,'scopeVersion',p_scope_version,'relationship',p_relationship,'parentTurnId',p_parent_turn_id);
end $$;
revoke all on function public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) from public,anon,service_role;
grant execute on function public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) to authenticated;

-- Keep the proven arithmetic in one internal function. Public old-worker callers
-- also pass through canonicalization; no client may call the unbound implementation.
alter function public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint) set schema turn_private;
alter function turn_private.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint) rename to reserve_model_budget_unbound;
revoke all on function turn_private.reserve_model_budget_unbound(uuid,uuid,uuid,uuid,text,text,text,bigint) from public,anon,authenticated,service_role;
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
revoke all on function public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint) to service_role;
notify pgrst, 'reload schema';

create function public.list_service_task_turns(p_policy_id uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); base jsonb; rows jsonb;
begin
  base:=public.list_text_turns(p_policy_id,p_limit);
  if base->>'kind'<>'history' then return base; end if;
  select coalesce(jsonb_agg(e.value||jsonb_build_object('serviceTaskId',s.id,'scopeVersion',s.scope_version,
    'relationship',l.relationship,'parentTurnId',l.parent_turn_id) order by e.ordinality),'[]'::jsonb) into rows
  from jsonb_array_elements(base->'turns') with ordinality e(value,ordinality)
    join turn_private.service_task_turns l on l.turn_id=(e.value->>'turnId')::uuid and l.owner_id=u
    join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=u
    join turn_private.text_content g on g.turn_id=s.goal_turn_id and g.hidden_at is null
    join public.turns t on t.id=g.turn_id and t.owner_id=u;
  return jsonb_build_object('kind','history','turns',rows);
end $$;
revoke all on function public.list_service_task_turns(uuid,integer) from public,anon,service_role;
grant execute on function public.list_service_task_turns(uuid,integer) to authenticated;
notify pgrst, 'reload schema';

create or replace function turn_private.lock_text_work(p_turn uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; c turn_private.text_content%rowtype;
begin
  select * into w from turn_private.work where turn_id=p_turn;
  if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false; end if;
  select * into w from turn_private.work where turn_id=p_turn for update;
  if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
    or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false; end if;
  select * into c from turn_private.text_content where turn_id=p_turn and owner_id=w.owner_id and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) then return false; end if;
  if exists(select 1 from turn_private.service_task_turns where turn_id=p_turn)
    and not exists(select 1 from turn_private.service_task_turns l
      join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=c.owner_id and s.thread_id=c.thread_id
      join turn_private.text_content g on g.turn_id=s.goal_turn_id and g.hidden_at is null
      join public.turns t on t.id=g.turn_id and t.owner_id=c.owner_id
      where l.turn_id=p_turn and s.policy_id=c.policy_id and s.consent_id=c.consent_id)
    then return false; end if;
  perform 1 from turn_private.text_consents where owner_id=c.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
  return found and w.expires_at>clock_timestamp();
end $$;

