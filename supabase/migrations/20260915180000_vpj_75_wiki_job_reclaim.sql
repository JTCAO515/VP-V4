-- #359: reclaim a stale 'running' wiki_generation_jobs row after a worker
-- crashes between claim and complete. Slice 2's dispatcher deliberately left
-- this unbuilt (see docs/contracts/wiki-generation-dispatch.md, "Non-goals"):
-- a job stuck in 'running' with no crash recovery.
--
-- Naive fix (just let claim proceed if started_at is old) has a real race:
-- the crashed worker might not actually be dead -- it could complete() late,
-- after a second worker has already reclaimed and is running its own
-- attempt. Without a fencing token, that late completion would silently
-- overwrite the new attempt's page version or falsely mark it succeeded/
-- failed. claim_token closes that: complete() must present the exact token
-- its claim() returned, and reclaiming a job mints a new token, so a late
-- completion from the reclaimed-away attempt is rejected as OPS_CONFLICT
-- instead of racing the new one.
alter table knowledge_review_private.wiki_generation_jobs
  add column claim_token uuid not null default gen_random_uuid();

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
    elsif job.status = 'queued' or (job.status = 'running' and job.started_at > clock_timestamp() - interval '5 minutes') then
      raise exception 'OPS_CONFLICT';
    else
      -- Either a terminal (failed/cancelled) retry, or a 'running' job whose
      -- claim is more than 5 minutes old -- treated as an abandoned worker.
      -- A fresh claim_token fences off any late completion from whoever held
      -- the job before this reclaim.
      update knowledge_review_private.wiki_generation_jobs
        set status = 'running', started_at = clock_timestamp(), finished_at = null, error_code = null,
          cost_tokens = null, cost_unknown = true, claim_token = gen_random_uuid()
        where id = job.id returning * into job;
    end if;
    result := jsonb_build_object('kind', 'claimed', 'jobId', job.id, 'pageId', page.id, 'pageKey', page.page_key, 'expectedVersion', page.version, 'claimToken', job.claim_token);
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

    -- Fencing check, shared by all three outcome kinds: a completion must
    -- present the exact token its own claim() returned. A job that has
    -- since been reclaimed (fresh claim_token) rejects the old holder's
    -- completion instead of racing or silently overwriting the reclaimer.
    if jsonb_typeof(p_input->'outcome'->'claimToken') is distinct from 'string'
      or (p_input->'outcome'->>'claimToken') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then raise exception 'INVALID_INPUT'; end if;
    if (p_input->'outcome'->>'claimToken')::uuid is distinct from job.claim_token then raise exception 'OPS_CONFLICT'; end if;

    if p_input->'outcome'->>'kind' = 'succeeded' then
      if not knowledge_review_private.closed_object(p_input->'outcome', array['kind', 'costTokens', 'expectedVersion', 'sourceRevisionIds', 'statementRefs', 'promptVersion', 'configDigest', 'generatedAt', 'changeNote', 'draftContent', 'claimToken'])
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
      if not knowledge_review_private.closed_object(p_input->'outcome', array['kind', 'errorCode', 'claimToken'])
        or length(btrim(p_input->'outcome'->>'errorCode')) not between 1 and 60 then raise exception 'INVALID_INPUT'; end if;
      update knowledge_review_private.wiki_generation_jobs
        set status = 'failed', finished_at = clock_timestamp(), error_code = p_input->'outcome'->>'errorCode' where id = job.id;
      result := jsonb_build_object('kind', 'failed', 'jobId', job.id);
    elsif p_input->'outcome'->>'kind' = 'cancelled' then
      if not knowledge_review_private.closed_object(p_input->'outcome', array['kind', 'claimToken']) then raise exception 'INVALID_INPUT'; end if;
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
