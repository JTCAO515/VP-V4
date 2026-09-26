-- VPJ-78: a user-confirmed, versioned reference from an existing goal to an
-- existing owned Trip. This stores no Trip content and cannot write a Trip.
-- Reserve 10001 exclusively for terminal unlink/deletion. Legacy amendments
-- cannot consume it, so even a goal at the ordinary 10000 cap can invalidate
-- every older goal-version basis before its Trip is deleted.
alter table turn_private.assistant_goals drop constraint assistant_goals_scope_version_check;
alter table turn_private.assistant_goals add column trip_terminal boolean not null default false;
alter table turn_private.assistant_goals add constraint assistant_goals_scope_version_check
  check(scope_version between 1 and 10001 and (not trip_terminal or scope_version=10001));
create function turn_private.guard_goal_terminal_scope_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if (new.scope_version=10001 and (new.trip_terminal is distinct from true or old.trip_terminal))
    or (new.trip_terminal is distinct from old.trip_terminal and (new.trip_terminal is distinct from true or new.scope_version<>10001))
    or (old.trip_terminal and new.scope_version is distinct from old.scope_version)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  return new;
end $$;
revoke all on function turn_private.guard_goal_terminal_scope_v1() from public,anon,authenticated,service_role;
create trigger guard_goal_terminal_scope_v1 before update on turn_private.assistant_goals
  for each row execute function turn_private.guard_goal_terminal_scope_v1();

create table turn_private.assistant_goal_trip_links (
  goal_id uuid primary key references turn_private.assistant_goals(id) on delete cascade,
  conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  link_version integer not null check(link_version between 1 and 10001),
  goal_scope_version integer not null check(goal_scope_version between 1 and 10001),
  operation_id uuid not null,
  trip_id uuid references public.trips(id) on delete restrict,
  trip_head_version integer check(trip_head_version >= 0),
  source_message_id uuid,
  source_kind text not null check(source_kind in ('native_user_confirmed','trip_deletion_confirmed')),
  terminal_unlinked boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  check ((trip_id is null)=(trip_head_version is null)),
  check (not terminal_unlinked or (trip_id is null and (link_version=10001 or goal_scope_version=10001)))
);
create index assistant_goal_trip_links_owner on turn_private.assistant_goal_trip_links(owner_id,goal_id);
create index assistant_goal_trip_links_trip on turn_private.assistant_goal_trip_links(trip_id) where trip_id is not null;
alter table turn_private.assistant_goal_trip_links enable row level security;
revoke all on turn_private.assistant_goal_trip_links from public,anon,authenticated,service_role;

-- The receipt retains the user's explicit action, CAS basis and source message.
-- Its Trip FK clears only the historic ID after a permitted Trip deletion.
create table turn_private.assistant_goal_trip_receipts (
  operation_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  goal_id uuid not null,
  session_id uuid not null,
  request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
  action text not null check(action in ('link','unlink')),
  source_kind text not null check(source_kind in ('native_user_confirmed','trip_deletion_confirmed')),
  source_message_id uuid,
  before_link_version integer not null check(before_link_version between 0 and 10000),
  after_link_version integer not null check(after_link_version=before_link_version+1),
  before_goal_scope_version integer not null check(before_goal_scope_version between 1 and 10000),
  after_goal_scope_version integer not null check(after_goal_scope_version=before_goal_scope_version+1),
  trip_id uuid references public.trips(id) on delete set null,
  trip_head_version integer check(trip_head_version >= 0),
  created_at timestamptz not null default clock_timestamp()
);
create index assistant_goal_trip_receipts_owner_goal on turn_private.assistant_goal_trip_receipts(owner_id,goal_id,created_at);
create index assistant_goal_trip_receipts_trip on turn_private.assistant_goal_trip_receipts(trip_id) where trip_id is not null;
alter table turn_private.assistant_goal_trip_receipts enable row level security;
revoke all on turn_private.assistant_goal_trip_receipts from public,anon,authenticated,service_role;

