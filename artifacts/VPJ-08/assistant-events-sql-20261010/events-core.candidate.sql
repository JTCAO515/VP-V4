-- REVIEW CANDIDATE ONLY. No migration slot, shared-object or ACL lease inferred.
-- Append in one transaction. Migration locks prevent source/backfill inversion;
-- runtime collectors acquire only the head after the original producer locks.
lock table public.chat_turn_events,turn_private.assistant_messages,
 turn_private.service_task_turns,turn_private.planning_action_receipts,
 turn_private.result_events in share row exclusive mode;
create table turn_private.assistant_event_heads_v1 (
 conversation_id uuid primary key references turn_private.assistant_conversations(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 last_sequence bigint not null default 0 check(last_sequence between 0 and 999999999999999),
 backfill_complete boolean not null default false
);
create table turn_private.assistant_events_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
 sequence bigint not null check(sequence between 1 and 999999999999999),
 source_kind text not null check(source_kind in ('chat_turn_event','action_receipt','result_event','retired')),
 source_key text not null check(length(source_key) between 1 and 160),
 task_id uuid,turn_id uuid,
 event_type text not null,status text,tool text,action_state text,artifact_id uuid,revision integer,retired_sequence bigint,
 primary key(conversation_id,sequence),unique(owner_id,conversation_id,source_kind,source_key),
 constraint assistant_events_live_identity_v1 check(source_kind='retired' or (task_id is not null and turn_id is not null)),
 constraint assistant_events_retired_ordinal_v1 check((source_kind='retired')=(retired_sequence is not null)),
 constraint assistant_events_payload_v1 check (
  (source_kind='chat_turn_event' and event_type='task_status'
   and status is not null and status in ('accepted','planning','retrieving','generating','validating','completed','proposal_ready','unavailable','failed','cancelled')
   and tool is null and action_state is null and artifact_id is null and revision is null)
  or (source_kind='action_receipt' and event_type='task_progress' and status is null
   and tool is not null and tool in ('evidence.lookup','place.read','constraints.evaluate','result.prepare')
   and action_state is not null and action_state in ('started','completed','unknown') and artifact_id is null and revision is null)
  or (source_kind='result_event' and event_type in ('artifact_ready','artifact_updated','artifact_invalidated')
   and status is null and tool is null and action_state is null and artifact_id is not null and revision is not null and revision between 1 and 1000)
  or (source_kind='retired' and event_type='source_retired' and task_id is null and turn_id is null
   and status is null and tool is null and action_state is null and artifact_id is null and revision is null
   and retired_sequence between 1 and sequence))
);
create index assistant_events_owner_window_v1 on turn_private.assistant_events_v1(owner_id,conversation_id,sequence);
alter table turn_private.assistant_event_heads_v1 enable row level security;
alter table turn_private.assistant_events_v1 enable row level security;
revoke all on turn_private.assistant_event_heads_v1,turn_private.assistant_events_v1 from public,anon,authenticated,service_role;

