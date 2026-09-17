-- VPJ-75 (#359): surface a cited source's withdrawal status in the existing
-- Wiki read RPC. docs/contracts/wiki-source-withdrawal.md's "What this does
-- not do" section named this explicitly: "No /ops/wiki UI for withdrawing a
-- source or seeing withdrawal status -- this is a database/RPC-level
-- capability only". The prior slice (20260916120000) added withdrawn_at/
-- withdrawn_by/withdrawal_reason to source_revisions and wired the dispatch
-- barrier, but never returned those columns from any read path, so an Ops
-- reviewer looking at a page/revision had no way to see that one of its
-- cited sources had since been withdrawn. This migration only adds those
-- three fields to each already-returned source object in
-- public.ops_wiki_read_v1; nothing else in this function changes, and
-- public.ops_wiki_generation_v1 / public.ops_source_revision_withdraw_v1
-- (the write paths) are untouched by this migration.
create or replace function public.ops_wiki_read_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform knowledge_review_private.current_actor();
  if p_input = '{}'::jsonb then
    select jsonb_build_object('pages',coalesce(jsonb_agg(x),'[]'::jsonb)) into result
      from (select page_key as "pageKey",page_type as "pageType",version
        from knowledge_review_private.wiki_pages order by created_at desc,id limit 50) x;
    return result;
  end if;
  if knowledge_review_private.closed_object(p_input,array['pageKey']) is distinct from true
    or knowledge_review_private.bounded_text(p_input->'pageKey',200) is distinct from true
    then raise exception 'INVALID_INPUT'; end if;
  select jsonb_build_object('pageKey',p.page_key,'pageType',p.page_type,'version',p.version,
    'revisions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'version',r.version,'draftContent',r.draft_content,'validationStatus',r.validation_status,
      'changeNote',r.change_note,'jobId',r.job_id,'promptVersion',r.prompt_version,
      'configDigest',r.config_digest,'inputDigest',r.input_digest,'generatedAt',r.generated_at,
      'sourceRevisionIds',r.source_revision_ids,'statementRefs',r.statement_refs,
      'sources',coalesce((select jsonb_agg(jsonb_build_object('id',sid,'missing',s.id is null,
        'declaration',s.declaration,'snippetHash',s.snippet_hash,'lineageStatus',s.lineage_status,
        'withdrawnAt',s.withdrawn_at,'withdrawnBy',s.withdrawn_by,'withdrawalReason',s.withdrawal_reason)
        order by n) from unnest(r.source_revision_ids) with ordinality ids(sid,n)
        left join knowledge_review_private.source_revisions s on s.id=sid),'[]'::jsonb))
      order by r.version desc) from knowledge_review_private.wiki_page_revisions r
      where r.page_id=p.id and r.version in (p.version,p.version-1)),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(j order by j."startedAt" desc) from
      (select id,status,started_at as "startedAt",finished_at as "finishedAt",error_code as "errorCode",
        cost_tokens as "costTokens",cost_unknown as "costUnknown"
       from knowledge_review_private.wiki_generation_jobs where page_key=p.page_key
       order by created_at desc,id limit 10) j),'[]'::jsonb)) into result
  from knowledge_review_private.wiki_pages p where p.page_key=p_input->>'pageKey';
  if result is null then raise exception 'OPS_NOT_FOUND'; end if;
  return result;
end $$;
revoke all on function public.ops_wiki_read_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_wiki_read_v1(jsonb) to authenticated;