create function public.set_assistant_goal_trip_link_v1(
  p_operation_id uuid,p_conversation_id uuid,p_goal_id uuid,p_source_message_id uuid,
  p_expected_goal_scope_version integer,p_expected_link_version integer,
  p_action text,p_trip_id uuid,p_expected_trip_version integer,p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); mobile_session uuid:=(auth.jwt()->>'session_id')::uuid;
  conversation turn_private.assistant_conversations%rowtype; goal turn_private.assistant_goals%rowtype;
  linked turn_private.assistant_goal_trip_links%rowtype; prior turn_private.assistant_goal_trip_receipts%rowtype;
  source turn_private.assistant_messages%rowtype; trip public.trips%rowtype; digest text; preexisting_trip uuid;
begin
  if p_operation_id is null or p_conversation_id is null or p_goal_id is null
    or p_expected_goal_scope_version is null or p_expected_goal_scope_version not between 1 and 10000
    or p_expected_link_version is null or p_expected_link_version not between 0 and 10000
    or p_confirmed is distinct from true or p_action is null or p_action not in ('link','unlink')
    or (p_action='link' and (p_expected_goal_scope_version>=10000 or p_expected_link_version>=10000))
    or (p_action='link' and (p_trip_id is null or p_expected_trip_version is null or p_expected_trip_version<0))
    or (p_action='unlink' and (p_source_message_id is not null or p_trip_id is not null or p_expected_trip_version is not null))
    then raise exception 'INVALID_INPUT'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_operation_id,p_conversation_id,p_goal_id,
    p_source_message_id,p_expected_goal_scope_version,p_expected_link_version,p_action,p_trip_id,p_expected_trip_version,p_confirmed)::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-goal-trip:'||p_operation_id::text,0));
  select * into conversation from turn_private.assistant_conversations
    where id=p_conversation_id and owner_id=u for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_action='link' and (not turn_private.text_policy_current(conversation.policy_id)
    or not exists(select 1 from turn_private.text_consents c where c.owner_id=u and c.policy_id=conversation.policy_id
      and c.consent_id=conversation.consent_id and c.revoked_at is null))
    then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into goal from turn_private.assistant_goals where id=p_goal_id and owner_id=u
    and conversation_id=p_conversation_id;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into prior from turn_private.assistant_goal_trip_receipts where operation_id=p_operation_id;
  if found then
    if prior.owner_id<>u or prior.conversation_id<>p_conversation_id or prior.goal_id<>p_goal_id then raise exception 'FORBIDDEN'; end if;
    if prior.request_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    return jsonb_build_object('kind','goal_trip_link','operationId',prior.operation_id,'linkVersion',prior.after_link_version,
      'goalScopeVersion',prior.after_goal_scope_version,'tripId',prior.trip_id,'tripHeadVersion',prior.trip_head_version,'reused',true);
  end if;
  -- Trip deletion owns Trip before link/goal. Read the old Trip without a row
  -- lock, then acquire all involved owned Trips in UUID order before either
  -- link or goal. A concurrent deletion may invalidate this preview; the
  -- locked link/CAS recheck below rejects it without committing a half-link.
  select l.trip_id into preexisting_trip from turn_private.assistant_goal_trip_links l
    where l.goal_id=p_goal_id and l.owner_id=u and l.conversation_id=p_conversation_id;
  for trip in select t.* from public.trips t where t.id=any(array[preexisting_trip,p_trip_id])
      and t.owner_id=u order by t.id for update loop null; end loop;
  select * into linked from turn_private.assistant_goal_trip_links where goal_id=p_goal_id for update;
  select * into goal from turn_private.assistant_goals where id=p_goal_id and owner_id=u
    and conversation_id=p_conversation_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if linked.goal_id is not null and (linked.owner_id<>u or linked.conversation_id<>p_conversation_id)
    then raise exception 'FORBIDDEN'; end if;
  if linked.trip_id is distinct from preexisting_trip then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  if coalesce(linked.link_version,0)<>p_expected_link_version or goal.scope_version<>p_expected_goal_scope_version
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  if p_action='unlink' and (linked.goal_id is null or linked.trip_id is null)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  if p_action='unlink' then
    perform 1 from public.trips where id=linked.trip_id and owner_id=u;
    if not found then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  end if;
  if p_action='link' then
    if p_source_message_id is not null then
      select * into source from turn_private.assistant_messages where id=p_source_message_id and owner_id=u
        and conversation_id=p_conversation_id and goal_id=p_goal_id and scope_version=goal.scope_version;
      if not found or source.policy_id<>conversation.policy_id or source.consent_id<>conversation.consent_id
        or source.relationship not in ('goal_start','follow_up','amendment') then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    end if;
    select * into trip from public.trips where id=p_trip_id and owner_id=u;
    if not found then raise exception 'FORBIDDEN'; end if;
    if trip.head_version<>p_expected_trip_version then raise exception 'STALE_TRIP_VERSION'; end if;
    if exists(select 1 from public.trip_archives where trip_id=p_trip_id and owner_id=u)
      then raise exception 'PROPOSAL_NOT_CONFIRMABLE'; end if;
    if exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id)
      then raise exception 'TRIP_DELETION_PENDING_OR_COMPLETED'; end if;
  end if;
  update turn_private.assistant_goals set scope_version=scope_version+1,
    trip_terminal=(p_action='unlink' and p_expected_goal_scope_version=10000) where id=p_goal_id;
  insert into turn_private.assistant_goal_trip_links(goal_id,conversation_id,owner_id,link_version,goal_scope_version,operation_id,
    trip_id,trip_head_version,source_message_id,source_kind,terminal_unlinked)
  values(p_goal_id,p_conversation_id,u,p_expected_link_version+1,p_expected_goal_scope_version+1,p_operation_id,
    p_trip_id,p_expected_trip_version,case when p_action='link' then p_source_message_id else null end,'native_user_confirmed',
    p_action='unlink' and (p_expected_link_version=10000 or p_expected_goal_scope_version=10000))
  on conflict(goal_id) do update set link_version=excluded.link_version,goal_scope_version=excluded.goal_scope_version,
    operation_id=excluded.operation_id,trip_id=excluded.trip_id,trip_head_version=excluded.trip_head_version,source_message_id=excluded.source_message_id,
    terminal_unlinked=excluded.terminal_unlinked,updated_at=clock_timestamp();
  insert into turn_private.assistant_goal_trip_receipts(operation_id,owner_id,conversation_id,goal_id,session_id,
    request_digest,action,source_kind,source_message_id,before_link_version,after_link_version,before_goal_scope_version,
    after_goal_scope_version,trip_id,trip_head_version)
  values(p_operation_id,u,p_conversation_id,p_goal_id,mobile_session,digest,p_action,'native_user_confirmed',p_source_message_id,
    p_expected_link_version,p_expected_link_version+1,p_expected_goal_scope_version,p_expected_goal_scope_version+1,
    p_trip_id,p_expected_trip_version);
  return jsonb_build_object('kind','goal_trip_link','operationId',p_operation_id,'linkVersion',p_expected_link_version+1,
    'goalScopeVersion',p_expected_goal_scope_version+1,'tripId',p_trip_id,'tripHeadVersion',p_expected_trip_version,'reused',false);
