-- Candidate original-source retirement; shared union approved by Main only.
-- Product DDL/ACL/source-trigger/schema-pin leases remain pending.
create function turn_private.assistant_event_new_conversation_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into turn_private.assistant_event_heads_v1(conversation_id,owner_id,backfill_complete)
  values(new.id,new.owner_id,true);
 return null;
end $$;
create trigger assistant_event_conversation_v1 after insert on turn_private.assistant_conversations
 for each row execute function turn_private.assistant_event_new_conversation_v1();

create function turn_private.assistant_event_erase_authorized_v1(e turn_private.assistant_events_v1)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare f privacy_private.linked_delete_fences_v1%rowtype;
begin
 if exists(select 1 from turn_data_private.transaction_proofs_v1 p
  join turn_data_private.operations_v1 o on o.request_id=p.request_id and o.owner_id=p.owner_id
  where p.transaction_id=pg_current_xact_id() and p.owner_id=e.owner_id
   and p.source_digest=o.source_digest and p.graph=o.graph and p.expires_at=o.expires_at
   and p.expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint
   and (p.graph->'turnIds' ? e.turn_id::text or p.graph->'artifactIds' ? e.artifact_id::text)) then return true;end if;
 if conversation_data_private.proof_v1(e.owner_id,'turnIds',e.turn_id)
  or conversation_data_private.proof_v1(e.owner_id,'taskIds',e.task_id)
  or conversation_data_private.proof_v1(e.owner_id,'conversationIds',e.conversation_id)
  or (e.artifact_id is not null and conversation_data_private.proof_v1(e.owner_id,'artifactIds',e.artifact_id))
  or (e.artifact_id is not null and result_data_private.proof_v1('artifactIds',e.artifact_id)) then return true;end if;
 for f in select * from privacy_private.linked_delete_fences_v1 where owner_id=e.owner_id
  and ((entity_kind='turn' and entity_id=e.turn_id) or (entity_kind='task' and entity_id=e.task_id)
   or (entity_kind='artifact' and entity_id=e.artifact_id)) loop
  if privacy_private.linked_delete_erase_authority_v1(f.request_id,f.entity_kind,f.entity_id) then return true;end if;
 end loop;
 return false;
end $$;

create function turn_private.retire_assistant_event_v1(p_conversation uuid,p_sequence bigint)
returns void language plpgsql security definer set search_path='' as $$
declare e turn_private.assistant_events_v1%rowtype;h turn_private.assistant_event_heads_v1%rowtype;
begin
 -- No source-row locks acquired here; the original eraser already owns them.
 -- Head precedes mutable delivery row, matching original producer allocation.
 select * into h from turn_private.assistant_event_heads_v1 where conversation_id=p_conversation for update;
 if not found then return;end if;
 select * into e from turn_private.assistant_events_v1 where conversation_id=p_conversation and sequence=p_sequence for update;
 if not found or e.source_kind='retired' then return;end if;
 if not turn_private.assistant_event_erase_authorized_v1(e) then raise exception 'ASSISTANT_EVENT_ERASE_AUTHORITY';end if;
 if h.last_sequence=999999999999999 then raise exception 'ASSISTANT_EVENT_SEQUENCE_LIMIT';end if;
 update turn_private.assistant_events_v1 set source_kind='retired',source_key='ordinal:'||sequence::text,
  task_id=null,turn_id=null,event_type='source_retired',status=null,tool=null,action_state=null,
  artifact_id=null,revision=null,retired_sequence=sequence where conversation_id=p_conversation and sequence=p_sequence;
 insert into turn_private.assistant_events_v1(owner_id,conversation_id,sequence,source_kind,source_key,event_type,retired_sequence)
  values(e.owner_id,p_conversation,h.last_sequence+1,'retired','retirement:'||p_sequence::text,'source_retired',p_sequence);
 update turn_private.assistant_event_heads_v1 set last_sequence=h.last_sequence+1 where conversation_id=p_conversation;
end $$;

create function turn_private.assistant_event_immutable_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.source_kind<>'retired' or old.source_kind='retired' or new.conversation_id<>old.conversation_id
  or new.owner_id<>old.owner_id or new.sequence<>old.sequence or new.retired_sequence<>old.sequence
  or new.source_key<>'ordinal:'||old.sequence::text
  or not turn_private.assistant_event_erase_authorized_v1(old) then raise exception 'IMMUTABLE_ASSISTANT_EVENT';end if;
 return new;
