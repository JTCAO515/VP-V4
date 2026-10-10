-- REVIEW CANDIDATE. Ordinary current Native JWT only, no D2 scope or grant.
create function turn_private.assistant_event_eligible_v1(e turn_private.assistant_events_v1,p_policy uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare m turn_private.assistant_messages%rowtype;s turn_private.service_tasks%rowtype;
 tc turn_private.text_content%rowtype;g turn_private.assistant_goals%rowtype;
begin
 if e.source_kind='retired' then return true;end if;
 select * into s from turn_private.service_tasks where id=e.task_id and owner_id=e.owner_id for share nowait;
 if not found or s.policy_id<>p_policy then return false;end if;
 select * into tc from turn_private.text_content where turn_id=e.turn_id and owner_id=e.owner_id
  and thread_id=s.thread_id and policy_id=s.policy_id and consent_id=s.consent_id and hidden_at is null for share nowait;
 if not found then return false;end if;
 perform 1 from turn_private.text_content where turn_id=s.goal_turn_id and owner_id=e.owner_id
  and thread_id=s.thread_id and policy_id=s.policy_id and consent_id=s.consent_id and hidden_at is null for share nowait;
 if not found then return false;end if;
 perform 1 from public.turns where id=e.turn_id and owner_id=e.owner_id and thread_id=s.thread_id for share nowait;
 if not found then return false;end if;
 perform 1 from public.chat_threads where id=s.thread_id and owner_id=e.owner_id and status='active' for share nowait;
 if not found then return false;end if;
 perform 1 from turn_private.service_task_turns where turn_id=e.turn_id and task_id=s.id and owner_id=e.owner_id for share nowait;
 if not found then return false;end if;
 select * into m from turn_private.assistant_messages where task_id=s.id and owner_id=e.owner_id
  and conversation_id=e.conversation_id order by sequence desc limit 1 for share nowait;
 if not found or m.policy_id<>p_policy or m.consent_id<>s.consent_id then return false;end if;
 perform 1 from turn_private.text_consents where owner_id=e.owner_id and policy_id=s.policy_id
  and consent_id=s.consent_id and revoked_at is null for share nowait;
 if not found then return false;end if;
 if m.goal_id is not null then
  select * into g from turn_private.assistant_goals where id=m.goal_id and owner_id=e.owner_id
   and conversation_id=e.conversation_id for share nowait;
  -- Goal version changes content currentness, not ownership of readable Task hints.
  if not found then return false;end if;
 end if;
 -- Immutable status sources must still exist and retain the exact status.
 if e.source_kind='chat_turn_event' then
  perform 1 from public.chat_turn_events where turn_id=e.turn_id and owner_id=e.owner_id
   and sequence=split_part(e.source_key,':',2)::integer and state=e.status for share nowait;
  return found;
 elsif e.source_kind='action_receipt' then
  -- Earlier captured started may be read after its original receipt completed;
  -- the immutable transition index remains a hint, not receipt authority.
  perform 1 from turn_private.planning_action_receipts where turn_id=e.turn_id and owner_id=e.owner_id
   and task_id=s.id and action_key=split_part(e.source_key,':',2) and tool_id=e.tool for share nowait;
  return found;
 else
  perform 1 from turn_private.result_events where id=e.source_key::bigint and owner_id=e.owner_id
   and artifact_id=e.artifact_id and revision=e.revision for share nowait;
  if not found then return false;end if;
  perform 1 from turn_private.result_artifacts a join turn_private.assistant_messages am
   on am.id=a.input_message_id and am.owner_id=a.owner_id and am.task_id=a.task_id
   join turn_private.result_revisions r on r.artifact_id=a.id and r.owner_id=a.owner_id and r.revision=e.revision
   where a.id=e.artifact_id and a.owner_id=e.owner_id and a.task_id=s.id
    and am.conversation_id=e.conversation_id and r.task_turn_id=e.turn_id for share of a,am,r nowait;
  return found;
 end if;
end $$;

create function public.read_assistant_events_v1(p_policy_id uuid,p_conversation_id uuid,p_after_sequence bigint,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();n jsonb;c turn_private.assistant_conversations%rowtype;
 h turn_private.assistant_event_heads_v1%rowtype;e turn_private.assistant_events_v1%rowtype;
 output jsonb:='[]';item jsonb;count_n integer:=0;last_n bigint:=p_after_sequence;more boolean:=false;availability text;basis jsonb;a turn_private.result_artifacts%rowtype;r turn_private.result_revisions%rowtype;
begin
 if p_policy_id is null or p_conversation_id is null or p_after_sequence is null
  or p_after_sequence not between 0 and 999999999999999 or p_limit is distinct from 50 then raise exception 'INVALID_INPUT';end if;
 if u is null or auth.role() is distinct from 'authenticated' then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform identity_private.guard_mobile_rpc_v2();n:=public.native_session_v2('session');
 if (n->>'mobileEpoch')::bigint not between 1 and 9007199254740991 then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.sessions where id=(n->>'sessionId')::uuid and user_id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 if not turn_data_private.runtime_supported_v1() then return jsonb_build_object('kind','unavailable');end if;
 if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable');end if;
 select * into c from turn_private.assistant_conversations where id=p_conversation_id and owner_id=u
  and policy_id=p_policy_id for share nowait;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 perform 1 from turn_private.text_consents where owner_id=u and policy_id=p_policy_id
  and consent_id=c.consent_id and revoked_at is null for share nowait;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 select * into h from turn_private.assistant_event_heads_v1 where conversation_id=c.id and owner_id=u;
 if not found or not h.backfill_complete then return jsonb_build_object('kind','unavailable');end if;
 -- Check membership first. No foreign/missing/future cursor metadata returned.
 if p_after_sequence>h.last_sequence or (p_after_sequence>0 and not exists(select 1 from turn_private.assistant_events_v1
  where conversation_id=c.id and owner_id=u and sequence=p_after_sequence)) then raise exception 'INVALID_INPUT';end if;
 if p_after_sequence>0 then
  select * into e from turn_private.assistant_events_v1 where conversation_id=c.id and owner_id=u and sequence=p_after_sequence;
  if not turn_private.assistant_event_eligible_v1(e,p_policy_id) then return jsonb_build_object('kind','unavailable');end if;
 end if;
 for e in select * from turn_private.assistant_events_v1 where owner_id=u and conversation_id=c.id
  and sequence>p_after_sequence and sequence<=h.last_sequence order by sequence limit 51 loop
  if e.sequence<>p_after_sequence+count_n+1 or not turn_private.assistant_event_eligible_v1(e,p_policy_id)
   then return jsonb_build_object('kind','unavailable');end if;
  count_n:=count_n+1;
  if count_n=51 then more:=true;exit;end if;
  item:=jsonb_build_object('eventId',c.id::text||':'||e.sequence::text,'sequence',e.sequence,'type',e.event_type);
  if e.event_type='source_retired' then
   item:=item||jsonb_build_object('retiredSequence',e.retired_sequence);
  else
   item:=item||jsonb_build_object('taskId',e.task_id,'turnId',e.turn_id);
  end if;
  if e.event_type='source_retired' then null;
  elsif e.event_type='task_status' then item:=item||jsonb_build_object('status',e.status);
  elsif e.event_type='task_progress' then item:=item||jsonb_build_object('tool',e.tool,'state',e.action_state);
  else
   availability:='unavailable';
   -- Original exact revision reader requalifies goal/Trip/Memory/evidence and
   -- current source/lifecycle. Never copy content into this event result.
   if e.event_type<>'artifact_invalidated' then
    select * into a from turn_private.result_artifacts where id=e.artifact_id and owner_id=u;
    select * into r from turn_private.result_revisions where artifact_id=e.artifact_id and revision=e.revision and owner_id=u;
    basis:=turn_private.result_state_v2(a,r);
    if basis->>'current'='true' and exists(select 1 from turn_private.result_artifacts where id=e.artifact_id
      and owner_id=u and lifecycle='active' and current_revision=e.revision) then availability:='recheck';end if;
   end if;
   item:=item||jsonb_build_object('artifactId',e.artifact_id,'revision',e.revision,'availability',availability);
  end if;
  output:=output||jsonb_build_array(item);last_n:=e.sequence;
 end loop;
 if count_n<51 and last_n<>h.last_sequence then return jsonb_build_object('kind','unavailable');end if;
 item:=jsonb_build_object('kind','assistant_events','schemaVersion','assistant-events/1','conversationId',c.id,
  'afterSequence',p_after_sequence,'lastSequence',last_n,'hasMore',more,'events',output);
 if octet_length(convert_to(item::text,'UTF8'))>65536 then return jsonb_build_object('kind','unavailable');end if;
 return item;
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
revoke all on function turn_private.assistant_event_eligible_v1(turn_private.assistant_events_v1,uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_assistant_events_v1(uuid,uuid,bigint,integer) from public,anon,authenticated,service_role;
-- Candidate ACL only. Main scoped repository lease required before migration.
grant execute on function public.read_assistant_events_v1(uuid,uuid,bigint,integer) to authenticated;