end $$;
revoke all on function public.set_assistant_goal_trip_link_v1(uuid,uuid,uuid,uuid,integer,integer,text,uuid,integer,boolean)
  from public,anon,service_role;
grant execute on function public.set_assistant_goal_trip_link_v1(uuid,uuid,uuid,uuid,integer,integer,text,uuid,integer,boolean)
  to authenticated;

create function public.read_assistant_goal_trip_link_v1(p_goal_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); goal turn_private.assistant_goals%rowtype;
  conversation turn_private.assistant_conversations%rowtype; linked turn_private.assistant_goal_trip_links%rowtype;
  trip public.trips%rowtype; current_link boolean; consent_current boolean;
begin
  if p_goal_id is null then raise exception 'INVALID_INPUT'; end if;
  select * into goal from turn_private.assistant_goals where id=p_goal_id and owner_id=u;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  select * into conversation from turn_private.assistant_conversations where id=goal.conversation_id and owner_id=u;
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  consent_current:=turn_private.text_policy_current(conversation.policy_id)
    and exists(select 1 from turn_private.text_consents c where c.owner_id=u and c.policy_id=conversation.policy_id
      and c.consent_id=conversation.consent_id and c.revoked_at is null);
  select * into linked from turn_private.assistant_goal_trip_links where goal_id=p_goal_id and owner_id=u;
  if not found then return jsonb_build_object('kind','goal_trip_link','conversationId',goal.conversation_id,
    'goalId',goal.id,'goalScopeVersion',goal.scope_version,'linkVersion',0,'lastOperationId',null,'tripId',null,'tripHeadVersion',null,
    'terminalUnlinked',false,
    'sourceMessageId',null,'sourceKind',null,'current',false); end if;
  if linked.trip_id is not null then
    select * into trip from public.trips where id=linked.trip_id and owner_id=u;
  end if;
  current_link:=consent_current and linked.trip_id is not null and trip.id is not null and trip.head_version=linked.trip_head_version
    and goal.scope_version=linked.goal_scope_version
    and not exists(select 1 from public.trip_archives where trip_id=linked.trip_id and owner_id=u)
    and not exists(select 1 from privacy_private.trip_deletions where trip_id=linked.trip_id)
    and exists(select 1 from turn_private.assistant_goal_trip_receipts r where r.operation_id=linked.operation_id
      and r.owner_id=u and r.goal_id=goal.id and r.trip_id=linked.trip_id and r.trip_head_version=linked.trip_head_version
      and r.after_link_version=linked.link_version and r.after_goal_scope_version=linked.goal_scope_version
      and r.action='link' and r.source_kind='native_user_confirmed')
    and (linked.source_message_id is null or exists(select 1 from turn_private.assistant_messages m
      where m.id=linked.source_message_id and m.owner_id=u and m.conversation_id=goal.conversation_id
      and m.goal_id=goal.id and m.scope_version=linked.goal_scope_version-1
      and m.policy_id=conversation.policy_id and m.consent_id=conversation.consent_id));
  return jsonb_build_object('kind','goal_trip_link','conversationId',goal.conversation_id,
    'goalId',goal.id,'goalScopeVersion',goal.scope_version,'linkVersion',linked.link_version,'lastOperationId',linked.operation_id,
    'terminalUnlinked',linked.terminal_unlinked,
    'tripId',linked.trip_id,'tripHeadVersion',linked.trip_head_version,
    'sourceMessageId',case when consent_current then linked.source_message_id else null end,
    'sourceKind',case when consent_current then linked.source_kind else 'privacy_control' end,
    'current',current_link,'updatedAt',linked.updated_at);
