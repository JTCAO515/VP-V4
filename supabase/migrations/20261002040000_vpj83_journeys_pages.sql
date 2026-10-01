-- Additive, owner/consent-checked read only; no writer or prior RPC is changed.
create index assistant_goals_journeys_page on turn_private.assistant_goals(conversation_id,id);
create index assistant_conversations_journeys_current on turn_private.assistant_conversations(owner_id,policy_id,consent_id,created_at desc,id desc);

create function public.read_assistant_journeys_page_v1(p_policy_id uuid,p_cursor text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.assistant_conversations%rowtype;
  parts text[]; after_id uuid; stamp text; final_stamp text; bounded_count integer;
  page jsonb; last_id uuid; more boolean;
begin
  if p_policy_id is null or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select a.* into c from turn_private.assistant_conversations a
    join turn_private.text_consents tc on tc.owner_id=u and tc.policy_id=p_policy_id and tc.consent_id=a.consent_id and tc.revoked_at is null
    where a.owner_id=u and a.policy_id=p_policy_id order by a.created_at desc,a.id desc limit 1;
  if not found then
    if p_cursor is not null then return jsonb_build_object('kind','unavailable'); end if;
    return jsonb_build_object('kind','journeys_page','conversationId',null,'conversationVersion',0,'snapshot',null,'goals','[]'::jsonb,'nextCursor',null);
  end if;
  -- Digest scans at most 101 rows; 100 is the accepted conversation writer limit.
  select count(*),md5(coalesce(string_agg(g.id::text||':'||g.scope_version::text||':'||coalesce(l.link_version,0)::text,',' order by g.id),''))
    into bounded_count,stamp from (select id,scope_version from turn_private.assistant_goals where conversation_id=c.id and owner_id=u order by id limit 101) g
    left join turn_private.assistant_goal_trip_links l on l.goal_id=g.id and l.owner_id=u;
  if bounded_count>100 then return jsonb_build_object('kind','unavailable'); end if;
  if p_cursor is not null then
    if length(p_cursor)>160 or p_cursor !~ '^v1\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[1-9][0-9]{0,6}\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{32}$'
      then return jsonb_build_object('kind','unavailable'); end if;
    parts:=string_to_array(p_cursor,'.');
    -- Authenticate before examining a cursor. No foreign/stale metadata is returned.
    if parts[2]<>c.id::text or parts[3]<>c.next_sequence::text or parts[5]<>stamp then return jsonb_build_object('kind','unavailable'); end if;
    after_id:=parts[4]::uuid;
    if not exists(select 1 from turn_private.assistant_goals where id=after_id and conversation_id=c.id and owner_id=u)
      then return jsonb_build_object('kind','unavailable'); end if;
  end if;
  -- One 21-row candidate read (20 plus sentinel). The digest checks above/below
  -- each read up to 101 membership rows, so the entire RPC is not a 21-row scan.
  with candidates as materialized (
    select id,scope_version,current_text from turn_private.assistant_goals
    where conversation_id=c.id and owner_id=u and (after_id is null or id>after_id) order by id limit 21
  ), visible as (select * from candidates order by id limit 20),
  relations as materialized (select g.*,public.read_assistant_goal_trip_link_v1(g.id) as link from visible g)
  select coalesce(jsonb_agg(jsonb_build_object('goalId',g.id,'scopeVersion',g.scope_version,'text',g.current_text,
      'relation',case when link->>'kind'='goal_trip_link' and link->>'conversationId'=c.id::text and link->>'goalId'=g.id::text
        and (link->>'goalScopeVersion')::integer=g.scope_version then
          case when link->'tripId'='null'::jsonb and link->'tripHeadVersion'='null'::jsonb
            then jsonb_build_object('state','unlinked','tripId',null,'tripHeadVersion',null)
          when link->'current'='true'::jsonb then jsonb_build_object('state','linked','tripId',link->'tripId','tripHeadVersion',link->'tripHeadVersion')
          else jsonb_build_object('state','unknown','tripId',null,'tripHeadVersion',null) end
        else jsonb_build_object('state','unknown','tripId',null,'tripHeadVersion',null) end) order by g.id),'[]'::jsonb),(array_agg(g.id order by g.id desc))[1],(select count(*)>20 from candidates)
    into page,last_id,more from relations g;
  -- Goal/link versions and latest conversation are pinned; relation eligibility is
  -- live per page (Trip head/archive/delete can change without changing digest).
  select md5(coalesce(string_agg(g.id::text||':'||g.scope_version::text||':'||coalesce(l.link_version,0)::text,',' order by g.id),''))
    into final_stamp from (select id,scope_version from turn_private.assistant_goals where conversation_id=c.id and owner_id=u order by id limit 101) g
    left join turn_private.assistant_goal_trip_links l on l.goal_id=g.id and l.owner_id=u;
  if final_stamp<>stamp or not turn_private.text_policy_current(p_policy_id)
    or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null)
    or not exists(select 1 from turn_private.assistant_conversations where id=c.id and owner_id=u and next_sequence=c.next_sequence)
    or c.id<>(select id from turn_private.assistant_conversations where owner_id=u and policy_id=p_policy_id and consent_id=c.consent_id order by created_at desc,id desc limit 1)
    then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','journeys_page','conversationId',c.id,'conversationVersion',c.next_sequence,'snapshot',stamp,
    'goals',page,'nextCursor',case when more then 'v1.'||c.id::text||'.'||c.next_sequence::text||'.'||last_id::text||'.'||stamp else null end);
end $$;
revoke all on function public.read_assistant_journeys_page_v1(uuid,text) from public,anon,service_role;
grant execute on function public.read_assistant_journeys_page_v1(uuid,text) to authenticated;
