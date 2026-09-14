-- #359: append-only upgrade; NULL preserves genuinely missing historical bodies.
-- Existing receipt replay remains intact. New successful completions require the full draft.
-- Match JavaScript trim() and UTF-16 code-unit limits in the provider validator.
create function knowledge_review_private.wiki_text_valid(v jsonb, max_units integer)
returns boolean language plpgsql immutable set search_path='' as $$
declare value text; units integer;
begin
  if jsonb_typeof(v) is distinct from 'string' then return false; end if;
  value := v#>>'{}';
  if length(value) not between 1 and max_units
    or btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> value then return false; end if;
  select sum(case when ascii(c)>65535 then 2 else 1 end) into units from regexp_split_to_table(value,'') c;
  return units <= max_units;
end $$;
create function knowledge_review_private.wiki_draft_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if knowledge_review_private.closed_object(v,array['summary','gaps']) is distinct from true
    or knowledge_review_private.wiki_text_valid(v->'summary',600) is distinct from true
    or jsonb_typeof(v->'gaps') is distinct from 'array' then return false; end if;
  if jsonb_array_length(v->'gaps') > 5 then return false; end if;
  return not exists(select 1 from jsonb_array_elements(v->'gaps') g
    where knowledge_review_private.wiki_text_valid(g,160) is distinct from true);
end $$;
revoke all on function knowledge_review_private.wiki_text_valid(jsonb,integer),knowledge_review_private.wiki_draft_valid(jsonb) from public,anon,authenticated,service_role;
alter table knowledge_review_private.wiki_page_revisions add column draft_content jsonb;
alter table knowledge_review_private.wiki_page_revisions add constraint wiki_draft_content_valid
  check (draft_content is null or knowledge_review_private.wiki_draft_valid(draft_content));

create or replace function public.ops_wiki_generation_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid; op uuid; action text; result jsonb;
  receipt knowledge_review_private.receipts%rowtype;
  page knowledge_review_private.wiki_pages%rowtype;
  job knowledge_review_private.wiki_generation_jobs%rowtype;
  next_version integer;
  revision_id uuid;
