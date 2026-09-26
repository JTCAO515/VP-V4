-- VPJ-78 first slice: owner-scoped conversation intake and versioned goal membership.
-- These records never schedule work. Only an independent question explicitly starts
-- the existing text Turn; goal edits and follow-ups are record-only.
create table turn_private.assistant_conversations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null,
  next_sequence bigint not null default 1 check(next_sequence between 1 and 1000001),
  created_at timestamptz not null default clock_timestamp()
);
create index assistant_conversations_owner_created on turn_private.assistant_conversations(owner_id,created_at desc);

create table turn_private.assistant_goals (
  id uuid primary key,
  conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_version integer not null default 1 check(scope_version between 1 and 10000),
  current_text text not null check(turn_private.valid_text(current_text,4000)),
  created_at timestamptz not null default clock_timestamp()
);
create index assistant_goals_conversation on turn_private.assistant_goals(conversation_id);

create table turn_private.assistant_messages (
  id uuid primary key,
  conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sequence bigint not null,
  idempotency_key uuid not null,
  request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
  policy_id uuid not null references turn_private.text_policies(id),
  consent_id uuid not null,
  locale text not null check(locale in ('zh','en')),
  input_text text not null check(turn_private.valid_text(input_text,4000)),
  relationship text not null check(relationship in ('independent_question','goal_start','follow_up','amendment','clarification')),
  goal_id uuid references turn_private.assistant_goals(id),
  scope_version integer,
  task_id uuid references turn_private.service_tasks(id),
  parent_message_id uuid references turn_private.assistant_messages(id),
  turn_id uuid references turn_private.text_content(turn_id),
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id,sequence),
  unique(owner_id,idempotency_key),
  check((relationship='independent_question')=(turn_id is not null)),
  check((goal_id is null)=(scope_version is null))
);
create index assistant_messages_conversation_sequence on turn_private.assistant_messages(conversation_id,sequence desc);
create index assistant_messages_goal on turn_private.assistant_messages(goal_id,sequence desc) where goal_id is not null;
create index assistant_messages_task on turn_private.assistant_messages(task_id) where task_id is not null;

alter table turn_private.assistant_conversations enable row level security;
alter table turn_private.assistant_goals enable row level security;
alter table turn_private.assistant_messages enable row level security;
revoke all on turn_private.assistant_conversations,turn_private.assistant_goals,turn_private.assistant_messages from public,anon,authenticated,service_role;

create function public.submit_assistant_message_v1(
  p_conversation_id uuid,p_message_id uuid,p_idempotency_key uuid,p_policy_id uuid,
  p_locale text,p_text text,p_relationship text,p_goal_id uuid,
  p_expected_goal_version integer,p_task_id uuid,p_parent_message_id uuid,p_turn_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  conversation turn_private.assistant_conversations%rowtype;
  goal turn_private.assistant_goals%rowtype; prior turn_private.assistant_messages%rowtype;
  parent turn_private.assistant_messages%rowtype; task turn_private.service_tasks%rowtype;
  digest text; assigned_version integer; accepted jsonb;
begin
  if p_conversation_id is null or p_message_id is null or p_idempotency_key is null
    or p_policy_id is null or p_locale is null or p_locale not in ('zh','en') or not turn_private.valid_text(p_text,4000)
    or p_relationship is null or p_relationship not in ('independent_question','goal_start','follow_up','amendment','clarification')
    or (p_relationship='independent_question') is distinct from (p_turn_id is not null)
    or (p_relationship='goal_start' and (p_goal_id is null or p_expected_goal_version is not null or p_task_id is not null or p_parent_message_id is not null))
    or (p_relationship='independent_question' and (p_goal_id is not null or p_expected_goal_version is not null or p_task_id is not null or p_parent_message_id is not null))
    or (p_relationship in ('follow_up','amendment','clarification') and (p_goal_id is null or p_expected_goal_version is null or p_expected_goal_version<1 or p_parent_message_id is null))
    or (p_relationship='clarification' and p_task_id is not null)
    then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id)
    or exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='knowledge_intent_v1')
    then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_conversation_id,p_message_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_relationship,p_goal_id,p_expected_goal_version,p_task_id,p_parent_message_id,p_turn_id)::text,'UTF8')),'hex');
  -- Serialize the idempotency key before conversation creation to reject cross-conversation races.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-message:'||u::text||':'||p_idempotency_key::text,0));
  select * into prior from turn_private.assistant_messages where owner_id=u and idempotency_key=p_idempotency_key;
  if found then
    if prior.request_digest<>digest or prior.id<>p_message_id then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    if not exists(select 1 from turn_private.assistant_conversations where id=prior.conversation_id and owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
    return jsonb_build_object('kind','accepted','conversationId',prior.conversation_id,'messageId',prior.id,'sequence',prior.sequence,'goalId',prior.goal_id,'scopeVersion',prior.scope_version,'turnId',prior.turn_id,'reused',true);
  end if;
  if p_relationship in ('independent_question','goal_start') then
    insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id)
      values(p_conversation_id,u,p_policy_id,c.consent_id) on conflict do nothing;
  end if;
  select * into conversation from turn_private.assistant_conversations where id=p_conversation_id for update;
  if not found or conversation.owner_id<>u then raise exception 'FORBIDDEN'; end if;
  if conversation.policy_id<>p_policy_id or conversation.consent_id<>c.consent_id then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if conversation.next_sequence>1000000 then raise exception 'SERVICE_TASK_CAPACITY_EXHAUSTED'; end if;
  if p_relationship='goal_start' then
    if (select count(*) from turn_private.assistant_goals where conversation_id=p_conversation_id)>=100
      then raise exception 'SERVICE_TASK_CAPACITY_EXHAUSTED'; end if;
    insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text)
      values(p_goal_id,p_conversation_id,u,p_text);
    assigned_version:=1;
  elsif p_goal_id is not null then
    select * into goal from turn_private.assistant_goals where id=p_goal_id for update;
    if not found or goal.owner_id<>u or goal.conversation_id<>p_conversation_id then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if goal.scope_version<>p_expected_goal_version then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    select * into parent from turn_private.assistant_messages where id=p_parent_message_id;
    if not found or parent.owner_id<>u or parent.conversation_id<>p_conversation_id or parent.goal_id<>p_goal_id
      or parent.sequence>=conversation.next_sequence then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if p_relationship='amendment' then
      update turn_private.assistant_goals set scope_version=scope_version+1,current_text=p_text where id=p_goal_id returning scope_version into assigned_version;
    else assigned_version:=goal.scope_version; end if;
  end if;
  if p_task_id is not null then
    select * into task from turn_private.service_tasks where id=p_task_id for update;
    if not found or task.owner_id<>u or not turn_private.text_policy_current(task.policy_id)
      or not exists(select 1 from turn_private.text_consents tc where tc.owner_id=u and tc.policy_id=task.policy_id and tc.consent_id=task.consent_id and tc.revoked_at is null)
      or not exists(select 1 from turn_private.text_content root where root.turn_id=task.goal_turn_id and root.owner_id=u and root.hidden_at is null)
      or p_goal_id is null then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if exists(select 1 from turn_private.assistant_messages linked where linked.task_id=p_task_id
      and (linked.owner_id<>u or linked.goal_id<>p_goal_id or linked.conversation_id<>p_conversation_id))
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  end if;
  if p_relationship='independent_question' then
    -- A separate question uses the existing text worker and ledger exactly once.
    -- Its Turn has its own thread; the conversation is only an owner-scoped projection.
    accepted:=public.submit_text_turn(p_message_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
    if accepted->>'kind'<>'accepted' or accepted->>'reused'<>'false' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  end if;
  insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version,task_id,parent_message_id,turn_id)
    values(p_message_id,p_conversation_id,u,conversation.next_sequence,p_idempotency_key,digest,p_policy_id,c.consent_id,p_locale,p_text,p_relationship,p_goal_id,assigned_version,p_task_id,p_parent_message_id,p_turn_id);
  update turn_private.assistant_conversations set next_sequence=next_sequence+1 where id=p_conversation_id;
  return jsonb_build_object('kind','accepted','conversationId',p_conversation_id,'messageId',p_message_id,'sequence',conversation.next_sequence,'goalId',p_goal_id,'scopeVersion',assigned_version,'turnId',p_turn_id,'reused',false);
