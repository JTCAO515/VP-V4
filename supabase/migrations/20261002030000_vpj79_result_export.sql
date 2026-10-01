-- Result module preparation only: retained owner data, no public download,
-- request completion, new retention rule, source-body read or erasure.
create index result_artifacts_owner_export_v1 on turn_private.result_artifacts(owner_id,id);
create index result_revisions_owner_export_v1 on turn_private.result_revisions(owner_id,artifact_id,revision);

create function public.result_artifact_export_owner_v1(
  p_owner uuid,p_section text,p_cursor jsonb default null,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare anchor uuid; revision_anchor integer:=0; event_anchor bigint:=0;
  page jsonb; more boolean; cursor jsonb; required text[];
begin
  if (select auth.role()) is distinct from 'service_role' or p_owner is null then raise exception 'FORBIDDEN'; end if;
  if p_section is null or p_section not in ('artifacts','revisions','events')
    or p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
  if p_cursor is not null then
    required:=case p_section when 'artifacts' then array['ownerId','section','artifactId']
      when 'revisions' then array['ownerId','section','artifactId','revision']
      else array['ownerId','section','eventId'] end;
    if jsonb_typeof(p_cursor)<>'object' or not(p_cursor ?& required) or p_cursor-required<>'{}'::jsonb
      or p_cursor->>'ownerId' is distinct from p_owner::text or p_cursor->>'section' is distinct from p_section
      then raise exception 'INVALID_EXPORT_CURSOR'; end if;
    begin
      if p_section in ('artifacts','revisions') then
        if jsonb_typeof(p_cursor->'artifactId')<>'string' then raise exception 'INVALID_EXPORT_CURSOR'; end if;
        anchor:=(p_cursor->>'artifactId')::uuid;
        if anchor is null then raise exception 'INVALID_EXPORT_CURSOR'; end if;
        if p_section='revisions' then
          if jsonb_typeof(p_cursor->'revision')<>'number' or p_cursor->>'revision' !~ '^[1-9][0-9]{0,3}$'
            then raise exception 'INVALID_EXPORT_CURSOR'; end if;
          revision_anchor:=(p_cursor->>'revision')::integer;
        end if;
      else
        if jsonb_typeof(p_cursor->'eventId')<>'string' or p_cursor->>'eventId' !~ '^[1-9][0-9]{0,18}$'
          then raise exception 'INVALID_EXPORT_CURSOR'; end if;
        event_anchor:=(p_cursor->>'eventId')::bigint;
      end if;
    exception when others then raise exception 'INVALID_EXPORT_CURSOR'; end;
    if not exists(
      select 1 from turn_private.result_artifacts where p_section='artifacts' and owner_id=p_owner and id=anchor
      union all
      select 1 from turn_private.result_revisions r join turn_private.result_artifacts a on a.id=r.artifact_id and a.owner_id=p_owner
        where p_section='revisions' and r.owner_id=p_owner and r.artifact_id=anchor and r.revision=revision_anchor
      union all
      select 1 from turn_private.result_events e join turn_private.result_artifacts a on a.id=e.artifact_id and a.owner_id=p_owner
        where p_section='events' and e.owner_id=p_owner and e.id=event_anchor
    ) then raise exception 'INVALID_EXPORT_CURSOR'; end if;
  end if;
  with candidates as (
    (select id as artifact_key,0 as revision_key,0::bigint as event_key,
      jsonb_build_object('artifactId',id,'taskId',task_id,'goalId',goal_id,'inputMessageId',input_message_id,
        'tripId',trip_id,'currentRevision',current_revision,'lifecycle',lifecycle,'createdAt',created_at) as item,
      jsonb_build_object('ownerId',p_owner,'section',p_section,'artifactId',id) as next
      from turn_private.result_artifacts where p_section='artifacts' and owner_id=p_owner
        and id>=coalesce(anchor,'00000000-0000-0000-0000-000000000000'::uuid)
        and (anchor is null or id>anchor) order by id limit p_limit+1)
    union all
    (select r.artifact_id,r.revision,0::bigint,
      jsonb_build_object('artifactId',r.artifact_id,'revision',r.revision,'inputSequence',r.input_sequence,
        'taskTurnId',r.task_turn_id,'goalVersion',r.goal_version,'tripVersion',r.trip_version,
        'tripLinkOperationId',r.trip_link_operation_id,'tripLinkVersion',r.trip_link_version,
        'memoryBasis',r.memory_basis,'content',r.content,'createdAt',r.created_at),
      jsonb_build_object('ownerId',p_owner,'section',p_section,'artifactId',r.artifact_id,'revision',r.revision)
      from turn_private.result_revisions r join turn_private.result_artifacts a on a.id=r.artifact_id and a.owner_id=p_owner
      where p_section='revisions' and r.owner_id=p_owner
        and (r.artifact_id,r.revision)>=(coalesce(anchor,'00000000-0000-0000-0000-000000000000'::uuid),revision_anchor)
        and (anchor is null or (r.artifact_id,r.revision)>(anchor,revision_anchor))
      order by r.artifact_id,r.revision limit p_limit+1)
    union all
    (select null::uuid,0,e.id,
      jsonb_build_object('eventId',e.id::text,'artifactId',e.artifact_id,'revision',e.revision,
        'type',e.event_type,'createdAt',e.created_at),
      jsonb_build_object('ownerId',p_owner,'section',p_section,'eventId',e.id::text)
      from turn_private.result_events e join turn_private.result_artifacts a on a.id=e.artifact_id and a.owner_id=p_owner
      where p_section='events' and e.owner_id=p_owner and e.id>event_anchor order by e.id limit p_limit+1)
  ), page_window as (
    select * from candidates order by event_key,artifact_key,revision_key limit p_limit+1
  ), delivered as (
    select * from page_window order by event_key,artifact_key,revision_key limit p_limit
  )
  select coalesce((select jsonb_agg(item order by event_key,artifact_key,revision_key) from delivered),'[]'::jsonb),
    (select count(*)>p_limit from page_window),
    (select next from delivered order by event_key desc,artifact_key desc,revision_key desc limit 1)
    into page,more,cursor;
  return jsonb_build_object('schemaVersion','result-artifact-export/1','section',p_section,'items',page,
    'hasMore',more,'nextCursor',case when more then cursor else null end,'sectionComplete',not more);
end $$;
revoke all on function public.result_artifact_export_owner_v1(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.result_artifact_export_owner_v1(uuid,text,jsonb,integer) to service_role;
notify pgrst,'reload schema';
