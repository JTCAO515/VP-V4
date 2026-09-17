-- VPJ-75 (#359): automated withdrawn-source impact scan, across ALL pages
-- and in-flight jobs, not just the one page an operator happens to be
-- viewing.
--
-- docs/contracts/wiki-source-withdrawal.md's "What this does not do" names
-- this exact gap: "No automated scan. Nothing periodically checks in-flight
-- `running` jobs against newly-withdrawn sources; the barrier only fires
-- when a `claim` or `complete` call actually happens for that job." And
-- artifacts/VPJ-75/unrun.md's own recorded next step says the round-19
-- per-page flag (citedWithdrawnSources) "is scoped to ... the flag only
-- appears when an operator actually reads that specific page" -- i.e. no
-- way to see the full picture without opening every page one by one.
--
-- This migration closes both halves, read-only:
--   1. A new nullable column, wiki_generation_jobs.source_revision_ids,
--      recorded at claim() time only (purely additive -- no existing
--      validation, control flow or barrier behavior in
--      ops_wiki_generation_v1 changes; every check, exception and branch
--      is byte-for-byte the same as the live function this replaces,
--      supabase/migrations/20260916120000_vpj_75_359_wiki_source_withdrawal.sql).
--      Historical job rows claimed before this migration keep this column
--      null and are simply excluded from the new scan below -- their real
--      cited sources were never persisted anywhere queryable, and this
--      migration does not attempt to reconstruct them.
--   2. A new read-only RPC, ops_wiki_withdrawal_scan_v1, that scans:
--      - every page's current and previous wiki_page_revisions (the same
--        two-revision scope ops_wiki_read_v1 already exposes per page) for
--        one whose source_revision_ids intersects a withdrawn source, and
--      - every 'queued'/'running' wiki_generation_jobs row whose (new,
--        possibly-null) source_revision_ids intersects a withdrawn source
--        (a job stuck 'running' because barrier 2 rejected its completion).
--      Nothing is written, hidden, merged, cancelled or retroactively
--      invalidated -- this is strictly a correlation report for a human
--      reviewer, matching every prior withdrawal slice's "mark, never
--      auto-act" boundary. It never calls out to any external service.

alter table knowledge_review_private.wiki_generation_jobs
  add column source_revision_ids uuid[];

-- Byte-for-byte the same function as the live
-- 20260916120000_vpj_75_359_wiki_source_withdrawal.sql version, except for
-- the two lines marked "-- NEW" below, which only record the already-
-- validated sourceRevisionIds onto the job row at claim time. No check, no
-- exception, no branch and no other statement changes.
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

    -- Barrier 1: never dispatch (claim, then the real provider call) with a
    -- withdrawn source. Checked before any wiki_pages/wiki_generation_jobs
    -- row is touched.
    if exists(
      select 1 from jsonb_array_elements_text(p_input->'sourceRevisionIds') x
      join knowledge_review_private.source_revisions s on s.id = x::uuid
      where s.withdrawn_at is not null
    ) then raise exception 'OPS_SOURCE_WITHDRAWN'; end if;

    insert into knowledge_review_private.wiki_pages(page_type, page_key)
      values (p_input->>'pageType', p_input->>'pageKey')
      on conflict (page_key) do nothing;
    select * into page from knowledge_review_private.wiki_pages where page_key = p_input->>'pageKey' for update;
    if page.page_type <> p_input->>'pageType' then raise exception 'OPS_CONFLICT'; end if;

    select * into job from knowledge_review_private.wiki_generation_jobs
      where page_key = p_input->>'pageKey' and input_digest = p_input->>'inputDigest' for update;
    if not found then
      insert into knowledge_review_private.wiki_generation_jobs(page_key, input_digest, status, started_at, source_revision_ids)
        values (p_input->>'pageKey', p_input->>'inputDigest', 'running', clock_timestamp(),
          array(select (x#>>'{}')::uuid from jsonb_array_elements(p_input->'sourceRevisionIds') x)) -- NEW: record for the withdrawal scan below
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
          cost_tokens = null, cost_unknown = true, claim_token = gen_random_uuid(),
          source_revision_ids = array(select (x#>>'{}')::uuid from jsonb_array_elements(p_input->'sourceRevisionIds') x) -- NEW: keep the recorded set current across a reclaim/retry
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

      -- Barrier 2: a source withdrawn after claim (real-provider-call wall
      -- clock time elapsed) but before this completion must not let the
      -- result be persisted. The job is left 'running' (same idiom as a
      -- stale-expectedVersion OPS_CONFLICT above) -- recoverable via
      -- complete(failed)/complete(cancelled), which this check does not gate.
      if exists(
        select 1 from jsonb_array_elements_text(p_input->'outcome'->'sourceRevisionIds') x
        join knowledge_review_private.source_revisions s on s.id = x::uuid
        where s.withdrawn_at is not null
      ) then raise exception 'OPS_SOURCE_WITHDRAWN'; end if;

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

-- Read-only scan. Same authentication idiom as ops_wiki_read_v1's no-pageKey
-- "list" branch (current_actor() only -- membership/enabled are enforced
-- inside it exactly like every other Ops RPC). Requires an exactly-empty
-- object input, matching this codebase's "closed shape" convention even for
-- a parameterless read.
create function public.ops_wiki_withdrawal_scan_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform knowledge_review_private.current_actor();
  if p_input is distinct from '{}'::jsonb then raise exception 'INVALID_INPUT'; end if;

  select jsonb_build_object(
    'affectedRevisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pageKey', x.page_key, 'pageType', x.page_type, 'version', x.version,
        'revisionId', x.id, 'withdrawnSourceIds', x.withdrawn_ids)
        order by x.page_key, x.version desc)
      from (
        select p.page_key, p.page_type, r.version, r.id,
          array(select s.id from unnest(r.source_revision_ids) sid
            join knowledge_review_private.source_revisions s on s.id = sid
            where s.withdrawn_at is not null) as withdrawn_ids
        from knowledge_review_private.wiki_page_revisions r
        join knowledge_review_private.wiki_pages p on p.id = r.page_id
        where r.version in (p.version, p.version - 1)
      ) x
      where cardinality(x.withdrawn_ids) > 0
    ), '[]'::jsonb),
    'affectedJobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'jobId', x.id, 'pageKey', x.page_key, 'status', x.status,
        'startedAt', x.started_at, 'withdrawnSourceIds', x.withdrawn_ids)
        order by x.started_at desc nulls last, x.id)
      from (
        select j.id, j.page_key, j.status, j.started_at,
          array(select s.id from unnest(j.source_revision_ids) sid
            join knowledge_review_private.source_revisions s on s.id = sid
            where s.withdrawn_at is not null) as withdrawn_ids
        from knowledge_review_private.wiki_generation_jobs j
        where j.status in ('queued', 'running') and j.source_revision_ids is not null
      ) x
      where cardinality(x.withdrawn_ids) > 0
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.ops_wiki_withdrawal_scan_v1(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ops_wiki_withdrawal_scan_v1(jsonb) to authenticated;
