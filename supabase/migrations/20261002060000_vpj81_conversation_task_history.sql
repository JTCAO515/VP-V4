-- Read-only projection of the canonical latest Turn for one authorised membership.
create index assistant_messages_task_membership_window_v1
  on turn_private.assistant_messages(conversation_id,sequence desc) where task_id is not null;
create index assistant_messages_task_membership_latest_v1
  on turn_private.assistant_messages(conversation_id,task_id,sequence desc) where task_id is not null;

create function turn_private.assistant_task_member_v1(p_owner uuid,p_conversation uuid,p_message uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('message',jsonb_build_object(
    'messageId',m.id,'sequence',m.sequence,'locale',m.locale,'text',left(m.input_text,120),
    'relationship',m.relationship,'goalId',m.goal_id,'scopeVersion',m.scope_version,'taskId',s.id,
    'parentMessageId',m.parent_message_id,'turnId',null,'status','recorded','outcome',null,'output',null),
    'turn',jsonb_build_object('turnId',t.id,'serviceTaskId',s.id,'scopeVersion',s.scope_version,
      'relationship',l.relationship,'parentTurnId',l.parent_turn_id,'status',t.status,'outcome',tc.output_kind,
      'goalScopeVersion',m.scope_version,'currentGoalScopeVersion',g.scope_version))
  from turn_private.assistant_messages m
    join turn_private.assistant_conversations a on a.id=m.conversation_id and a.owner_id=p_owner
      and a.policy_id=m.policy_id and a.consent_id=m.consent_id
    join turn_private.text_consents ac on ac.owner_id=p_owner and ac.policy_id=a.policy_id
      and ac.consent_id=a.consent_id and ac.revoked_at is null
    join turn_private.assistant_goals g on g.id=m.goal_id and g.owner_id=p_owner and g.conversation_id=a.id
    join turn_private.service_tasks s on s.id=m.task_id and s.owner_id=p_owner
    join turn_private.text_consents sc on sc.owner_id=p_owner and sc.policy_id=s.policy_id
      and sc.consent_id=s.consent_id and sc.revoked_at is null
    join turn_private.text_content root on root.turn_id=s.goal_turn_id and root.owner_id=p_owner
      and root.thread_id=s.thread_id and root.policy_id=s.policy_id and root.consent_id=s.consent_id and root.hidden_at is null
    join public.turns rt on rt.id=root.turn_id and rt.owner_id=p_owner and rt.thread_id=s.thread_id
    join public.chat_threads h on h.id=s.thread_id and h.owner_id=p_owner and h.status='active'
    join turn_private.text_content tc on tc.turn_id=s.last_turn_id and tc.owner_id=p_owner
      and tc.thread_id=s.thread_id and tc.policy_id=s.policy_id and tc.consent_id=s.consent_id and tc.hidden_at is null
    join public.turns t on t.id=s.last_turn_id and t.owner_id=p_owner and t.thread_id=s.thread_id
    join turn_private.service_task_turns l on l.turn_id=t.id and l.task_id=s.id and l.owner_id=p_owner
  where m.id=p_message and m.owner_id=p_owner and m.conversation_id=p_conversation
    and m.relationship in ('follow_up','amendment') and m.scope_version>0
    and turn_private.text_policy_current(a.policy_id) and turn_private.text_policy_current(s.policy_id)
    and m.sequence=(select latest.sequence from turn_private.assistant_messages latest
      where latest.conversation_id=p_conversation and latest.task_id=s.id order by latest.sequence desc limit 1)
    and ((t.status in ('accepted','planning','retrieving','generating','validating','cancelled') and tc.output_kind is null)
      or (t.status='completed' and tc.output_kind in ('answered','partial','clarification'))
      or (t.status='failed' and (tc.output_kind is null or tc.output_kind='technical_failure'))
      or (t.status='unavailable' and tc.output_kind='blocked'));
$$;
revoke all on function turn_private.assistant_task_member_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.list_assistant_conversation_tasks_v1(p_policy_id uuid,p_conversation_id uuid,p_cursor jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); a turn_private.assistant_conversations%rowtype;
  c turn_private.text_consents%rowtype; anchor turn_private.assistant_messages%rowtype;
  candidate record; item jsonb; messages jsonb:='[]'; turns jsonb:='[]'; next_cursor jsonb:=null;
  examined integer:=0; found_count integer:=0; last_message uuid; before_sequence bigint:=1000001;
begin
  if p_policy_id is null or p_conversation_id is null then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  select * into a from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u
    and policy_id=p_policy_id and consent_id=c.consent_id for share;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object' or (select count(*) from jsonb_object_keys(p_cursor))<>4
      or jsonb_typeof(p_cursor->'version')<>'number' or jsonb_typeof(p_cursor->'conversationSequence')<>'number'
      or jsonb_typeof(p_cursor->'conversationId')<>'string' or jsonb_typeof(p_cursor->'messageId')<>'string'
      or not (p_cursor ?& array['version','conversationId','conversationSequence','messageId'])
      or p_cursor->>'version'<>'1' or p_cursor->>'conversationId'<>a.id::text
      or p_cursor->>'conversationSequence'<>a.next_sequence::text
      or coalesce(p_cursor->>'messageId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then return jsonb_build_object('kind','unavailable'); end if;
    select * into anchor from turn_private.assistant_messages where id=(p_cursor->>'messageId')::uuid
      and conversation_id=a.id and owner_id=u;
    if not found or turn_private.assistant_task_member_v1(u,a.id,anchor.id) is null then
      return jsonb_build_object('kind','unavailable'); end if;
    before_sequence:=anchor.sequence;
  end if;
  for candidate in select id,sequence from turn_private.assistant_messages
    where conversation_id=a.id and task_id is not null and sequence<before_sequence
    order by sequence desc limit 129 loop
    examined:=examined+1;
    if examined>128 then return jsonb_build_object('kind','unavailable'); end if;
    item:=turn_private.assistant_task_member_v1(u,a.id,candidate.id);
    if item is null then continue; end if;
    found_count:=found_count+1;
    if found_count=21 then
      next_cursor:=jsonb_build_object('version',1,'conversationId',a.id,
        'conversationSequence',a.next_sequence,'messageId',last_message);
      exit;
    end if;
    messages:=messages||jsonb_build_array(item->'message'); turns:=turns||jsonb_build_array(item->'turn');
    last_message:=candidate.id;
  end loop;
  return jsonb_build_object('kind','conversation_tasks','conversationId',a.id,'conversationSequence',a.next_sequence,
    'limit',20,'messages',messages,'turns',turns,'nextCursor',next_cursor);
end $$;
revoke all on function public.list_assistant_conversation_tasks_v1(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.list_assistant_conversation_tasks_v1(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
