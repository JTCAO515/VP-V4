-- #359: exact Wiki revision -> existing statement candidate/review/publication.
-- This records operator-authored statements, not automatic extraction or publication.
create table knowledge_review_private.wiki_statement_candidates (
  candidate_id uuid primary key references knowledge_review_private.candidates(id),
  wiki_revision_id uuid not null references knowledge_review_private.wiki_page_revisions(id),
  statement_digest text not null check (statement_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (wiki_revision_id, statement_digest)
);
alter table knowledge_review_private.wiki_statement_candidates enable row level security;
revoke all on knowledge_review_private.wiki_statement_candidates from public,anon,authenticated,service_role;

alter function knowledge_review_private.candidate_json(uuid) rename to candidate_json_before_wiki_v1;
revoke all on function knowledge_review_private.candidate_json_before_wiki_v1(uuid) from public,anon,authenticated,service_role;
create function knowledge_review_private.candidate_json(p_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select knowledge_review_private.candidate_json_before_wiki_v1(p_id) || coalesce((
    select jsonb_build_object('wikiOrigin',jsonb_build_object('revisionId',r.id,
      'pageKey',p.page_key,'version',r.version,'method','operator_statement'))
    from knowledge_review_private.wiki_statement_candidates l
    join knowledge_review_private.wiki_page_revisions r on r.id=l.wiki_revision_id
    join knowledge_review_private.wiki_pages p on p.id=r.page_id where l.candidate_id=p_id
  ),'{}'::jsonb)
$$;
revoke all on function knowledge_review_private.candidate_json(uuid) from public,anon,authenticated,service_role;

alter function public.ops_review_workspace(jsonb) rename to ops_review_workspace_before_wiki_v1;
alter function public.ops_review_workspace_before_wiki_v1(jsonb) set schema knowledge_review_private;
revoke all on function knowledge_review_private.ops_review_workspace_before_wiki_v1(jsonb) from public,anon,authenticated,service_role;
create function public.ops_review_workspace(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; cid uuid; revision knowledge_review_private.wiki_page_revisions%rowtype;
  page knowledge_review_private.wiki_pages%rowtype; prior knowledge_review_private.receipts%rowtype;
  src jsonb; source_row knowledge_review_private.source_revisions%rowtype; digest text; response_json jsonb;
begin
  if p_input->>'action' is distinct from 'submit_wiki_statement' then
    return knowledge_review_private.ops_review_workspace_before_wiki_v1(p_input);
  end if;
  u:=knowledge_review_private.current_actor();
  if knowledge_review_private.closed_object(p_input,array['action','operationId','candidateId','title','wikiRevisionId','expectedWikiVersion','statement']) is distinct from true
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
  insert into knowledge_review_private.wiki_statement_candidates(candidate_id,wiki_revision_id,statement_digest)
    values(cid,revision.id,digest);
  response_json:=knowledge_review_private.candidate_json(cid);
  update knowledge_review_private.receipts set input=p_input,result=response_json where actor_id=u and operation_id=op;
  return response_json;
end $$;
revoke all on function public.ops_review_workspace(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_review_workspace(jsonb) to authenticated;