end $$;
create trigger assistant_event_immutable_v1 before update on turn_private.assistant_events_v1
 for each row execute function turn_private.assistant_event_immutable_v1();

create function turn_private.assistant_event_erase_source_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare e record;
begin
 -- True owner/conversation deletion removes delivery tables by their original
 -- parent FK. No deleted parent, head or ordinal is retained after that cascade.
 if not exists(select 1 from auth.users where id=old.owner_id) then return old;end if;
 for e in select conversation_id,sequence from turn_private.assistant_events_v1 x where x.owner_id=old.owner_id
  and x.source_kind<>'retired' and (
   (tg_table_name='chat_turn_events' and x.source_kind='chat_turn_event'
    and x.source_key=(to_jsonb(old)->>'turn_id')||':'||(to_jsonb(old)->>'sequence'))
   or (tg_table_name='planning_action_receipts' and x.source_kind='action_receipt'
    and x.turn_id=(to_jsonb(old)->>'turn_id')::uuid and split_part(x.source_key,':',2)=to_jsonb(old)->>'action_key')
   or (tg_table_name='result_events' and x.source_kind='result_event' and x.source_key=to_jsonb(old)->>'id')
   or (tg_table_name='service_task_turns' and x.turn_id=(to_jsonb(old)->>'turn_id')::uuid)
   or (tg_table_name='assistant_messages' and x.task_id=(to_jsonb(old)->>'task_id')::uuid
    and x.conversation_id=(to_jsonb(old)->>'conversation_id')::uuid
    and not exists(select 1 from turn_private.assistant_messages m where m.id<>(to_jsonb(old)->>'id')::uuid
     and m.owner_id=old.owner_id and m.task_id=x.task_id and m.conversation_id=x.conversation_id))
  ) order by conversation_id,sequence loop
  if exists(select 1 from turn_private.assistant_conversations where id=e.conversation_id and owner_id=old.owner_id) then
   perform turn_private.retire_assistant_event_v1(e.conversation_id,e.sequence);
  end if;
 end loop;
 return old;
end $$;
-- AFTER DELETE so original guards authorize and check their original source
-- first, and source is absent before any delivery retirement is observable.
create trigger assistant_event_erase_chat_v1 after delete on public.chat_turn_events for each row execute function turn_private.assistant_event_erase_source_v1();
create trigger assistant_event_erase_progress_v1 after delete on turn_private.planning_action_receipts for each row execute function turn_private.assistant_event_erase_source_v1();
create trigger assistant_event_erase_result_v1 after delete on turn_private.result_events for each row execute function turn_private.assistant_event_erase_source_v1();
create trigger assistant_event_erase_message_v1 after delete on turn_private.assistant_messages for each row execute function turn_private.assistant_event_erase_source_v1();
create trigger assistant_event_erase_link_v1 after delete on turn_private.service_task_turns for each row execute function turn_private.assistant_event_erase_source_v1();
revoke all on function turn_private.assistant_event_new_conversation_v1(),turn_private.assistant_event_erase_authorized_v1(turn_private.assistant_events_v1),
 turn_private.retire_assistant_event_v1(uuid,bigint),turn_private.assistant_event_immutable_v1(),turn_private.assistant_event_erase_source_v1() from public,anon,authenticated,service_role;
-- Enroll exact new derived relations in existing source/permanent fences.
-- These guards take only shared advisory/key-share NOWAIT checks after the
-- already-held original producer/eraser locks. No blocking reverse lock order.
create trigger conversation_source_fence_v1 before insert or update or delete on turn_private.assistant_events_v1
 for each row execute function conversation_data_private.guard_source_v1();
create trigger result_source_fence_v1 before insert or update or delete on turn_private.assistant_events_v1
 for each row execute function result_data_private.guard_source_v1();
create trigger linked_delete_fence_v1 before insert or update or delete on turn_private.assistant_events_v1
 for each row execute function privacy_private.guard_linked_delete_entity_v1();
create trigger conversation_source_fence_v1 before insert or update or delete on turn_private.assistant_event_heads_v1
 for each row execute function conversation_data_private.guard_source_v1();

create trigger turn_data_parent_fence_v1 before insert or update or delete on turn_private.assistant_events_v1 for each row execute function turn_data_private.guard_source_v1();
create trigger turn_data_parent_fence_v1 before insert or update or delete on turn_private.assistant_event_heads_v1 for each row execute function turn_data_private.guard_source_v1();
