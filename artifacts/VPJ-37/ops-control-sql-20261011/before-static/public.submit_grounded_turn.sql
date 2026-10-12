create function public.submit_grounded_turn(
  p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,
  p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid,p_city text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  s turn_private.service_tasks%rowtype; prior turn_private.service_task_turns%rowtype;
  parent turn_private.text_content%rowtype; digest text; result jsonb;
begin
  if p_city is null or p_city not in ('shanghai','beijing','guangzhou','chongqing') or p_locale is null or p_locale not in ('zh','en') then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='knowledge_intent_v1') then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if p_thread_id is null or p_turn_id is null or p_task_id is null or p_turn_id=p_task_id
    or p_idempotency_key is null or p_scope_version is distinct from 1
    or p_relationship is null or p_relationship not in ('new_goal','clarification','repair')
    or ((p_relationship='new_goal') is distinct from (p_parent_turn_id is null))
    or p_locale is null or p_locale not in ('zh','en','es','ru','ar')
    or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,p_scope_version,p_relationship,p_parent_turn_id,p_city)::text,'UTF8')),'hex');
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
      or s.scope_version<>p_scope_version or s.expected_result<>'reviewed_answer' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
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
    if (select count(*) from turn_private.service_task_turns where task_id=s.id)>=4 then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if not exists(select 1 from turn_private.grounded_turns g where g.turn_id=s.goal_turn_id and g.city=p_city and g.locale=p_locale) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
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
    insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,expected_result,goal_digest)
      values(p_task_id,u,p_thread_id,p_turn_id,p_turn_id,p_policy_id,c.consent_id,p_scope_version,'reviewed_answer',
        encode(pg_catalog.sha256(convert_to(p_text,'UTF8')),'hex'));
  end if;
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)
    or exists(select 1 from public.turns where id=p_turn_id)
    or exists(select 1 from turn_private.text_content where turn_id=p_turn_id)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
    values(p_turn_id,p_task_id,u,p_parent_turn_id,p_relationship,p_idempotency_key,digest);
  insert into turn_private.grounded_turns(turn_id,owner_id,task_id,city,locale) values(p_turn_id,u,p_task_id,p_city,p_locale);
  result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
  if result->>'kind'<>'accepted' or result->>'reused'<>'false' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.service_tasks set last_turn_id=p_turn_id where id=p_task_id;
  return result||jsonb_build_object('serviceTaskId',p_task_id,'scopeVersion',p_scope_version,'relationship',p_relationship,'parentTurnId',p_parent_turn_id);
end $$;
