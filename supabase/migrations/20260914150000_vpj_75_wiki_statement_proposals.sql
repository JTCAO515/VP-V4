-- #359: explicit structured draft version, preserving old {summary,gaps} rows.
create or replace function knowledge_review_private.wiki_draft_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare p jsonb; e jsonb;
begin
  if v->>'schemaVersion'='wiki-draft/2' then
    if knowledge_review_private.closed_object(v,array['schemaVersion','summary','gaps','statementProposals']) is distinct from true
      or jsonb_typeof(v->'statementProposals') is distinct from 'array'
      or jsonb_array_length(v->'statementProposals')>5 then return false; end if;
    for p in select x from jsonb_array_elements(v->'statementProposals') x loop
      if knowledge_review_private.closed_object(p,array['statement','evidence']) is distinct from true
        or p->'statement'->>'schemaVersion' is distinct from 'knowledge-statement/1'
        or knowledge_review_private.statement_valid(p->'statement') is distinct from true
        or jsonb_typeof(p->'evidence') is distinct from 'array'
        or jsonb_array_length(p->'evidence') not between 1 and 3
        or jsonb_array_length(p->'evidence')<>jsonb_array_length(p->'statement'->'sources')
        or (select count(distinct x->>'sourceRevisionId') from jsonb_array_elements(p->'evidence') x)<>jsonb_array_length(p->'evidence') then return false; end if;
      for e in select x from jsonb_array_elements(p->'evidence') x loop
        if knowledge_review_private.closed_object(e,array['sourceRevisionId','quote','startOffset','endOffset']) is distinct from true
          or jsonb_typeof(e->'sourceRevisionId') is distinct from 'string'
          or (e->>'sourceRevisionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or knowledge_review_private.wiki_text_valid(e->'quote',2000) is distinct from true
          or jsonb_typeof(e->'startOffset') is distinct from 'number' or jsonb_typeof(e->'endOffset') is distinct from 'number'
          or (e->>'startOffset') !~ '^(0|[1-9][0-9]{0,3})$' or (e->>'endOffset') !~ '^[1-9][0-9]{0,3}$'
          then return false; end if;
        if (e->>'endOffset')::integer>2000 or (e->>'endOffset')::integer-(e->>'startOffset')::integer<>length(e->>'quote') then return false; end if;
      end loop;
    end loop;
  elsif knowledge_review_private.closed_object(v,array['summary','gaps']) is distinct from true then return false;
  end if;
  if knowledge_review_private.wiki_text_valid(v->'summary',600) is distinct from true
    or jsonb_typeof(v->'gaps') is distinct from 'array' or jsonb_array_length(v->'gaps')>5 then return false; end if;
  return not exists(select 1 from jsonb_array_elements(v->'gaps') g where knowledge_review_private.wiki_text_valid(g,160) is distinct from true);
end $$;

create function knowledge_review_private.wiki_proposal_sources_valid(v jsonb, known_sources uuid[])
returns boolean language plpgsql set search_path='' as $$
declare p jsonb; e jsonb; src jsonb; s knowledge_review_private.source_revisions%rowtype; n integer; quote_text text; start_at integer;
begin
  if v->>'schemaVersion' is distinct from 'wiki-draft/2' then return true; end if;
  if cardinality(known_sources) not between 1 and 3 then return false; end if;
  perform id from knowledge_review_private.source_revisions where id=any(known_sources) order by id for share;
  get diagnostics n = row_count;
  if n<>cardinality(known_sources) then return false; end if;
  for p in select x from jsonb_array_elements(v->'statementProposals') x loop
    for e in select x from jsonb_array_elements(p->'evidence') x loop
      select * into s from knowledge_review_private.source_revisions where id=(e->>'sourceRevisionId')::uuid and id=any(known_sources);
      if not found then return false; end if;
      quote_text:=e->>'quote'; start_at:=(e->>'startOffset')::integer;
      if strpos(s.declaration->>'snippet',quote_text)<>start_at+1
        or strpos(substr(s.declaration->>'snippet',start_at+2),quote_text)>0
        or not exists(select 1 from jsonb_array_elements(p->'statement'->'sources') x where x=s.declaration) then return false; end if;
    end loop;
    for src in select x from jsonb_array_elements(p->'statement'->'sources') x loop
      if not exists(select 1 from knowledge_review_private.source_revisions canonical_source
        where canonical_source.declaration=src and canonical_source.id in(select (x->>'sourceRevisionId')::uuid from jsonb_array_elements(p->'evidence') x)) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function knowledge_review_private.wiki_proposal_sources_valid(jsonb,uuid[]) from public,anon,authenticated,service_role;

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
      if not knowledge_review_private.wiki_proposal_sources_valid(p_input->'outcome'->'draftContent',
        array(select (x#>>'{}')::uuid from jsonb_array_elements(p_input->'outcome'->'sourceRevisionIds') x)) then raise exception 'INVALID_INPUT'; end if;
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


-- Keep the editorial origin and optionally point at the immutable model proposal
-- from which the operator started. It is never a publication approval.
alter table knowledge_review_private.wiki_statement_candidates add column proposal_index integer check(proposal_index between 0 and 4);
create or replace function knowledge_review_private.candidate_json(p_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select knowledge_review_private.candidate_json_before_wiki_v1(p_id) || coalesce((
    select jsonb_build_object('wikiOrigin',jsonb_build_object('revisionId',r.id,
      'pageKey',p.page_key,'version',r.version,'method','operator_statement') || case when l.proposal_index is null then '{}'::jsonb else jsonb_build_object('proposalIndex',l.proposal_index) end)
    from knowledge_review_private.wiki_statement_candidates l
    join knowledge_review_private.wiki_page_revisions r on r.id=l.wiki_revision_id
    join knowledge_review_private.wiki_pages p on p.id=r.page_id where l.candidate_id=p_id
  ),'{}'::jsonb)
$$;
revoke all on function knowledge_review_private.candidate_json(uuid) from public,anon,authenticated,service_role;


create or replace function public.ops_review_workspace(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; cid uuid; revision knowledge_review_private.wiki_page_revisions%rowtype;
  page knowledge_review_private.wiki_pages%rowtype; prior knowledge_review_private.receipts%rowtype;
  src jsonb; source_row knowledge_review_private.source_revisions%rowtype; digest text; response_json jsonb;
begin
  if p_input->>'action' is distinct from 'submit_wiki_statement' then
    return knowledge_review_private.ops_review_workspace_before_wiki_v1(p_input);
  end if;
  u:=knowledge_review_private.current_actor();
  if knowledge_review_private.closed_object(p_input,case when p_input ? 'wikiProposalIndex' then array['action','operationId','candidateId','title','wikiRevisionId','expectedWikiVersion','statement','wikiProposalIndex'] else array['action','operationId','candidateId','title','wikiRevisionId','expectedWikiVersion','statement'] end) is distinct from true
    or octet_length(p_input::text)>24000
    or knowledge_review_private.bounded_text(p_input->'title',160) is distinct from true
    or knowledge_review_private.statement_valid(p_input->'statement') is distinct from true
    then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from unnest(array['operationId','candidateId','wikiRevisionId']) k
    where jsonb_typeof(p_input->k) is distinct from 'string'
      or (p_input->>k) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    or jsonb_typeof(p_input->'expectedWikiVersion') is distinct from 'number'
    or (p_input->>'expectedWikiVersion') !~ '^[1-9][0-9]{0,9}$'
    or (p_input->>'expectedWikiVersion')::numeric>2147483647 then raise exception 'INVALID_INPUT'; end if;
  if p_input ? 'wikiProposalIndex' and (jsonb_typeof(p_input->'wikiProposalIndex') is distinct from 'number' or (p_input->>'wikiProposalIndex') !~ '^[0-4]$') then raise exception 'INVALID_INPUT'; end if;
  op:=(p_input->>'operationId')::uuid; cid:=(p_input->>'candidateId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,14));
  select * into prior from knowledge_review_private.receipts where actor_id=u and operation_id=op;
  if found then
    if prior.input<>p_input then raise exception 'OPS_CONFLICT'; end if;
    return prior.result;
  end if;
  select * into revision from knowledge_review_private.wiki_page_revisions where id=(p_input->>'wikiRevisionId')::uuid;
  if not found then raise exception 'OPS_NOT_FOUND'; end if;
  select * into page from knowledge_review_private.wiki_pages where id=revision.page_id for share;
  select * into revision from knowledge_review_private.wiki_page_revisions where id=revision.id for share;
  if page.version<>revision.version or p_input->'expectedWikiVersion'<>to_jsonb(revision.version)
    or revision.draft_content is null or revision.validation_status='rejected' then raise exception 'OPS_CONFLICT'; end if;
  if p_input ? 'wikiProposalIndex' and (revision.draft_content->>'schemaVersion' is distinct from 'wiki-draft/2'
    or revision.draft_content->'statementProposals'->((p_input->>'wikiProposalIndex')::integer) is null) then raise exception 'OPS_CONFLICT'; end if;
  -- Source declarations must be exact existing dependencies; never mint authority
  -- from a model-supplied locator, publisher, text or revision label.
  for src in select x from jsonb_array_elements(p_input->'statement'->'sources') x order by x->>'sourceKey',x->>'revisionLabel' loop
    select * into source_row from knowledge_review_private.source_revisions
      where source_key=src->>'sourceKey' and revision_label=src->>'revisionLabel' for share;
    if not found or not (source_row.id=any(revision.source_revision_ids))
      or source_row.declaration<>src then raise exception 'OPS_CONFLICT'; end if;
  end loop;
  digest:=encode(extensions.digest(convert_to((p_input->'statement')::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(revision.id::text||':'||digest,76));
  select candidate_id into cid from knowledge_review_private.wiki_statement_candidates
    where wiki_revision_id=revision.id and statement_digest=digest;
  if found then
    response_json:=knowledge_review_private.candidate_json(cid);
    insert into knowledge_review_private.receipts(actor_id,operation_id,input,result) values(u,op,p_input,response_json);
    return response_json;
  end if;
  cid:=(p_input->>'candidateId')::uuid;
  perform knowledge_review_private.ops_review_workspace_before_wiki_v1(jsonb_build_object(
    'action','submit_statement','operationId',op,'candidateId',cid,'title',p_input->>'title','statement',p_input->'statement'));
  insert into knowledge_review_private.wiki_statement_candidates(candidate_id,wiki_revision_id,statement_digest,proposal_index)
    values(cid,revision.id,digest,(p_input->>'wikiProposalIndex')::integer);
  response_json:=knowledge_review_private.candidate_json(cid);
  update knowledge_review_private.receipts set input=p_input,result=response_json where actor_id=u and operation_id=op;
  return response_json;
end $$;
revoke all on function public.ops_review_workspace(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_review_workspace(jsonb) to authenticated;