-- Structural association only. Eligibility is freshly qualified by the reader;
-- collection must not discard a genuine event due to a transient policy state.
create function turn_private.assistant_event_link_v1(p_owner uuid,p_task uuid,p_turn uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid; n integer;
begin
 select count(distinct m.conversation_id),min(m.conversation_id::text)::uuid into n,c
 from turn_private.assistant_messages m
 join turn_private.assistant_conversations a on a.id=m.conversation_id and a.owner_id=m.owner_id
 join turn_private.service_tasks s on s.id=m.task_id and s.owner_id=m.owner_id
 join turn_private.service_task_turns l on l.task_id=s.id and l.owner_id=s.owner_id and l.turn_id=p_turn
 join turn_private.text_content tc on tc.turn_id=l.turn_id and tc.owner_id=s.owner_id and tc.thread_id=s.thread_id
 join public.turns t on t.id=tc.turn_id and t.owner_id=tc.owner_id and t.thread_id=s.thread_id
 where m.owner_id=p_owner and s.id=p_task;
 if n>1 then raise exception 'ASSISTANT_EVENT_AMBIGUOUS_LINK';end if;
 return c;
end $$;

-- All payload comes from retained typed source records, never an RPC payload.
create function turn_private.append_assistant_event_v1(p_kind text,p_key text)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid;c uuid;task uuid;trn uuid;typ text;st text;tl text;ast text;aid uuid;rev integer;
 h turn_private.assistant_event_heads_v1%rowtype;e public.chat_turn_events%rowtype;
 r turn_private.planning_action_receipts%rowtype;re turn_private.result_events%rowtype;
 a turn_private.result_artifacts%rowtype;v turn_private.result_revisions%rowtype;m turn_private.assistant_messages%rowtype;
begin
 if p_kind='chat_turn_event' then
  select * into e from public.chat_turn_events where turn_id=split_part(p_key,':',1)::uuid and sequence=split_part(p_key,':',2)::integer;
  if not found or p_key<>e.turn_id::text||':'||e.sequence::text then raise exception 'ASSISTANT_EVENT_SOURCE_MISSING';end if;
  select l.task_id into task from turn_private.service_task_turns l where l.turn_id=e.turn_id and l.owner_id=e.owner_id;
  u:=e.owner_id;trn:=e.turn_id;typ:='task_status';st:=e.state;
 elsif p_kind='action_receipt' then
  select * into r from turn_private.planning_action_receipts where turn_id=split_part(p_key,':',1)::uuid and action_key=split_part(p_key,':',2);
  if not found or p_key<>r.turn_id::text||':'||r.action_key||':'||r.state then raise exception 'ASSISTANT_EVENT_SOURCE_MISSING';end if;
  u:=r.owner_id;task:=r.task_id;trn:=r.turn_id;typ:='task_progress';tl:=r.tool_id;ast:=r.state;
  select * into m from turn_private.assistant_messages where id=r.message_id and owner_id=u and task_id=task;
  if not found then raise exception 'ASSISTANT_EVENT_SOURCE_LINK';end if;
 elsif p_kind='result_event' then
  select * into re from turn_private.result_events where id=p_key::bigint;
  if not found or p_key<>re.id::text then raise exception 'ASSISTANT_EVENT_SOURCE_MISSING';end if;
  select * into a from turn_private.result_artifacts where id=re.artifact_id and owner_id=re.owner_id;
  select * into v from turn_private.result_revisions where artifact_id=re.artifact_id and revision=re.revision and owner_id=re.owner_id;
  select * into m from turn_private.assistant_messages where id=a.input_message_id and owner_id=re.owner_id and task_id=a.task_id;
  if m.id is null or v.artifact_id is null then raise exception 'ASSISTANT_EVENT_SOURCE_LINK';end if;
  u:=re.owner_id;task:=a.task_id;trn:=v.task_turn_id;aid:=a.id;rev:=re.revision;
  typ:=case re.event_type when 'ready' then 'artifact_ready' when 'revised' then 'artifact_updated' when 'withdrawn' then 'artifact_invalidated' end;
 else raise exception 'INVALID_INPUT';end if;
 if task is null then return;end if;
 c:=turn_private.assistant_event_link_v1(u,task,trn);
 if c is null then return;end if;
 if p_kind in ('action_receipt','result_event') and m.conversation_id<>c then raise exception 'ASSISTANT_EVENT_SOURCE_LINK';end if;
 insert into turn_private.assistant_event_heads_v1(conversation_id,owner_id) values(c,u) on conflict do nothing;
 select * into h from turn_private.assistant_event_heads_v1 where conversation_id=c for update;
 if h.owner_id<>u then raise exception 'ASSISTANT_EVENT_OWNER';end if;
 if exists(select 1 from turn_private.assistant_events_v1 where owner_id=u and conversation_id=c and source_kind=p_kind and source_key=p_key) then return;end if;
 if h.last_sequence=999999999999999 then raise exception 'ASSISTANT_EVENT_SEQUENCE_LIMIT';end if;
 insert into turn_private.assistant_events_v1(owner_id,conversation_id,sequence,source_kind,source_key,task_id,turn_id,event_type,status,tool,action_state,artifact_id,revision)
 values(u,c,h.last_sequence+1,p_kind,p_key,task,trn,typ,st,tl,ast,aid,rev);
 update turn_private.assistant_event_heads_v1 set last_sequence=h.last_sequence+1 where conversation_id=c;
end $$;

create function turn_private.collect_assistant_turn_events_v1(p_turn uuid)
returns void language plpgsql security definer set search_path='' as $$
declare e record;
begin
 for e in select turn_id,sequence from public.chat_turn_events where turn_id=p_turn order by sequence loop
  perform turn_private.append_assistant_event_v1('chat_turn_event',e.turn_id::text||':'||e.sequence::text);
 end loop;
end $$;
create function turn_private.assistant_event_source_hook_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare trn record;
begin
 if tg_table_name='chat_turn_events' then
  perform turn_private.append_assistant_event_v1('chat_turn_event',new.turn_id::text||':'||new.sequence::text);
 elsif tg_table_name in ('service_task_turns','text_content') then
  perform turn_private.collect_assistant_turn_events_v1(new.turn_id);
 elsif tg_table_name='assistant_messages' then
  if new.task_id is not null then
   for trn in select turn_id from turn_private.service_task_turns where task_id=new.task_id and owner_id=new.owner_id order by turn_id loop
    perform turn_private.collect_assistant_turn_events_v1(trn.turn_id);
   end loop;
  end if;
 elsif tg_table_name='planning_action_receipts' then
  if tg_op='INSERT' or old.state is distinct from new.state then
   perform turn_private.append_assistant_event_v1('action_receipt',new.turn_id::text||':'||new.action_key||':'||new.state);
  end if;
 elsif tg_table_name='result_events' then
  perform turn_private.append_assistant_event_v1('result_event',new.id::text);
 end if;
 return null;
end $$;
create trigger assistant_event_chat_v1 after insert on public.chat_turn_events for each row execute function turn_private.assistant_event_source_hook_v1();
create trigger assistant_event_message_v1 after insert on turn_private.assistant_messages for each row execute function turn_private.assistant_event_source_hook_v1();
create trigger assistant_event_text_v1 after insert on turn_private.text_content for each row execute function turn_private.assistant_event_source_hook_v1();
create trigger assistant_event_link_v1 after insert on turn_private.service_task_turns for each row execute function turn_private.assistant_event_source_hook_v1();
create trigger assistant_event_progress_v1 after insert or update of state on turn_private.planning_action_receipts for each row execute function turn_private.assistant_event_source_hook_v1();
create trigger assistant_event_result_v1 after insert on turn_private.result_events for each row execute function turn_private.assistant_event_source_hook_v1();

-- Bounded batches, full retained source traversal while original source tables
-- are locked. Never reconstruct overwritten receipt transitions. The bounded
-- cursor is internal migration state, not a public recovery/append capability.
do $backfill$
declare x record;stamp_n timestamptz:='-infinity';kind_n text:='';key_n text:='';batch_n integer;
begin
 insert into turn_private.assistant_event_heads_v1(conversation_id,owner_id)
 select id,owner_id from turn_private.assistant_conversations on conflict do nothing;
 loop
 batch_n:=0;
 for x in select * from (
  select 'chat_turn_event'::text kind,e.turn_id::text||':'||e.sequence::text key,e.created_at stamp
   from public.chat_turn_events e
  union all select 'action_receipt',r.turn_id::text||':'||r.action_key||':'||r.state,r.updated_at from turn_private.planning_action_receipts r
  union all select 'result_event',r.id::text,r.created_at from turn_private.result_events r
 ) retained where (stamp,kind,key)>(stamp_n,kind_n,key_n) order by stamp,kind,key limit 1000
 loop
  perform turn_private.append_assistant_event_v1(x.kind,x.key);
  stamp_n:=x.stamp;kind_n:=x.kind;key_n:=x.key;batch_n:=batch_n+1;
 end loop;
 exit when batch_n<1000;
 end loop;
 update turn_private.assistant_event_heads_v1 set backfill_complete=true;
end $backfill$;

revoke all on function turn_private.assistant_event_link_v1(uuid,uuid,uuid),turn_private.append_assistant_event_v1(text,text),
 turn_private.collect_assistant_turn_events_v1(uuid),turn_private.assistant_event_source_hook_v1() from public,anon,authenticated,service_role;
