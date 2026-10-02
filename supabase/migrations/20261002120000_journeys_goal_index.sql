-- Read-only bounded projection of the existing conversation/goal facts.
create index assistant_goals_owner_index on turn_private.assistant_goals(owner_id,conversation_id,id);
create index assistant_conversations_owner_index on turn_private.assistant_conversations(owner_id,id);

-- Internal bounded snapshot; never granted to API roles. Count sentinels include
-- ineligible owner rows, so sparse history cannot masquerade as an empty index.
create function turn_private.journeys_goal_index_snapshot_v1(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); consent uuid; conversations jsonb; goals jsonb;
  rows jsonb; relations jsonb; stamp text;
begin
  if p_policy_id is null or not turn_private.text_policy_current(p_policy_id) then return null; end if;
  select consent_id into consent from turn_private.text_consents
    where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) into conversations
    from (select id,policy_id,consent_id,next_sequence from turn_private.assistant_conversations
      where owner_id=u order by id limit 101) c;
  if jsonb_array_length(conversations)>100 then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.conversation_id,g.id),'[]'::jsonb) into goals
    from (select id,conversation_id,scope_version,current_text from turn_private.assistant_goals
      where owner_id=u order by conversation_id,id limit 501) g;
  if jsonb_array_length(goals)>500 then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('conversationId',x.conversation_id,'goalId',x.id,
    'scopeVersion',x.scope_version,'text',x.current_text) order by x.conversation_id,x.id),'[]'::jsonb) into rows
    from jsonb_to_recordset(goals) as x(id uuid,conversation_id uuid,scope_version integer,current_text text)
    join jsonb_to_recordset(conversations) as c(id uuid,policy_id uuid,consent_id uuid,next_sequence bigint)
      on c.id=x.conversation_id and c.policy_id=p_policy_id and c.consent_id=consent;
  -- Set-based fingerprint of bounded relation inputs, NOT a second eligibility
  -- authority. Only the <=20 returned goals invoke the canonical relation reader.
  select coalesce(jsonb_agg(jsonb_build_array(x.id,to_jsonb(l),t.id,t.head_version,
      exists(select 1 from public.trip_archives a where a.trip_id=l.trip_id and a.owner_id=u),
      exists(select 1 from privacy_private.trip_deletions d where d.trip_id=l.trip_id),
      to_jsonb(r),m.id,m.owner_id,m.conversation_id,m.goal_id,m.scope_version,m.policy_id,m.consent_id)
      order by x.conversation_id,x.id),'[]'::jsonb) into relations
    from jsonb_to_recordset(goals) as x(id uuid,conversation_id uuid)
    left join turn_private.assistant_goal_trip_links l on l.goal_id=x.id and l.owner_id=u
    left join public.trips t on t.id=l.trip_id and t.owner_id=u
    left join turn_private.assistant_goal_trip_receipts r on r.operation_id=l.operation_id and r.owner_id=u
    left join turn_private.assistant_messages m on m.id=l.source_message_id and m.owner_id=u;
  -- Includes private owner/session/consent identity, all bounded memberships,
  -- text corrections and live relation inputs. These inputs leave SQL only as a digest.
  stamp:=md5(jsonb_build_array(u,auth.jwt()->>'session_id',p_policy_id,consent,conversations,goals,relations)::text);
  return jsonb_build_object('snapshot',stamp,'goals',rows);
end $$;
revoke all on function turn_private.journeys_goal_index_snapshot_v1(uuid) from public,anon,authenticated,service_role;

create function public.read_journeys_goal_index_v1(p_policy_id uuid,p_cursor text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare first_snapshot jsonb; final_snapshot jsonb; parts text[]; after_conversation uuid; after_goal uuid;
  page jsonb:='[]'::jsonb; candidates jsonb; last_row jsonb; g jsonb; link jsonb; relation jsonb;
begin
  first_snapshot:=turn_private.journeys_goal_index_snapshot_v1(p_policy_id);
  if first_snapshot is null then return jsonb_build_object('kind','unavailable'); end if;
  if p_cursor is not null then
    if length(p_cursor)>120 or p_cursor !~ '^v1\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{32}$'
      then return jsonb_build_object('kind','unavailable'); end if;
    parts:=string_to_array(p_cursor,'.');
    if parts[4]<>first_snapshot->>'snapshot' then return jsonb_build_object('kind','unavailable'); end if;
    after_conversation:=parts[2]::uuid; after_goal:=parts[3]::uuid;
    if not exists(select 1 from jsonb_array_elements(first_snapshot->'goals') anchor
      where anchor.value->>'conversationId'=parts[2] and anchor.value->>'goalId'=parts[3]) then return jsonb_build_object('kind','unavailable'); end if;
  end if;
  select coalesce(jsonb_agg(x.value order by x.value->>'conversationId',x.value->>'goalId'),'[]'::jsonb) into candidates
    from (select item.value from jsonb_array_elements(first_snapshot->'goals') item
      where after_goal is null or ((item.value->>'conversationId')::uuid,(item.value->>'goalId')::uuid)>(after_conversation,after_goal)
      order by item.value->>'conversationId',item.value->>'goalId' limit 21) x;
  for g in select value from jsonb_array_elements(candidates) with ordinality x(value,ordinal) where ordinal<=20 order by ordinal loop
    link:=public.read_assistant_goal_trip_link_v1((g->>'goalId')::uuid);
    if link->>'kind' is distinct from 'goal_trip_link' or link->>'conversationId' is distinct from g->>'conversationId'
      or link->>'goalId' is distinct from g->>'goalId' or link->>'goalScopeVersion' is distinct from g->>'scopeVersion' then
      return jsonb_build_object('kind','unavailable'); end if;
    relation:=case when link->'tripId'='null'::jsonb and link->'tripHeadVersion'='null'::jsonb
      then jsonb_build_object('state','unlinked','tripId',null,'tripHeadVersion',null)
      when link->'current'='true'::jsonb then jsonb_build_object('state','linked','tripId',link->'tripId','tripHeadVersion',link->'tripHeadVersion')
      else jsonb_build_object('state','unknown','tripId',null,'tripHeadVersion',null) end;
    page:=page||jsonb_build_array(g||jsonb_build_object('relation',relation));
  end loop;
  final_snapshot:=turn_private.journeys_goal_index_snapshot_v1(p_policy_id);
  if final_snapshot is null or final_snapshot<>first_snapshot then return jsonb_build_object('kind','unavailable'); end if;
  last_row:=page->(jsonb_array_length(page)-1);
  return jsonb_build_object('kind','journeys_goal_index','snapshot',first_snapshot->'snapshot','goals',page,
    'nextCursor',case when jsonb_array_length(candidates)>20 then
      'v1.'||(last_row->>'conversationId')||'.'||(last_row->>'goalId')||'.'||(first_snapshot->>'snapshot') else null end);
end $$;
revoke all on function public.read_journeys_goal_index_v1(uuid,text) from public,anon,service_role;
grant execute on function public.read_journeys_goal_index_v1(uuid,text) to authenticated;
notify pgrst, 'reload schema';
