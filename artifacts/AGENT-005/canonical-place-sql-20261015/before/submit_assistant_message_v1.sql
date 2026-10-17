CREATE OR REPLACE FUNCTION public.submit_assistant_message_v1(p_conversation_id uuid, p_message_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_relationship text, p_goal_id uuid, p_expected_goal_version integer, p_task_id uuid, p_parent_message_id uuid, p_turn_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
