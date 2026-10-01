-- VPJ-78: paginated module export seam for the separately accepted privacy executor.
-- No public export, recipient, request completion or erasure is introduced.
-- Account cascades and retained-text hiding stay intact. Link/receipt payloads
-- preserve the existing assistant-goal-trip-export/1 manifest fields.
create index assistant_conversations_owner_export on turn_private.assistant_conversations(owner_id,id);
create index assistant_goals_owner_export on turn_private.assistant_goals(owner_id,id);
create index assistant_messages_owner_export on turn_private.assistant_messages(owner_id,id);
create index assistant_goal_trip_receipts_owner_export on turn_private.assistant_goal_trip_receipts(owner_id,operation_id);

create function public.assistant_conversation_export_owner_v1(
  p_owner uuid,p_section text,p_after_id uuid default null,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page jsonb; more boolean; cursor uuid;
begin
  if (select auth.role()) is distinct from 'service_role' or p_owner is null then
    raise exception 'FORBIDDEN';
  end if;
  if p_section is null or p_section not in ('conversations','goals','messages','goalTripLinks','goalTripReceipts')
    or p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
  -- Deleted, unknown and foreign-owner anchors uniformly require an export restart.
  if p_after_id is not null and not exists(
    select 1 from turn_private.assistant_conversations where p_section='conversations' and owner_id=p_owner and id=p_after_id
    union all
    select 1 from turn_private.assistant_goals where p_section='goals' and owner_id=p_owner and id=p_after_id
    union all
    select 1 from turn_private.assistant_messages where p_section='messages' and owner_id=p_owner and id=p_after_id
    union all
    select 1 from turn_private.assistant_goal_trip_links where p_section='goalTripLinks' and owner_id=p_owner and goal_id=p_after_id
    union all
    select 1 from turn_private.assistant_goal_trip_receipts where p_section='goalTripReceipts' and owner_id=p_owner and operation_id=p_after_id
  ) then raise exception 'INVALID_EXPORT_CURSOR'; end if;
  with candidates as (
    (select id as id,jsonb_build_object(
      'conversationId',id,'policyId',policy_id,
      'consentId',consent_id,'nextSequence',next_sequence,
      'createdAt',created_at) as item
      from turn_private.assistant_conversations
      where p_section='conversations' and owner_id=p_owner
        and id>=coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and (p_after_id is null or id>p_after_id)
      order by id limit p_limit+1)
    union all
    (select id as id,jsonb_build_object(
      'goalId',id,'conversationId',conversation_id,
      'scopeVersion',scope_version,'text',current_text,
      'tripTerminal',trip_terminal,'createdAt',created_at) as item
      from turn_private.assistant_goals
      where p_section='goals' and owner_id=p_owner
        and id>=coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and (p_after_id is null or id>p_after_id)
      order by id limit p_limit+1)
    union all
    (select id as id,jsonb_build_object(
      'messageId',id,'conversationId',conversation_id,
      'sequence',sequence,'policyId',policy_id,
      'consentId',consent_id,'locale',locale,
      'text',input_text,'relationship',relationship,
      'goalId',goal_id,'scopeVersion',scope_version,
      'taskId',task_id,'parentMessageId',parent_message_id,
      'turnId',turn_id,'createdAt',created_at) as item
      from turn_private.assistant_messages
      where p_section='messages' and owner_id=p_owner
        and id>=coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and (p_after_id is null or id>p_after_id)
      order by id limit p_limit+1)
    union all
    (select goal_id as id,jsonb_build_object(
      'goalId',goal_id,'conversationId',conversation_id,
      'linkVersion',link_version,'goalScopeVersion',goal_scope_version,
      'lastOperationId',operation_id,'terminalUnlinked',terminal_unlinked,
      'tripId',trip_id,'tripHeadVersion',trip_head_version,
      'sourceMessageId',source_message_id,'updatedAt',updated_at) as item
      from turn_private.assistant_goal_trip_links
      where p_section='goalTripLinks' and owner_id=p_owner
        and goal_id>=coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and (p_after_id is null or goal_id>p_after_id)
      order by goal_id limit p_limit+1)
    union all
    (select operation_id as id,jsonb_build_object(
      'operationId',operation_id,'goalId',goal_id,
      'action',action,'sourceKind',source_kind,
      'sourceMessageId',source_message_id,'beforeLinkVersion',before_link_version,
      'afterLinkVersion',after_link_version,'beforeGoalScopeVersion',before_goal_scope_version,
      'afterGoalScopeVersion',after_goal_scope_version,'tripId',trip_id,
      'tripHeadVersion',trip_head_version,'createdAt',created_at) as item
      from turn_private.assistant_goal_trip_receipts
      where p_section='goalTripReceipts' and owner_id=p_owner
        and operation_id>=coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and (p_after_id is null or operation_id>p_after_id)
      order by operation_id limit p_limit+1)
  ), page_window as (
    select id,item from candidates order by id limit p_limit+1
  ), delivered as (
    select id,item from page_window order by id limit p_limit
  )
  select coalesce((select jsonb_agg(item order by id) from delivered),'[]'::jsonb),
    (select count(*)>p_limit from page_window),
    (select id from delivered order by id desc limit 1)
    into page,more,cursor;
  return jsonb_build_object('schemaVersion','assistant-conversation-export/1',
    'section',p_section,'items',page,'hasMore',more,
    'nextCursor',case when more then cursor else null end,'sectionComplete',not more);
end $$;
revoke all on function public.assistant_conversation_export_owner_v1(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.assistant_conversation_export_owner_v1(uuid,text,uuid,integer) to service_role;
notify pgrst,'reload schema';