end $$;
revoke all on function public.read_assistant_goal_trip_link_v1(uuid) from public,anon,service_role;
grant execute on function public.read_assistant_goal_trip_link_v1(uuid) to authenticated;

-- Minimal owner privacy index. It stays readable after text withdrawal so the
-- user can find and unlink an existing Trip reference without reopening consent.
create function public.list_assistant_goal_trip_links_v1(p_after_goal_id uuid default null,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); links jsonb:='[]'::jsonb; item record;
  cursor_id uuid; item_count integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'INVALID_INPUT'; end if;
  for item in select l.goal_id,jsonb_build_object('version',5,'kind','goal_trip_link',
        'conversationId',l.conversation_id,'goalId',l.goal_id,'goalScopeVersion',g.scope_version,
        'linkVersion',l.link_version,'lastOperationId',l.operation_id,'tripId',l.trip_id,
        'tripHeadVersion',l.trip_head_version,'terminalUnlinked',l.terminal_unlinked,
        'sourceMessageId',null,'sourceKind','privacy_control','current',false) item
      from turn_private.assistant_goal_trip_links l
      join turn_private.assistant_goals g on g.id=l.goal_id and g.owner_id=u
      where l.owner_id=u and l.trip_id is not null and (p_after_goal_id is null or l.goal_id>p_after_goal_id)
      order by l.goal_id limit p_limit+1 loop
    item_count:=item_count+1;
    if item_count>p_limit then
      return jsonb_build_object('kind','goal_trip_links','links',links,'nextCursor',cursor_id);
    end if;
    links:=links||jsonb_build_array(item.item);
    cursor_id:=item.goal_id;
  end loop;
  return jsonb_build_object('kind','goal_trip_links','links',links,'nextCursor',null);