end $$;

create function public.read_assistant_conversation_v1(p_policy_id uuid,p_conversation_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  conversation turn_private.assistant_conversations%rowtype; messages jsonb; goals jsonb;
begin
  if p_policy_id is null or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if p_conversation_id is null then
    select * into conversation from turn_private.assistant_conversations where owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id order by created_at desc,id desc limit 1;
  else
    select * into conversation from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id;
  end if;
  if not found then return jsonb_build_object('kind','conversation','conversationId',null,'nextSequence',1,'messages','[]'::jsonb,'goals','[]'::jsonb); end if;
  select coalesce(jsonb_agg(x.item order by x.sequence),'[]'::jsonb) into messages from (
    select m.sequence,jsonb_build_object('messageId',m.id,'sequence',m.sequence,'locale',m.locale,'text',m.input_text,
      'relationship',m.relationship,'goalId',m.goal_id,'scopeVersion',m.scope_version,
      'taskId',case when m.task_id is not null and exists(select 1 from turn_private.service_tasks s
        join turn_private.text_content root on root.turn_id=s.goal_turn_id and root.owner_id=u and root.hidden_at is null
        join turn_private.text_consents tc on tc.owner_id=u and tc.policy_id=s.policy_id and tc.consent_id=s.consent_id and tc.revoked_at is null
        where s.id=m.task_id and s.owner_id=u and turn_private.text_policy_current(s.policy_id)) then m.task_id else null end,
      'parentMessageId',m.parent_message_id,
      'turnId',m.turn_id,'status',case when m.turn_id is null then 'recorded' else t.status end,
      'outcome',tc.output_kind,'output',tc.output_text,'createdAt',m.created_at) item
    from turn_private.assistant_messages m
    left join turn_private.text_content tc on tc.turn_id=m.turn_id and tc.owner_id=u and tc.hidden_at is null
    left join public.turns t on t.id=m.turn_id and t.owner_id=u
    where m.conversation_id=conversation.id and m.owner_id=u and m.policy_id=p_policy_id and m.consent_id=c.consent_id
      and (m.turn_id is null or (tc.turn_id is not null and t.id is not null))
    order by m.sequence desc limit 50
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('goalId',g.id,'scopeVersion',g.scope_version,'text',g.current_text) order by g.created_at,g.id),'[]'::jsonb)
    into goals from turn_private.assistant_goals g where g.conversation_id=conversation.id and g.owner_id=u;
  return jsonb_build_object('kind','conversation','conversationId',conversation.id,'nextSequence',conversation.next_sequence,'messages',messages,'goals',goals);
end $$;

revoke all on function public.submit_assistant_message_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,integer,uuid,uuid,uuid),public.read_assistant_conversation_v1(uuid,uuid) from public,anon,service_role;
grant execute on function public.submit_assistant_message_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,integer,uuid,uuid,uuid),public.read_assistant_conversation_v1(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
