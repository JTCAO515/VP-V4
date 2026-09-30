-- Read-only keyset search over the existing private results; no body/index copy.
-- A cursor is an owner-bound, current eligible artifact anchor, not a hidden scan row.
create index result_artifacts_owner_search_v1
  on turn_private.result_artifacts(owner_id,created_at desc,id desc) where lifecycle='active';

create function public.search_result_artifacts_v1(p_query text default '',p_cursor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); anchor turn_private.result_artifacts%rowtype;
  anchor_revision turn_private.result_revisions%rowtype; rows jsonb; next_cursor uuid; overflow boolean;
begin
  if u is null or p_query is null or pg_catalog.length(p_query)>120 then raise exception 'INVALID_INPUT'; end if;
  p_query:=pg_catalog.lower(pg_catalog.btrim(p_query));
  if p_cursor is not null then
    select * into anchor from turn_private.result_artifacts where id=p_cursor and owner_id=u and lifecycle='active';
    if not found then return jsonb_build_object('kind','unavailable'); end if;
    select * into anchor_revision from turn_private.result_revisions
      where artifact_id=anchor.id and owner_id=u and revision=anchor.current_revision;
    if not found or not turn_private.valid_comparison_v1(anchor_revision.content)
      or turn_private.result_basis_state(anchor,anchor_revision)->>'current'<>'true'
      then return jsonb_build_object('kind','unavailable'); end if;
    if p_query<>'' and pg_catalog.strpos(pg_catalog.lower(anchor_revision.content->>'title'),p_query)=0
      and pg_catalog.strpos(pg_catalog.lower(anchor_revision.content->>'summary'),p_query)=0
      then return jsonb_build_object('kind','unavailable'); end if;
  end if;
  -- Bound raw work before query/eligibility filters: 128 candidates plus one
  -- content-free sentinel. Never expose the sentinel or a hidden-row cursor.
  -- Matching is literal (%, _ and backslash are not wildcards).
  with candidates as materialized (
    select a.* from turn_private.result_artifacts a
    where a.owner_id=u and a.lifecycle='active'
      and (p_cursor is null or (a.created_at,a.id)<(anchor.created_at,anchor.id))
    order by a.created_at desc,a.id desc limit 129
  ), bounded as materialized (
    select * from candidates order by created_at desc,id desc limit 128
  ), eligible as materialized (
    select a.id,a.created_at,r.revision,a.trip_id,r.trip_version,
      r.content->>'title' as title,r.content->>'summary' as summary
    from bounded a
    join turn_private.result_revisions r on r.artifact_id=a.id and r.owner_id=u and r.revision=a.current_revision
    where (p_query='' or pg_catalog.strpos(pg_catalog.lower(r.content->>'title'),p_query)>0
        or pg_catalog.strpos(pg_catalog.lower(r.content->>'summary'),p_query)>0)
      and turn_private.valid_comparison_v1(r.content)
      and turn_private.result_basis_state(a,r)->>'current'='true'
    order by a.created_at desc,a.id desc limit 21
  ), page as (select * from eligible order by created_at desc,id desc limit 20)
  select coalesce((select jsonb_agg(jsonb_build_object('artifactId',id,'revision',revision,
      'title',title,'summary',summary,'tripId',trip_id,'tripVersion',trip_version)
      order by created_at desc,id desc) from page),'[]'::jsonb),
    case when (select count(*) from eligible)>20 then
      (select id from page order by created_at asc,id asc limit 1) else null end,
    (select count(*) from candidates)>128 and (select count(*) from eligible)<=20
    into rows,next_cursor,overflow;
  -- Partial scans cannot claim no matches or reveal where hidden rows ended.
  if overflow then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','result_search','results',rows,'nextCursor',next_cursor);
end $$;
revoke all on function public.search_result_artifacts_v1(text,uuid) from public,anon,service_role;
grant execute on function public.search_result_artifacts_v1(text,uuid) to authenticated;
notify pgrst, 'reload schema';