end $$;
revoke all on function public.list_assistant_goal_trip_links_v1(uuid,integer) from public,anon,service_role;
grant execute on function public.list_assistant_goal_trip_links_v1(uuid,integer) to authenticated;

-- A confirmed, recently reauthenticated Trip deletion is also an explicit
-- decision to end that Trip's goal associations. Admission already holds the
-- Trip row lock, so detach and queue its tombstone in one transaction. This
-- keeps deletion possible after text-consent withdrawal without reviving it.
create function turn_private.guard_goal_trip_deletion_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare linked turn_private.assistant_goal_trip_links%rowtype; goal turn_private.assistant_goals%rowtype;
  operation uuid; digest text;
begin
  perform pg_catalog.set_config('lock_timeout','500ms',true);
  for linked in select * from turn_private.assistant_goal_trip_links l where l.trip_id=new.trip_id
      order by l.goal_id for update loop
    select * into goal from turn_private.assistant_goals g where g.id=linked.goal_id for update;
    if not found or goal.owner_id<>new.owner_id or linked.owner_id<>new.owner_id then raise exception 'TRIP_HAS_CHAT_REFERENCES'; end if;
    operation:=gen_random_uuid();
    digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(new.request_id,new.trip_id,linked.goal_id,
      linked.link_version,goal.scope_version,'trip_deletion_confirmed')::text,'UTF8')),'hex');
    update turn_private.assistant_goals set scope_version=scope_version+1,
      trip_terminal=(goal.scope_version=10000) where id=goal.id;
    update turn_private.assistant_goal_trip_links set link_version=link_version+1,operation_id=operation,
      goal_scope_version=goal.scope_version+1,trip_id=null,trip_head_version=null,source_message_id=null,
      source_kind='trip_deletion_confirmed',terminal_unlinked=(goal.scope_version=10000 or linked.link_version=10000),
      updated_at=clock_timestamp() where goal_id=goal.id;
    insert into turn_private.assistant_goal_trip_receipts(operation_id,owner_id,conversation_id,goal_id,session_id,
      request_digest,action,source_kind,source_message_id,before_link_version,after_link_version,
      before_goal_scope_version,after_goal_scope_version,trip_id,trip_head_version)
    values(operation,new.owner_id,goal.conversation_id,goal.id,(auth.jwt()->>'session_id')::uuid,
      digest,'unlink','trip_deletion_confirmed',null,linked.link_version,linked.link_version+1,
      goal.scope_version,goal.scope_version+1,new.trip_id,linked.trip_head_version);
  end loop;
  return new;
end $$;
revoke all on function turn_private.guard_goal_trip_deletion_v1() from public,anon,authenticated,service_role;
create trigger guard_goal_trip_deletion_v1 before insert on privacy_private.trip_deletions
  for each row execute function turn_private.guard_goal_trip_deletion_v1();

