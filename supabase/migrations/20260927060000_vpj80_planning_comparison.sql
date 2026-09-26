-- VPJ-80 second slice. The only supported planning kind compares the two
-- Shanghai stay areas by observed rail access. No policy, consent, worker,
-- provider, budget scope, or scheduler is enabled by this migration.

alter table turn_private.work add column execution_mode text not null default 'text'
  check(execution_mode in ('text','planning_comparison_v1'));

create table turn_private.planning_policies (
  id uuid primary key,
  text_policy_id uuid not null references turn_private.text_policies(id),
  environment text not null check(environment in ('local_synthetic','staging')),
  notice_version text not null check(notice_version ~ '^[A-Za-z0-9._-]{1,100}$'),
  notice_hash text not null check(notice_hash ~ '^[a-f0-9]{64}$'),
  notice_zh text not null check(length(btrim(notice_zh)) between 1 and 4000),
  notice_en text not null check(length(btrim(notice_en)) between 1 and 4000),
  effective_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check(effective_at<expires_at)
);
create table turn_private.planning_consents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references turn_private.planning_policies(id),
  consent_id uuid not null unique default gen_random_uuid(),
  accepted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key(owner_id,policy_id)
);
create table turn_private.planning_comparisons (
  turn_id uuid primary key references turn_private.work(turn_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null unique references turn_private.service_tasks(id) on delete cascade,
  goal_id uuid not null references turn_private.assistant_goals(id) on delete cascade,
  message_id uuid not null unique references turn_private.assistant_messages(id) on delete cascade,
  goal_version integer not null check(goal_version between 1 and 10000),
  planning_policy_id uuid not null references turn_private.planning_policies(id),
  planning_consent_id uuid not null,
  memory_basis jsonb not null check(jsonb_typeof(memory_basis)='array' and jsonb_array_length(memory_basis)<=3),
  artifact_id uuid not null unique,
  publication_key uuid not null unique,
  state text not null default 'queued' check(state in ('queued','paused_unknown','completed')),
  created_at timestamptz not null default clock_timestamp()
);
create index planning_comparisons_owner_state on turn_private.planning_comparisons(owner_id,state,created_at);

create table turn_private.planning_model_dispatches (
  lease_token uuid primary key,
  turn_id uuid not null references turn_private.work(turn_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references turn_private.service_tasks(id) on delete cascade,
  scope_id uuid not null,
  attempt_id uuid not null,
  dispatched_at timestamptz not null default clock_timestamp(),
  unique(scope_id,attempt_id)
);
create index planning_model_dispatches_task on turn_private.planning_model_dispatches(task_id,dispatched_at);

alter table turn_private.planning_policies enable row level security;
alter table turn_private.planning_consents enable row level security;
alter table turn_private.planning_comparisons enable row level security;
alter table turn_private.planning_model_dispatches enable row level security;
revoke all on turn_private.planning_policies,turn_private.planning_consents,turn_private.planning_comparisons,
  turn_private.planning_model_dispatches from public,anon,authenticated,service_role;

create function turn_private.planning_policy_current(p_policy_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from turn_private.planning_policies p
    where p.id=p_policy_id and p.revoked_at is null and p.effective_at<=clock_timestamp()
      and p.expires_at>clock_timestamp() and turn_private.text_policy_current(p.text_policy_id))
$$;
revoke all on function turn_private.planning_policy_current(uuid) from public,anon,authenticated,service_role;

create function public.read_planning_policy_v1(p_text_policy_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); p turn_private.planning_policies%rowtype; c turn_private.planning_consents%rowtype;
begin
  if p_text_policy_id is null or not turn_private.text_policy_current(p_text_policy_id)
    or not exists(select 1 from turn_private.text_consents x where x.owner_id=u and x.policy_id=p_text_policy_id and x.revoked_at is null)
    then return jsonb_build_object('kind','unavailable'); end if;
  select * into p from turn_private.planning_policies where text_policy_id=p_text_policy_id
    and revoked_at is null and effective_at<=clock_timestamp() and expires_at>clock_timestamp()
    order by effective_at desc,id desc limit 1;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.planning_consents where owner_id=u and policy_id=p.id;
  return jsonb_build_object('kind','planning_policy','policyId',p.id,'noticeVersion',p.notice_version,
    'noticeHash',p.notice_hash,'noticeZh',p.notice_zh,'noticeEn',p.notice_en,
    'consentState',case when c.consent_id is null then 'not_accepted' when c.revoked_at is null then 'accepted' else 'withdrawn' end);
end $$;

create function public.accept_planning_policy_v1(p_policy_id uuid,p_notice_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); p turn_private.planning_policies%rowtype; c turn_private.planning_consents%rowtype;
begin
  select * into p from turn_private.planning_policies where id=p_policy_id;
  if not found or not turn_private.planning_policy_current(p_policy_id) or p_notice_hash is distinct from p.notice_hash
    or not exists(select 1 from turn_private.text_consents x where x.owner_id=u and x.policy_id=p.text_policy_id and x.revoked_at is null)
    then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.planning_consents where owner_id=u and policy_id=p_policy_id for update;
  if found then
    if c.revoked_at is not null then raise exception 'DATA_POLICY_BLOCKED'; end if;
    return jsonb_build_object('kind','accepted','reused',true);
  end if;
  insert into turn_private.planning_consents(owner_id,policy_id) values(u,p_policy_id);
  return jsonb_build_object('kind','accepted','reused',false);
end $$;

create function public.withdraw_planning_policy_v1(p_policy_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.planning_consents%rowtype;
begin
  select * into c from turn_private.planning_consents where owner_id=u and policy_id=p_policy_id for update;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if c.revoked_at is not null then return jsonb_build_object('kind','withdrawn','reused',true); end if;
  update turn_private.planning_consents set revoked_at=clock_timestamp() where owner_id=u and policy_id=p_policy_id;
  return jsonb_build_object('kind','withdrawn','reused',false);
end $$;

-- One transaction admits the existing metered ServiceTask Turn, links the
-- current assistant goal/message, and diverts only this work row from text.
-- A concurrent text claimer cannot see a half-admitted planning task.
create function public.submit_planning_comparison_v1(
  p_conversation_id uuid,p_goal_id uuid,p_expected_goal_version integer,p_parent_message_id uuid,
  p_message_id uuid,p_message_key uuid,p_thread_id uuid,p_turn_id uuid,p_task_id uuid,p_task_key uuid,
  p_text_policy_id uuid,p_planning_policy_id uuid,p_locale text,p_text text,p_memory_basis jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); p turn_private.planning_policies%rowtype;
  c turn_private.planning_consents%rowtype; admitted jsonb; linked jsonb; prior turn_private.planning_comparisons%rowtype;
  m jsonb; ids text[]:=array[]::text[];
begin
  if p_conversation_id is null or p_goal_id is null or p_expected_goal_version is null or p_expected_goal_version<1
    or p_parent_message_id is null or p_message_id is null or p_message_key is null
    or p_thread_id is null or p_turn_id is null or p_task_id is null or p_task_key is null
    or p_text_policy_id is null or p_planning_policy_id is null or p_locale not in ('zh','en')
    or not turn_private.valid_text(p_text,4000) or p_memory_basis is null or jsonb_typeof(p_memory_basis)<>'array'
    or jsonb_array_length(p_memory_basis)>3 then raise exception 'INVALID_INPUT'; end if;
  select * into p from turn_private.planning_policies where id=p_planning_policy_id and text_policy_id=p_text_policy_id;
  if not found or not turn_private.planning_policy_current(p.id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.planning_consents where owner_id=u and policy_id=p.id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  for m in select value from jsonb_array_elements(p_memory_basis) loop
    if jsonb_typeof(m)<>'object' or m-'id'-'revision'<>'{}'::jsonb or (m->>'id') is null
      or (m->>'revision') !~ '^[1-9][0-9]{0,14}$' or m->>'id'=any(ids) then raise exception 'INVALID_INPUT'; end if;
    if not exists(select 1 from public.memory_profiles x join public.memory_consents y on y.id=x.consent_id and y.owner_id=u and y.status='granted'
      where x.id=(m->>'id')::uuid and x.owner_id=u and x.revision=(m->>'revision')::bigint
        and x.state in ('explicit','confirmed') and x.summary is not null) then raise exception 'STALE_BASIS'; end if;
    ids:=array_append(ids,m->>'id');
  end loop;
  admitted:=public.submit_service_task_turn(p_thread_id,p_turn_id,p_task_key,p_text_policy_id,p_locale,p_text,p_task_id,1,'new_goal',null);
  if admitted->>'kind'<>'accepted' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  linked:=public.submit_assistant_message_v1(p_conversation_id,p_message_id,p_message_key,p_text_policy_id,
    p_locale,p_text,'follow_up',p_goal_id,p_expected_goal_version,p_task_id,p_parent_message_id,null);
  if linked->>'kind'<>'accepted' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  select * into prior from turn_private.planning_comparisons where turn_id=p_turn_id;
  if found then
    if prior.owner_id<>u or prior.task_id<>p_task_id or prior.message_id<>p_message_id or prior.goal_id<>p_goal_id
      or prior.goal_version<>p_expected_goal_version or prior.planning_policy_id<>p_planning_policy_id
      or prior.planning_consent_id<>c.consent_id or prior.memory_basis<>p_memory_basis
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    return jsonb_build_object('kind','accepted','reused',true,'taskId',prior.task_id,'turnId',prior.turn_id,'artifactId',prior.artifact_id);
  end if;
  if admitted->>'reused'='true' or linked->>'reused'='true' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.work set execution_mode='planning_comparison_v1' where turn_id=p_turn_id and owner_id=u and state='queued';
  if not found then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.planning_comparisons(turn_id,owner_id,task_id,goal_id,message_id,goal_version,planning_policy_id,planning_consent_id,memory_basis,artifact_id,publication_key)
    values(p_turn_id,u,p_task_id,p_goal_id,p_message_id,p_expected_goal_version,p.id,c.consent_id,p_memory_basis,gen_random_uuid(),gen_random_uuid());
  return jsonb_build_object('kind','accepted','reused',false,'taskId',p_task_id,'turnId',p_turn_id,
    'artifactId',(select artifact_id from turn_private.planning_comparisons where turn_id=p_turn_id));
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INPUT';
end $$;

revoke all on function public.read_planning_policy_v1(uuid),public.accept_planning_policy_v1(uuid,text),public.withdraw_planning_policy_v1(uuid),
  public.submit_planning_comparison_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb)
  from public,anon,service_role;
grant execute on function public.read_planning_policy_v1(uuid),public.accept_planning_policy_v1(uuid,text),public.withdraw_planning_policy_v1(uuid),
  public.submit_planning_comparison_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb)
  to authenticated;

-- Preserve the exact existing text/task/grounded claim contract. Only rows
-- atomically marked planning are removed from their candidate sets.
create or replace function turn_private.claim_text_mode(p_owner_id uuid,p_policy_id uuid,p_context_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; c turn_private.text_content%rowtype; turn_state text;
begin
  if p_owner_id is null or p_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  for candidate in
    select q.turn_id,q.owner_id,q.session_id from turn_private.work q
    join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
    join turn_private.text_policies p on p.id=x.policy_id
    join turn_private.text_consents s on s.owner_id=x.owner_id and s.policy_id=x.policy_id and s.consent_id=x.consent_id
    where q.owner_id=p_owner_id and q.execution_mode='text' and x.policy_id=p_policy_id and x.hidden_at is null and p.context_mode=p_context_mode
      and p.revoked_at is null and p.effective_at<=clock_timestamp()
      and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and s.revoked_at is null
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null
        where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id and owner_id=p_owner_id for update;
    if not found or w.execution_mode<>'text' or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select * into c from turn_private.text_content where turn_id=w.turn_id and owner_id=p_owner_id and policy_id=p_policy_id and hidden_at is null;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    perform 1 from turn_private.text_consents where owner_id=p_owner_id and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null for share;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $$;

create or replace function public.claim_turn_work()
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; turn_state text;
begin
  for candidate in select turn_id,owner_id,session_id from turn_private.work q
    where q.execution_mode='text' and (state='queued' or (state='leased' and expires_at<=clock_timestamp()))
      and not exists(select 1 from turn_private.text_content c join turn_private.text_policies p on p.id=c.policy_id
        where c.turn_id=q.turn_id and p.context_mode in ('task_history_v1','knowledge_intent_v1')) order by created_at,turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id for update;
    if not found or w.execution_mode<>'text' or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond' where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $$;

create or replace function public.read_text_work(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype; p turn_private.text_policies%rowtype; history jsonb; payload jsonb;
begin
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode='planning_comparison_v1')
    then return jsonb_build_object('kind','blocked'); end if;
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  select * into p from turn_private.text_policies where id=c.policy_id;
  if p.context_mode='knowledge_intent_v1' then return jsonb_build_object('kind','blocked'); end if;
  if p.context_mode='task_history_v1' then
    history:=turn_private.task_history(p_turn_id);
    if history is null then return jsonb_build_object('kind','blocked'); end if;
    payload:=jsonb_build_object('kind','task_input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint,'history',history);
    return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(payload::text,'UTF8')),'hex'));
  end if;
  return jsonb_build_object('kind','input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint);
end $$;

create or replace function public.authorize_text_dispatch(p_turn_id uuid,p_lease_token uuid,p_policy_id uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype;
begin
  if exists(select 1 from turn_private.work where turn_id=p_turn_id and execution_mode='planning_comparison_v1')
    then return jsonb_build_object('kind','blocked'); end if;
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  if c.policy_id is distinct from p_policy_id or not exists(select 1 from turn_private.text_policies where id=p_policy_id and provider=p_provider and context_mode='current_input_v1') then return jsonb_build_object('kind','blocked'); end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','authorized');
end $$;

-- Preserve original grants after CREATE OR REPLACE. Private claimer stays
-- unreachable to service_role directly; public worker RPCs stay service-only.
revoke all on function turn_private.claim_text_mode(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.claim_turn_work(),public.read_text_work(uuid,uuid),public.authorize_text_dispatch(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_turn_work(),public.read_text_work(uuid,uuid),public.authorize_text_dispatch(uuid,uuid,uuid,text) to service_role;

-- The #571 action basis now also includes this mode's separate purpose and
-- recipient consent. Old action rows without a planning job keep their v1 path.
create or replace function turn_private.planning_action_basis(
  p_turn_id uuid,p_owner_id uuid,p_message_id uuid,p_memory_basis jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare source turn_private.assistant_messages%rowtype;
  task turn_private.service_tasks%rowtype; goal turn_private.assistant_goals%rowtype;
  job turn_private.planning_comparisons%rowtype; memory jsonb; ids text[]:=array[]::text[];
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
  select * into job from turn_private.planning_comparisons where turn_id=p_turn_id and owner_id=p_owner_id;
  if found and (job.state<>'queued' or job.task_id<>task.id or job.message_id<>source.id or job.goal_id<>goal.id
    or job.goal_version<>goal.scope_version or job.memory_basis<>p_memory_basis
    or not turn_private.planning_policy_current(job.planning_policy_id)
    or not exists(select 1 from turn_private.planning_consents c where c.owner_id=p_owner_id and c.policy_id=job.planning_policy_id
      and c.consent_id=job.planning_consent_id and c.revoked_at is null)) then return null; end if;
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

-- This is the same existing work/lease and max-attempt counter, with a
-- disjoint candidate predicate. Waiting/unknown releases the lease and is
-- removed from this claim set until a separately authorized reconciliation.
create function public.claim_planning_comparison_work_v1(p_owner_id uuid,p_planning_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; job turn_private.planning_comparisons%rowtype;
begin
  if (select auth.role())<>'service_role' or p_owner_id is null or p_planning_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  for candidate in select q.turn_id,q.owner_id,q.session_id from turn_private.work q
    join turn_private.planning_comparisons j on j.turn_id=q.turn_id and j.owner_id=q.owner_id
    where q.owner_id=p_owner_id and q.execution_mode='planning_comparison_v1'
      and j.planning_policy_id=p_planning_policy_id and j.state='queued'
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    -- Capacity admission, cancellation and completion all take this owner
    -- advisory lock before the Turn. Match their lock order here too.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate.owner_id::text,34));
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id=candidate.turn_id and state in ('queued','leased');
      update turn_private.service_task_capacity set state='released',released_at=clock_timestamp()
        where task_id=(select task_id from turn_private.planning_comparisons where turn_id=candidate.turn_id) and state='reserved';
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id for update;
    select * into job from turn_private.planning_comparisons where turn_id=candidate.turn_id for update;
    if not found or job.state<>'queued' or w.execution_mode<>'planning_comparison_v1'
      or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp())
      then return jsonb_build_object('kind','empty'); end if;
    if not exists(select 1 from public.turns where id=w.turn_id and owner_id=w.owner_id and status='accepted')
      then update turn_private.service_task_capacity set state='released',released_at=clock_timestamp()
          where task_id=job.task_id and state='reserved';
        perform turn_private.terminal(w.turn_id,'cancelled',w.attempt);
        return jsonb_build_object('kind','empty'); end if;
    if not turn_private.planning_policy_current(job.planning_policy_id)
      or not exists(select 1 from turn_private.planning_consents c where c.owner_id=w.owner_id and c.policy_id=job.planning_policy_id
        and c.consent_id=job.planning_consent_id and c.revoked_at is null)
      then update turn_private.planning_comparisons set state='paused_unknown' where turn_id=w.turn_id;
        update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=w.turn_id;
        return jsonb_build_object('kind','empty'); end if;
    -- Any prior non-released model attempt without an artifact may have been
    -- charged even when its process lost the validated output. Reconcile it;
    -- never start another paid call merely because the work lease expired.
    if exists(select 1 from public.model_budget_attempts a where a.task_id=job.task_id and a.status in ('dispatched','pending','settled'))
      or exists(select 1 from turn_private.planning_action_receipts a where a.turn_id=w.turn_id and a.state in ('started','unknown'))
      then update turn_private.planning_comparisons set state='paused_unknown' where turn_id=w.turn_id;
        update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=w.turn_id;
        return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then
      update turn_private.service_task_capacity set state='released',released_at=clock_timestamp()
        where task_id=job.task_id and state='reserved';
      perform turn_private.terminal(w.turn_id,'quarantined',w.attempt);
      return jsonb_build_object('kind','empty');
    end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $$;
revoke all on function public.claim_planning_comparison_work_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_planning_comparison_work_v1(uuid,uuid) to service_role;

create function public.read_planning_comparison_work_v1(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; j turn_private.planning_comparisons%rowtype;
  s turn_private.service_tasks%rowtype; g turn_private.assistant_goals%rowtype;
  m turn_private.assistant_messages%rowtype; p turn_private.planning_policies%rowtype;
  t turn_private.text_policies%rowtype; basis text; item jsonb; profile public.memory_profiles%rowtype;
  memories jsonb:='[]'::jsonb; payload jsonb;
begin
  if (select auth.role())<>'service_role' or p_turn_id is null or p_lease_token is null then raise exception 'INVALID_INPUT'; end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  if not found or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','blocked'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if w.execution_mode<>'planning_comparison_v1' or w.state<>'leased' or w.lease_token is distinct from p_lease_token
    or w.expires_at<=clock_timestamp() or not exists(select 1 from public.turns where id=p_turn_id and owner_id=w.owner_id and status='accepted')
    then return jsonb_build_object('kind','blocked'); end if;
  select * into j from turn_private.planning_comparisons where turn_id=p_turn_id and owner_id=w.owner_id and state='queued';
  if not found then return jsonb_build_object('kind','blocked'); end if;
  basis:=turn_private.planning_action_basis(p_turn_id,w.owner_id,j.message_id,j.memory_basis);
  if basis is null then return jsonb_build_object('kind','stale_basis'); end if;
  select * into s from turn_private.service_tasks where id=j.task_id and owner_id=w.owner_id;
  select * into g from turn_private.assistant_goals where id=j.goal_id and owner_id=w.owner_id;
  select * into m from turn_private.assistant_messages where id=j.message_id and owner_id=w.owner_id;
  select * into p from turn_private.planning_policies where id=j.planning_policy_id;
  select * into t from turn_private.text_policies where id=p.text_policy_id;
  if s.id is null or g.id is null or m.id is null or p.id is null or t.id is null or t.id<>s.policy_id
    then return jsonb_build_object('kind','blocked'); end if;
  for item in select value from jsonb_array_elements(j.memory_basis) loop
    select * into profile from public.memory_profiles where id=(item->>'id')::uuid and owner_id=w.owner_id
      and revision=(item->>'revision')::bigint and state in ('explicit','confirmed') and summary is not null;
    if not found then return jsonb_build_object('kind','stale_basis'); end if;
    memories:=memories||jsonb_build_array(jsonb_build_object('id',profile.id,'revision',profile.revision,
      'constraintKind',profile.constraint_kind,'summary',profile.summary,'state',profile.state,
      'sourceReceiptId',profile.source_receipt_id,'consentId',profile.consent_id,
      'consentStatus','granted','updatedAt',profile.updated_at));
  end loop;
  payload:=jsonb_build_object('kind','planning_input','turnId',w.turn_id,'ownerId',w.owner_id,
    'taskId',j.task_id,'conversationId',m.conversation_id,'goalId',j.goal_id,'goalVersion',j.goal_version,'messageId',j.message_id,
    'messageSequence',m.sequence,'policyId',p.id,'provider',t.provider,'endpoint',t.endpoint,
    'locale',m.locale,'goalText',g.current_text,'messageText',m.input_text,'memories',memories,
    'memoryBasis',j.memory_basis,'artifactId',j.artifact_id);
  return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(payload::text,'UTF8')),'hex'));
end $$;

create function public.authorize_planning_read_v1(p_turn_id uuid,p_lease_token uuid,p_context_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
  if (select auth.role())<>'service_role' or p_context_digest !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
  payload:=public.read_planning_comparison_work_v1(p_turn_id,p_lease_token);
  if payload->>'kind'<>'planning_input' or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked'); end if;
  return jsonb_build_object('kind','authorized');
end $$;

-- Provider egress additionally requires one already-dispatched, owner-bound
-- durable budget attempt. Its exact context is rebuilt under the current lease
-- immediately before the request. The dispatch receipt is also needed for the
-- existing atomic text/capacity terminal path used by final publication.
create function public.authorize_planning_dispatch_v1(
  p_turn_id uuid,p_lease_token uuid,p_context_digest text,p_scope_id uuid,p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb; w turn_private.work%rowtype; c turn_private.text_content%rowtype; j turn_private.planning_comparisons%rowtype;
begin
  if (select auth.role())<>'service_role' or p_context_digest !~ '^[a-f0-9]{64}$'
    or p_scope_id is null or p_attempt_id is null then raise exception 'INVALID_INPUT'; end if;
  payload:=public.read_planning_comparison_work_v1(p_turn_id,p_lease_token);
  if payload->>'kind'<>'planning_input' or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  select * into j from turn_private.planning_comparisons where turn_id=p_turn_id;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  if not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes s on s.id=a.scope_id
    where a.scope_id=p_scope_id and a.attempt_id=p_attempt_id and a.task_id=j.task_id and a.status='dispatched'
      and s.owner_id=w.owner_id and a.provider=payload->>'provider' and s.enabled and not s.frozen and s.expires_at>clock_timestamp())
    then return jsonb_build_object('kind','blocked'); end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id)
    values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
  if not found then return jsonb_build_object('kind','blocked'); end if;
  insert into turn_private.planning_model_dispatches(lease_token,turn_id,owner_id,task_id,scope_id,attempt_id)
    values(p_lease_token,p_turn_id,w.owner_id,j.task_id,p_scope_id,p_attempt_id) on conflict do nothing;
  if not found then raise exception 'DISPATCH_CONFLICT'; end if;
  return jsonb_build_object('kind','authorized');
end $$;

create function public.pause_planning_comparison_v1(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;
begin
  if (select auth.role())<>'service_role' or p_turn_id is null or p_lease_token is null then raise exception 'INVALID_INPUT'; end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  if not found or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','stale'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if w.state<>'leased' or w.lease_token is distinct from p_lease_token or w.expires_at<=clock_timestamp()
    or w.execution_mode<>'planning_comparison_v1' then return jsonb_build_object('kind','stale'); end if;
  update turn_private.planning_comparisons set state='paused_unknown' where turn_id=p_turn_id and state='queued';
  update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=p_turn_id;
  return jsonb_build_object('kind','paused_unknown');
end $$;

revoke all on function public.read_planning_comparison_work_v1(uuid,uuid),public.authorize_planning_read_v1(uuid,uuid,text),
  public.authorize_planning_dispatch_v1(uuid,uuid,text,uuid,uuid),public.pause_planning_comparison_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.read_planning_comparison_work_v1(uuid,uuid),public.authorize_planning_read_v1(uuid,uuid,text),
  public.authorize_planning_dispatch_v1(uuid,uuid,text,uuid,uuid),public.pause_planning_comparison_v1(uuid,uuid)
  to service_role;

-- Checkpoints and action receipts commit together. A restarted process can
-- reuse a completed validated observation; a started/unknown action cannot be
-- replayed merely because its original process disappeared.
create table turn_private.planning_observations (
  turn_id uuid not null,
  action_key text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  observation jsonb not null check(octet_length(observation::text)<=8192),
  created_at timestamptz not null default clock_timestamp(),
  primary key(turn_id,action_key),
  foreign key(turn_id,action_key) references turn_private.planning_action_receipts(turn_id,action_key) on delete cascade
);
alter table turn_private.planning_observations enable row level security;
revoke all on turn_private.planning_observations from public,anon,authenticated,service_role;

create function turn_private.valid_planning_observation_v1(p_tool_id text,p_value jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare area jsonb; seen text[]:=array[]::text[];
begin
  if p_value is null or jsonb_typeof(p_value)<>'object' then return false; end if;
  if p_tool_id='evidence.lookup' then
    return p_value ?& array['schemaVersion','coverage'] and p_value-'schemaVersion'-'coverage'='{}'::jsonb
      and p_value->>'schemaVersion'='planning-evidence/1' and p_value->>'coverage'='no_qualified_area_evidence';
  elsif p_tool_id='place.read' then
    if not (p_value ?& array['schemaVersion','source','observedAt','providerCalls','areas'])
      or p_value-'schemaVersion'-'source'-'observedAt'-'providerCalls'-'areas'<>'{}'::jsonb
      or p_value->>'schemaVersion'<>'planning-place/1'
      or p_value->>'source' not in ('amap','synthetic_fixture')
      or jsonb_typeof(p_value->'providerCalls')<>'number' or (p_value->>'providerCalls') !~ '^[0-9]{1,2}$'
      or (p_value->>'providerCalls')::integer>13
      or p_value->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
      or jsonb_typeof(p_value->'areas')<>'array' or jsonb_array_length(p_value->'areas')<>2 then return false; end if;
    for area in select value from jsonb_array_elements(p_value->'areas') loop
      if not (area ?& array['id','label','railMinutes','transfers']) or area-'id'-'label'-'railMinutes'-'transfers'<>'{}'::jsonb
        or area->>'id' not in ('jingan','peoples_square') or area->>'id'=any(seen)
        or jsonb_typeof(area->'label')<>'string' or length(btrim(area->>'label')) not between 1 and 80
        or (area->'railMinutes'<>'null'::jsonb and (jsonb_typeof(area->'railMinutes')<>'number' or (area->>'railMinutes') !~ '^[0-9]{1,3}$' or (area->>'railMinutes')::integer>180))
        or (area->'transfers'<>'null'::jsonb and (jsonb_typeof(area->'transfers')<>'number' or (area->>'transfers') !~ '^[0-9]$' or (area->>'transfers')::integer>5))
        then return false; end if;
      seen:=array_append(seen,area->>'id');
    end loop;
    return true;
  elsif p_tool_id='constraints.evaluate' then
    return p_value ?& array['schemaVersion','fasterAreaId','hotelPrice','availability']
      and p_value-'schemaVersion'-'fasterAreaId'-'hotelPrice'-'availability'='{}'::jsonb
      and p_value->>'schemaVersion'='planning-constraints/1'
      and (p_value->'fasterAreaId'='null'::jsonb or p_value->>'fasterAreaId' in ('jingan','peoples_square'))
      and p_value->>'hotelPrice'='unknown' and p_value->>'availability'='unknown';
  end if;
  return false;
exception when others then return false;
end $$;
revoke all on function turn_private.valid_planning_observation_v1(text,jsonb) from public,anon,authenticated,service_role;

create function public.complete_planning_observation_v1(
  p_turn_id uuid,p_owner_id uuid,p_lease_token uuid,p_action_key text,p_observation jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; a turn_private.planning_action_receipts%rowtype; existing turn_private.planning_observations%rowtype;
  policy_environment text; digest text;
begin
  if (select auth.role())<>'service_role' or p_turn_id is null or p_owner_id is null or p_lease_token is null
    or p_action_key !~ '^[a-f0-9]{64}$' or p_observation is null or octet_length(p_observation::text)>8192
    then raise exception 'INVALID_INPUT'; end if;
  select * into w from turn_private.work where turn_id=p_turn_id and owner_id=p_owner_id;
  if not found or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return jsonb_build_object('kind','stale'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id for update;
  if w.execution_mode<>'planning_comparison_v1' or w.state<>'leased' or w.lease_token is distinct from p_lease_token or w.expires_at<=clock_timestamp()
    then return jsonb_build_object('kind','stale'); end if;
  select * into a from turn_private.planning_action_receipts where turn_id=p_turn_id and action_key=p_action_key for update;
  if not found or a.owner_id<>p_owner_id or a.lease_token<>p_lease_token or not turn_private.valid_planning_observation_v1(a.tool_id,p_observation)
    then return jsonb_build_object('kind','blocked'); end if;
  if a.tool_id='place.read' then
    select p.environment into policy_environment from turn_private.planning_comparisons j
      join turn_private.planning_policies p on p.id=j.planning_policy_id where j.turn_id=p_turn_id;
    if policy_environment is null or (p_observation->>'source'='synthetic_fixture') is distinct from (policy_environment='local_synthetic')
      then return jsonb_build_object('kind','blocked'); end if;
  end if;
  if turn_private.planning_action_basis(p_turn_id,p_owner_id,a.message_id,a.memory_basis) is distinct from a.basis_digest
    then return jsonb_build_object('kind','stale_basis'); end if;
  digest:=encode(pg_catalog.sha256(convert_to(p_observation::text,'UTF8')),'hex');
  if a.state='completed' then
    select * into existing from turn_private.planning_observations where turn_id=p_turn_id and action_key=p_action_key;
    return jsonb_build_object('kind',case when a.receipt_digest=digest and existing.observation=p_observation then 'duplicate' else 'conflict' end);
  end if;
  if a.state<>'started' then return jsonb_build_object('kind','unknown'); end if;
  insert into turn_private.planning_observations(turn_id,action_key,owner_id,observation)
    values(p_turn_id,p_action_key,p_owner_id,p_observation);
  update turn_private.planning_action_receipts set state='completed',receipt_digest=digest,updated_at=clock_timestamp()
    where turn_id=p_turn_id and action_key=p_action_key;
  return jsonb_build_object('kind','completed','receiptDigest',digest);
end $$;

create function public.read_planning_observations_v1(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare input jsonb; observations jsonb;
begin
  if (select auth.role())<>'service_role' then raise exception 'FORBIDDEN'; end if;
  input:=public.read_planning_comparison_work_v1(p_turn_id,p_lease_token);
  if input->>'kind'<>'planning_input' then return jsonb_build_object('kind','blocked'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('toolId',a.tool_id,'actionKey',a.action_key,
      'receiptDigest',a.receipt_digest,'observation',o.observation) order by a.created_at,a.action_key),'[]'::jsonb)
    into observations from turn_private.planning_action_receipts a
    join turn_private.planning_observations o on o.turn_id=a.turn_id and o.action_key=a.action_key
    where a.turn_id=p_turn_id and a.state='completed';
  return jsonb_build_object('kind','observations','items',observations,'contextDigest',input->>'contextDigest');
end $$;
revoke all on function public.complete_planning_observation_v1(uuid,uuid,uuid,text,jsonb),public.read_planning_observations_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_planning_observation_v1(uuid,uuid,uuid,text,jsonb),public.read_planning_observations_v1(uuid,uuid) to service_role;

-- Exact factual renderer contract: the stored comparison must be a pure
-- projection of the validated place checkpoint. Model output can reorder the
-- two options, never add a hotel claim, inventory, URL or Trip action.
create function turn_private.valid_planning_comparison_v1(p_content jsonb,p_place jsonb,p_locale text)
returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; option jsonb; expected jsonb:='[]'::jsonb; tradeoff text; title text; summary text;
begin
  if not turn_private.valid_comparison_v1(p_content) or not turn_private.valid_planning_observation_v1('place.read',p_place)
    or p_locale not in ('zh','en') then return false; end if;
  title:=case when p_locale='zh' then
    case when p_place->>'source'='synthetic_fixture' then '合成样例：上海住宿区域比较' else '上海住宿区域比较' end
    else case when p_place->>'source'='synthetic_fixture' then 'Synthetic fixture: Shanghai stay-area comparison' else 'Shanghai stay-area comparison' end end;
  summary:=case when p_locale='zh' then '仅比较到上海站的当前交通观察；酒店库存、价格与区域适住性尚未核实。'
    else 'This compares current rail access to Shanghai Railway Station only. Hotel inventory, price and area suitability are unverified.' end;
  if p_content->>'title'<>title or p_content->>'summary'<>summary then return false; end if;
  for item in select value from jsonb_array_elements(p_place->'areas') loop
    if p_locale='zh' then
      tradeoff:=case when item->'railMinutes'='null'::jsonb then '到上海站的交通时间未知；酒店价格和空房未知。'
        else format('到上海站约 %s 分钟、%s 次换乘；酒店价格和空房未知。',item->>'railMinutes',coalesce(item->>'transfers','未知')) end;
    else
      tradeoff:=case when item->'railMinutes'='null'::jsonb then 'Travel time to Shanghai Railway Station is unknown; hotel price and availability are unknown.'
        else format('About %s minutes and %s %s to Shanghai Railway Station; hotel price and availability are unknown.',
          item->>'railMinutes',coalesce(item->>'transfers','unknown'),case when item->>'transfers'='1' then 'transfer' else 'transfers' end) end;
    end if;
    expected:=expected||jsonb_build_array(jsonb_build_object('id',item->>'id','title',item->>'label','tradeoff',tradeoff));
  end loop;
  return (p_content->'options'=expected or p_content->'options'=jsonb_build_array(expected->1,expected->0));
exception when others then return false;
end $$;
revoke all on function turn_private.valid_planning_comparison_v1(jsonb,jsonb,text) from public,anon,authenticated,service_role;

-- One transaction makes the existing text Turn/capacity terminal, publishes
-- comparison/1 and its result event, and acknowledges the final action. A
-- stale basis or failed publication rolls every one of those changes back.
create function public.complete_planning_comparison_v1(
  p_turn_id uuid,p_owner_id uuid,p_lease_token uuid,p_result_action_key text,
  p_model_attempt_id uuid,p_text text,p_content jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; published jsonb; j turn_private.planning_comparisons%rowtype;
  a turn_private.planning_action_receipts%rowtype; basis text; digest text; tools text[]; place jsonb; content_locale text;
begin
  if (select auth.role())<>'service_role' or p_turn_id is null or p_owner_id is null or p_lease_token is null
    or p_result_action_key !~ '^[a-f0-9]{64}$' or p_model_attempt_id is null
    or not turn_private.valid_text(p_text,8000) or not turn_private.valid_comparison_v1(p_content)
    or (select count(*) from jsonb_array_elements(p_content->'options') o where o->>'id' in ('jingan','peoples_square'))<>2
    or (select count(distinct o->>'id') from jsonb_array_elements(p_content->'options') o)<>2
    then raise exception 'INVALID_INPUT'; end if;
  select o.observation into place from turn_private.planning_action_receipts x
    join turn_private.planning_observations o on o.turn_id=x.turn_id and o.action_key=x.action_key
    where x.turn_id=p_turn_id and x.tool_id='place.read' and x.state='completed';
  select m.locale into content_locale from turn_private.planning_comparisons job_row
    join turn_private.assistant_messages m on m.id=job_row.message_id where job_row.turn_id=p_turn_id and job_row.owner_id=p_owner_id;
  if place is null or not turn_private.valid_planning_comparison_v1(p_content,place,content_locale)
    or (place->>'observedAt')::timestamptz>clock_timestamp()+interval '5 seconds'
    or (place->>'observedAt')::timestamptz<clock_timestamp()-interval '5 minutes'
    then raise exception 'INVALID_INPUT'; end if;
  -- The existing wrapper owns the task-capacity lock order and only returns
  -- finished for a current authorized lease with a dispatch receipt.
  result:=public.complete_text_work(p_turn_id,p_lease_token,'answered',p_text);
  if result->>'kind'<>'finished' then return jsonb_build_object('kind','stale'); end if;
  select * into j from turn_private.planning_comparisons where turn_id=p_turn_id and owner_id=p_owner_id for update;
  if not found or j.state<>'queued' or not turn_private.planning_policy_current(j.planning_policy_id)
    or not exists(select 1 from turn_private.planning_consents c where c.owner_id=p_owner_id and c.policy_id=j.planning_policy_id
      and c.consent_id=j.planning_consent_id and c.revoked_at is null)
    then raise exception 'STALE_BASIS'; end if;
  basis:=turn_private.planning_action_basis(p_turn_id,p_owner_id,j.message_id,j.memory_basis);
  select * into a from turn_private.planning_action_receipts where turn_id=p_turn_id and action_key=p_result_action_key for update;
  if basis is null or not found or a.owner_id<>p_owner_id or a.task_id<>j.task_id or a.message_id<>j.message_id
    or a.lease_token<>p_lease_token or a.tool_id<>'result.prepare' or a.state<>'started' or a.basis_digest<>basis
    then raise exception 'STALE_BASIS'; end if;
  select array_agg(distinct x.tool_id order by x.tool_id) into tools from turn_private.planning_action_receipts x
    join turn_private.planning_observations o on o.turn_id=x.turn_id and o.action_key=x.action_key
    where x.turn_id=p_turn_id and x.state='completed';
  if tools is distinct from array['constraints.evaluate','evidence.lookup','place.read']::text[]
    or not exists(select 1 from turn_private.planning_model_dispatches d where d.lease_token=p_lease_token
      and d.turn_id=p_turn_id and d.owner_id=p_owner_id and d.task_id=j.task_id and d.attempt_id=p_model_attempt_id)
    or not exists(select 1 from public.model_budget_attempts b join public.model_budget_scopes s on s.id=b.scope_id
      where b.attempt_id=p_model_attempt_id and b.task_id=j.task_id and b.status='settled'
        and b.actual_micros is not null and s.owner_id=p_owner_id and b.created_at>=j.created_at)
    then raise exception 'PLANNING_INCOMPLETE'; end if;
  published:=public.publish_comparison_result_v1(p_owner_id,j.artifact_id,0,j.publication_key,
    j.task_id,j.goal_id,j.message_id,null,null,j.goal_version,j.memory_basis,p_content);
  if published->>'kind'<>'published' or published->>'reused'<>'false' then raise exception 'PLANNING_INCOMPLETE'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(p_content::text,'UTF8')),'hex');
  update turn_private.planning_action_receipts set state='completed',receipt_digest=digest,updated_at=clock_timestamp()
    where turn_id=p_turn_id and action_key=p_result_action_key;
  update turn_private.planning_comparisons set state='completed' where turn_id=p_turn_id;
  return jsonb_build_object('kind','published','artifactId',j.artifact_id,'revision',1);
end $$;
revoke all on function public.complete_planning_comparison_v1(uuid,uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_planning_comparison_v1(uuid,uuid,uuid,text,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
