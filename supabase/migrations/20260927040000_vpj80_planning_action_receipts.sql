-- VPJ-80 first safety slice. Service-only action claims under an existing Turn
-- lease. No task admission, worker routing, provider, scope, or feature is enabled.
create table turn_private.planning_action_receipts (
  turn_id uuid not null references turn_private.work(turn_id) on delete cascade,
  action_key text not null check(action_key ~ '^[a-f0-9]{64}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references turn_private.service_tasks(id) on delete cascade,
  message_id uuid not null references turn_private.assistant_messages(id) on delete cascade,
  lease_token uuid not null,
  tool_id text not null check(tool_id in ('evidence.lookup','place.read','constraints.evaluate','result.prepare')),
  input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'),
  basis_digest text not null check(basis_digest ~ '^[a-f0-9]{64}$'),
  memory_basis jsonb not null check(jsonb_typeof(memory_basis)='array' and jsonb_array_length(memory_basis)<=20),
  state text not null check(state in ('started','completed','unknown')),
  receipt_digest text check(receipt_digest is null or receipt_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(turn_id,action_key),
  check((state='completed')=(receipt_digest is not null))
);
create index planning_action_receipts_task on turn_private.planning_action_receipts(task_id,created_at);
alter table turn_private.planning_action_receipts enable row level security;
revoke all on turn_private.planning_action_receipts from public,anon,authenticated,service_role;

-- Validate live owner/task/goal/memory authority under the same account -> Turn
-- lock order as cancellation. The caller cannot supply an arbitrary basis hash.
create function turn_private.planning_action_basis(
  p_turn_id uuid,p_owner_id uuid,p_message_id uuid,p_memory_basis jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare source turn_private.assistant_messages%rowtype;
  task turn_private.service_tasks%rowtype; goal turn_private.assistant_goals%rowtype;
  memory jsonb; ids text[]:=array[]::text[];
begin
  if p_memory_basis is null or jsonb_typeof(p_memory_basis)<>'array' or jsonb_array_length(p_memory_basis)>20 then return null; end if;
  select * into source from turn_private.assistant_messages where id=p_message_id and owner_id=p_owner_id;
  if not found or source.task_id is null or source.goal_id is null then return null; end if;
  select * into task from turn_private.service_tasks where id=source.task_id and owner_id=p_owner_id;
  if not found or task.last_turn_id<>p_turn_id or not turn_private.text_policy_current(task.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=p_owner_id and c.policy_id=task.policy_id and c.consent_id=task.consent_id and c.revoked_at is null)
    or not exists(select 1 from turn_private.text_content root where root.turn_id=task.goal_turn_id and root.owner_id=p_owner_id and root.hidden_at is null)
    or not exists(select 1 from turn_private.text_content current_turn where current_turn.turn_id=p_turn_id and current_turn.owner_id=p_owner_id and current_turn.hidden_at is null)
    then return null; end if;
  select * into goal from turn_private.assistant_goals where id=source.goal_id and owner_id=p_owner_id;
  if not found or goal.conversation_id<>source.conversation_id or goal.scope_version<>source.scope_version
    or not turn_private.text_policy_current(source.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=p_owner_id and c.policy_id=source.policy_id and c.consent_id=source.consent_id and c.revoked_at is null)
    then return null; end if;
  for memory in select value from jsonb_array_elements(p_memory_basis) loop
    if jsonb_typeof(memory)<>'object' or memory-'id'-'revision'<>'{}'::jsonb
      or (memory->>'id') is null or (memory->>'revision') !~ '^[1-9][0-9]{0,14}$'
      or memory->>'id'=any(ids) then return null; end if;
    if not exists(select 1 from public.memory_profiles p join public.memory_consents c on c.id=p.consent_id and c.owner_id=p.owner_id and c.status='granted'
      where p.id=(memory->>'id')::uuid and p.owner_id=p_owner_id and p.revision=(memory->>'revision')::bigint
        and p.state in ('explicit','confirmed') and p.summary is not null) then return null; end if;
    ids:=array_append(ids,memory->>'id');
  end loop;
  return encode(pg_catalog.sha256(convert_to(jsonb_build_array(source.id,source.sequence,goal.id,goal.scope_version,task.id,task.last_turn_id,p_memory_basis)::text,'UTF8')),'hex');
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;
revoke all on function turn_private.planning_action_basis(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.claim_planning_action_v1(
  p_turn_id uuid,p_owner_id uuid,p_lease_token uuid,p_message_id uuid,
  p_action_key text,p_tool_id text,p_input_digest text,p_memory_basis jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; prior turn_private.planning_action_receipts%rowtype;
  basis text; v_task_id uuid;
begin
  if (select auth.role())<>'service_role' or p_action_key !~ '^[a-f0-9]{64}$'
    or p_input_digest !~ '^[a-f0-9]{64}$'
    or p_tool_id not in ('evidence.lookup','place.read','constraints.evaluate','result.prepare')
    or p_turn_id is null or p_owner_id is null or p_lease_token is null or p_message_id is null
    then raise exception 'INVALID_INPUT'; end if;
  select * into w from turn_private.work where turn_id=p_turn_id and owner_id=p_owner_id;
  if not found or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','stale'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if w.state<>'leased' or w.lease_token is distinct from p_lease_token or w.expires_at<=clock_timestamp()
    or not exists(select 1 from public.turns t where t.id=p_turn_id and t.owner_id=p_owner_id and t.status='accepted')
    then return jsonb_build_object('kind','stale'); end if;
  basis:=turn_private.planning_action_basis(p_turn_id,p_owner_id,p_message_id,p_memory_basis);
  if basis is null then return jsonb_build_object('kind','stale_basis'); end if;
  select m.task_id into v_task_id from turn_private.assistant_messages m where m.id=p_message_id;
  select * into prior from turn_private.planning_action_receipts where turn_id=p_turn_id and action_key=p_action_key;
  if found then
    if prior.owner_id<>p_owner_id or prior.task_id<>v_task_id or prior.message_id<>p_message_id
      or prior.tool_id<>p_tool_id or prior.input_digest<>p_input_digest or prior.basis_digest<>basis
      then return jsonb_build_object('kind','conflict'); end if;
    return jsonb_build_object('kind',case when prior.state='completed' then 'duplicate' else 'unknown' end,
      'receiptDigest',prior.receipt_digest);
  end if;
  -- A dispatched/pending model charge, or a prior action without a durable
  -- completion receipt, requires reconciliation before any new effect.
  if exists(select 1 from public.model_budget_attempts a where a.task_id in (v_task_id,p_turn_id)
    and a.status in ('dispatched','pending'))
    or exists(select 1 from turn_private.planning_action_receipts a where a.turn_id=p_turn_id and a.state in ('started','unknown'))
    then return jsonb_build_object('kind','unknown'); end if;
  if (select count(*) from turn_private.planning_action_receipts where task_id=v_task_id)>=4
    then return jsonb_build_object('kind','step_limit'); end if;
  insert into turn_private.planning_action_receipts(turn_id,action_key,owner_id,task_id,message_id,lease_token,tool_id,input_digest,basis_digest,memory_basis,state)
    values(p_turn_id,p_action_key,p_owner_id,v_task_id,p_message_id,p_lease_token,p_tool_id,p_input_digest,basis,p_memory_basis,'started');
  return jsonb_build_object('kind','claimed');
end $$;

create function public.finish_planning_action_v1(
  p_turn_id uuid,p_owner_id uuid,p_lease_token uuid,p_action_key text,p_receipt_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; action turn_private.planning_action_receipts%rowtype;
begin
  if (select auth.role())<>'service_role' or p_turn_id is null or p_owner_id is null or p_lease_token is null
    or p_action_key !~ '^[a-f0-9]{64}$' or (p_receipt_digest is not null and p_receipt_digest !~ '^[a-f0-9]{64}$')
    then raise exception 'INVALID_INPUT'; end if;
  select * into w from turn_private.work where turn_id=p_turn_id and owner_id=p_owner_id;
  if not found or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','stale'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if w.state<>'leased' or w.lease_token is distinct from p_lease_token or w.expires_at<=clock_timestamp()
    or not exists(select 1 from public.turns t where t.id=p_turn_id and t.owner_id=p_owner_id and t.status='accepted')
    then return jsonb_build_object('kind','stale'); end if;
  select * into action from turn_private.planning_action_receipts where turn_id=p_turn_id and action_key=p_action_key for update;
  if not found or action.owner_id<>p_owner_id or action.lease_token<>p_lease_token then return jsonb_build_object('kind','stale'); end if;
  if action.state='completed' then return jsonb_build_object('kind',case when action.receipt_digest=p_receipt_digest then 'duplicate' else 'conflict' end); end if;
  if action.state='unknown' and p_receipt_digest is not null then return jsonb_build_object('kind','unknown'); end if;
  if p_receipt_digest is not null and turn_private.planning_action_basis(p_turn_id,p_owner_id,action.message_id,action.memory_basis) is distinct from action.basis_digest
    then return jsonb_build_object('kind','stale_basis'); end if;
  update turn_private.planning_action_receipts set state=case when p_receipt_digest is null then 'unknown' else 'completed' end,
    receipt_digest=p_receipt_digest,updated_at=clock_timestamp() where turn_id=p_turn_id and action_key=p_action_key;
  return jsonb_build_object('kind',case when p_receipt_digest is null then 'unknown' else 'completed' end);
end $$;

revoke all on function public.claim_planning_action_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb),public.finish_planning_action_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_planning_action_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb),public.finish_planning_action_v1(uuid,uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