-- An already queued deletion is rechecked at execution too. Preserve the
-- existing Trip-core deletion transaction and its named denial unchanged.
create or replace function public.execute_trip_deletion_v1(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r privacy_private.trip_deletions%rowtype; target uuid; removed integer;
begin
 perform pg_catalog.set_config('lock_timeout','500ms',true);
 select trip_id into target from privacy_private.trip_deletions where request_id=p_request_id;
 if not found then raise exception 'INVALID_INPUT'; end if;
 perform 1 from public.trips where id=target for update;
 select * into r from privacy_private.trip_deletions where request_id=p_request_id for update;
 if r.state='completed' then return privacy_private.trip_deletion_receipt(r); end if;
 perform 1 from public.trips where id=r.trip_id and owner_id=r.owner_id for update;
 if not found then raise exception 'TRIP_DELETION_SOURCE_MISSING'; end if;
 if exists(select 1 from public.turns where trip_id=r.trip_id)
   or exists(select 1 from public.chat_threads where trip_id=r.trip_id)
   or exists(select 1 from turn_private.assistant_goal_trip_links where trip_id=r.trip_id)
 then raise exception 'TRIP_HAS_CHAT_REFERENCES'; end if;
 delete from public.trip_events where trip_id=r.trip_id;
 delete from public.trip_audit_events where trip_id=r.trip_id;
 delete from public.trip_idempotency i using public.trip_proposals p where i.proposal_id=p.id and p.trip_id=r.trip_id;
 loop
   delete from public.trip_proposals p where p.trip_id=r.trip_id
     and not exists(select 1 from public.trip_proposals child where child.parent_proposal_id=p.id);
   get diagnostics removed=row_count;
   exit when removed=0;
 end loop;
 if exists(select 1 from public.trip_proposals where trip_id=r.trip_id) then raise exception 'TRIP_LINEAGE_BLOCKED'; end if;
 delete from public.trips where id=r.trip_id and owner_id=r.owner_id;
 update privacy_private.trip_deletions set state='completed',completed_at=clock_timestamp()
 where request_id=p_request_id returning * into r;
 return privacy_private.trip_deletion_receipt(r);
end $$;

-- Scoped export/erase seams for the future all-user-data executor. They do not
-- claim that the current request-only privacy workflow has executed erasure.
create function public.assistant_goal_trip_export_owner_v1(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare links jsonb; receipts jsonb;
begin
  if (select auth.role())<>'service_role' or p_owner is null then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('goalId',l.goal_id,'conversationId',l.conversation_id,
    'linkVersion',l.link_version,'goalScopeVersion',l.goal_scope_version,'lastOperationId',l.operation_id,
    'terminalUnlinked',l.terminal_unlinked,'tripId',l.trip_id,
    'tripHeadVersion',l.trip_head_version,'sourceMessageId',l.source_message_id,'updatedAt',l.updated_at)
    order by l.goal_id),'[]'::jsonb) into links from turn_private.assistant_goal_trip_links l where l.owner_id=p_owner;
  select coalesce(jsonb_agg(jsonb_build_object('operationId',r.operation_id,'goalId',r.goal_id,
    'action',r.action,'sourceKind',r.source_kind,'sourceMessageId',r.source_message_id,'beforeLinkVersion',r.before_link_version,
    'afterLinkVersion',r.after_link_version,'beforeGoalScopeVersion',r.before_goal_scope_version,
    'afterGoalScopeVersion',r.after_goal_scope_version,'tripId',r.trip_id,'tripHeadVersion',r.trip_head_version,
    'createdAt',r.created_at) order by r.created_at,r.operation_id),'[]'::jsonb)
    into receipts from turn_private.assistant_goal_trip_receipts r where r.owner_id=p_owner;
  return jsonb_build_object('schemaVersion','assistant-goal-trip-export/1','links',links,'receipts',receipts);
end $$;
revoke all on function public.assistant_goal_trip_export_owner_v1(uuid) from public,anon,authenticated;
grant execute on function public.assistant_goal_trip_export_owner_v1(uuid) to service_role;

create function public.assistant_goal_trip_erase_owner_v1(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare removed_links integer; removed_receipts integer;
begin
  if (select auth.role())<>'service_role' or p_owner is null then raise exception 'FORBIDDEN'; end if;
  delete from turn_private.assistant_goal_trip_links where owner_id=p_owner;
  get diagnostics removed_links=row_count;
  delete from turn_private.assistant_goal_trip_receipts where owner_id=p_owner;
  get diagnostics removed_receipts=row_count;
  return jsonb_build_object('links',removed_links,'receipts',removed_receipts);
end $$;
revoke all on function public.assistant_goal_trip_erase_owner_v1(uuid) from public,anon,authenticated;
grant execute on function public.assistant_goal_trip_erase_owner_v1(uuid) to service_role;
notify pgrst, 'reload schema';