begin
  u := knowledge_review_private.current_actor();
  if p_input is null or jsonb_typeof(p_input) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  action := p_input->>'action';
  if action is null or action not in ('claim', 'complete') then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(p_input->'operationId') is distinct from 'string'
    or (p_input->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
  op := (p_input->>'operationId')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text || ':' || op::text, 15));
  select * into receipt from knowledge_review_private.receipts where actor_id = u and operation_id = op;
  if found then
    if receipt.input <> p_input then raise exception 'OPS_CONFLICT'; end if;
    return receipt.result;
  end if;

  if action = 'claim' then
    if not knowledge_review_private.closed_object(p_input, array['action', 'operationId', 'pageType', 'pageKey', 'sourceRevisionIds', 'promptVersion', 'configDigest', 'inputDigest'])
      or (p_input->>'pageType') not in ('source_summary', 'entity_procedure', 'topic', 'comparison_gap')
      or length(btrim(p_input->>'pageKey')) not between 1 and 200
      or jsonb_typeof(p_input->'sourceRevisionIds') <> 'array' or jsonb_array_length(p_input->'sourceRevisionIds') < 1
      or exists(select 1 from jsonb_array_elements_text(p_input->'sourceRevisionIds') x where x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or length(btrim(p_input->>'promptVersion')) not between 1 and 60
      or (p_input->>'configDigest') !~ '^[0-9a-f]{64}$' or (p_input->>'inputDigest') !~ '^[0-9a-f]{64}$'
      then raise exception 'INVALID_INPUT'; end if;

    insert into knowledge_review_private.wiki_pages(page_type, page_key)
      values (p_input->>'pageType', p_input->>'pageKey')
      on conflict (page_key) do nothing;
    select * into page from knowledge_review_private.wiki_pages where page_key = p_input->>'pageKey' for update;
    if page.page_type <> p_input->>'pageType' then raise exception 'OPS_CONFLICT'; end if;

    select * into job from knowledge_review_private.wiki_generation_jobs
      where page_key = p_input->>'pageKey' and input_digest = p_input->>'inputDigest' for update;
    if not found then
      insert into knowledge_review_private.wiki_generation_jobs(page_key, input_digest, status, started_at)
        values (p_input->>'pageKey', p_input->>'inputDigest', 'running', clock_timestamp())
        returning * into job;
    elsif job.status = 'succeeded' then
      result := jsonb_build_object('kind', 'already_succeeded', 'jobId', job.id, 'pageId', page.id, 'pageVersion', page.version);
      insert into knowledge_review_private.receipts(actor_id, operation_id, input, result) values (u, op, p_input, result);
      return result;
    elsif job.status in ('queued', 'running') then
      raise exception 'OPS_CONFLICT';
    else
      update knowledge_review_private.wiki_generation_jobs
        set status = 'running', started_at = clock_timestamp(), finished_at = null, error_code = null, cost_tokens = null, cost_unknown = true
        where id = job.id returning * into job;
    end if;
    result := jsonb_build_object('kind', 'claimed', 'jobId', job.id, 'pageId', page.id, 'pageKey', page.page_key, 'expectedVersion', page.version);
  else
    if not knowledge_review_private.closed_object(p_input, array['action', 'operationId', 'jobId', 'outcome'])
      or jsonb_typeof(p_input->'jobId') is distinct from 'string'
      or (p_input->>'jobId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(p_input->'outcome') <> 'object' then raise exception 'INVALID_INPUT'; end if;

    select * into job from knowledge_review_private.wiki_generation_jobs where id = (p_input->>'jobId')::uuid;
    if not found then raise exception 'OPS_NOT_FOUND'; end if;
    select * into page from knowledge_review_private.wiki_pages where page_key = job.page_key for update;
    select * into job from knowledge_review_private.wiki_generation_jobs where id = job.id for update;
    if job.status <> 'running' then raise exception 'OPS_CONFLICT'; end if;

    if p_input->'outcome'->>'kind' = 'succeeded' then
      if not knowledge_review_private.closed_object(p_input->'outcome', array['kind', 'costTokens', 'expectedVersion', 'sourceRevisionIds', 'statementRefs', 'promptVersion', 'configDigest', 'generatedAt', 'changeNote', 'draftContent'])
        or knowledge_review_private.wiki_draft_valid(p_input->'outcome'->'draftContent') is distinct from true
        or jsonb_typeof(p_input->'outcome'->'costTokens') <> 'number' or (p_input->'outcome'->>'costTokens')::numeric < 0
        or (p_input->'outcome'->'expectedVersion') is distinct from to_jsonb(page.version)
        or jsonb_typeof(p_input->'outcome'->'sourceRevisionIds') <> 'array' or jsonb_array_length(p_input->'outcome'->'sourceRevisionIds') < 1
        or jsonb_typeof(p_input->'outcome'->'statementRefs') <> 'array'
        or jsonb_array_length(p_input->'outcome'->'sourceRevisionIds') > 20
        or jsonb_array_length(p_input->'outcome'->'statementRefs') > 100
        or length(btrim(p_input->'outcome'->>'promptVersion')) not between 1 and 60
        or (p_input->'outcome'->>'configDigest') !~ '^[0-9a-f]{64}$'
        or (p_input->'outcome'->>'generatedAt') is null
        or length(btrim(p_input->'outcome'->>'changeNote')) not between 1 and 400
        then
        if (p_input->'outcome'->'expectedVersion') is distinct from to_jsonb(page.version) then raise exception 'OPS_CONFLICT'; end if;
        raise exception 'INVALID_INPUT';
      end if;
      next_version := page.version + 1;
      insert into knowledge_review_private.wiki_page_revisions(
        page_id, version, source_revision_ids, statement_refs, job_id, prompt_version, config_digest, input_digest, generated_at, change_note, draft_content)
        select page.id, next_version,
          array(select (x#>>'{}')::uuid from jsonb_array_elements(p_input->'outcome'->'sourceRevisionIds') x),
          array(select (x#>>'{}')::uuid from jsonb_array_elements(p_input->'outcome'->'statementRefs') x),
          job.id, p_input->'outcome'->>'promptVersion', p_input->'outcome'->>'configDigest', job.input_digest,
          (p_input->'outcome'->>'generatedAt')::timestamptz, p_input->'outcome'->>'changeNote', p_input->'outcome'->'draftContent'
        returning id into revision_id;
      update knowledge_review_private.wiki_pages set version = next_version where id = page.id;
      update knowledge_review_private.wiki_generation_jobs
        set status = 'succeeded', finished_at = clock_timestamp(), cost_tokens = (p_input->'outcome'->>'costTokens')::integer, cost_unknown = false
        where id = job.id;
      result := jsonb_build_object('kind', 'succeeded', 'jobId', job.id, 'pageId', page.id, 'revisionId', revision_id, 'version', next_version);
    elsif p_input->'outcome'->>'kind' = 'failed' then
      if not knowledge_review_private.closed_object(p_input->'outcome', array['kind', 'errorCode'])
        or length(btrim(p_input->'outcome'->>'errorCode')) not between 1 and 60 then raise exception 'INVALID_INPUT'; end if;
      update knowledge_review_private.wiki_generation_jobs
        set status = 'failed', finished_at = clock_timestamp(), error_code = p_input->'outcome'->>'errorCode' where id = job.id;
      result := jsonb_build_object('kind', 'failed', 'jobId', job.id);
    elsif p_input->'outcome'->>'kind' = 'cancelled' then
      if not knowledge_review_private.closed_object(p_input->'outcome', array['kind']) then raise exception 'INVALID_INPUT'; end if;
      update knowledge_review_private.wiki_generation_jobs
        set status = 'cancelled', finished_at = clock_timestamp() where id = job.id;
      result := jsonb_build_object('kind', 'cancelled', 'jobId', job.id);
    else
      raise exception 'INVALID_INPUT';
    end if;
  end if;

  insert into knowledge_review_private.receipts(actor_id, operation_id, input, result) values (u, op, p_input, result);
  return result;
end $$;

revoke all on function public.ops_wiki_generation_v1(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ops_wiki_generation_v1(jsonb) to authenticated;

-- A single statement snapshots current/previous revisions together. Authentication
-- and the existing live Ops switch/membership guard run before every read.
create function public.ops_wiki_read_v1(p_input jsonb)
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
        'declaration',s.declaration,'snippetHash',s.snippet_hash,'lineageStatus',s.lineage_status)
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
