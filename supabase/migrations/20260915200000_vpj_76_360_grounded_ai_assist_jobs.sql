-- VPJ-76 (#360) slice 8: the real Web UI trigger for grounded-ai-assist.
-- Slice 7 built read_grounded_ai_assist_context_v1 (read-only, gated on
-- original_outcome = 'blocked') and runGroundedAiAssist (the TS caller) but
-- wired them into nothing -- no real request could ever reach them. This
-- slice adds the one thing still missing: a durable, owner-scoped job a
-- traveler's own browser can create and poll, so the multi-round agentic
-- search (seconds, sometimes tens of seconds) never has to ride a single
-- open HTTP request.
--
-- Queueing model, chosen to match this repo's actual deployment shape (no
-- cron/worker process exists anywhere in this codebase -- see
-- lib/server/jobs/run-staging-text-worker.mjs for the one exception, a
-- manually-invoked local script): pull-driven. The same request that first
-- observes a job as claimable (queued, or running past a staleness window)
-- claims it and runs the search itself before responding. Concurrent
-- claimants are serialized by a row lock; a second caller sees 'pending' and
-- polls again rather than double-running the search. This reuses the exact
-- claim_token fencing pattern VPJ-75 added for wiki_generation_jobs
-- (supabase/migrations/20260915180000_vpj_75_wiki_job_reclaim.sql): a
-- completion must present the exact token its own claim returned, so a
-- reclaimed-away attempt can never overwrite a fresher one.
--
-- Ownership, not Ops membership: this table lives in turn_private (like
-- grounded_turns itself), not knowledge_review_private -- the actor here is
-- the traveler who owns the turn, authenticated via turn_private.text_owner()
-- and turn_private.lock_turn(), the same chain read_grounded_ai_assist_context_v1
-- already uses. knowledge_review_private.current_actor() (Ops-only,
-- OPS_FORBIDDEN for anyone not staff) would be the wrong function entirely.

create table turn_private.grounded_ai_assist_jobs (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null unique references turn_private.grounded_turns(turn_id) deferrable initially deferred,
  owner_id uuid not null,
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled')),
  claim_token uuid not null default gen_random_uuid(),
  started_at timestamptz,
  finished_at timestamptz,
  outcome jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  check(status in ('queued') or started_at is not null),
  check(status not in ('succeeded','failed','cancelled') or finished_at is not null),
  check(status <> 'succeeded' or outcome is not null),
  check(outcome is null or jsonb_typeof(outcome)='object')
);
alter table turn_private.grounded_ai_assist_jobs enable row level security;
revoke all on turn_private.grounded_ai_assist_jobs from public,anon,authenticated,service_role;

-- Single dispatcher, action-routed, mirroring ops_wiki_generation_v1's
-- claim/complete shape. 'ensure' both creates a job on first call and
-- reclaims a stale 'running' one (folded together, same as that function's
-- 'claim' action) -- there is no separate submit step because a job is
-- meaningless without an owner+blocked-turn to run against, which 'ensure'
-- itself verifies every time it is called.
create function public.grounded_ai_assist_work_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid; s uuid; action text; tid uuid;
  g turn_private.grounded_turns%rowtype;
  job turn_private.grounded_ai_assist_jobs%rowtype;
  result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  action := p_input->>'action';
  if action is null or action not in ('ensure', 'complete') then raise exception 'INVALID_INPUT'; end if;

  if action = 'ensure' then
    if (select array_agg(key order by key) from jsonb_object_keys(p_input) key) <> array['action','turnId']
      or jsonb_typeof(p_input->'turnId') is distinct from 'string'
      or (p_input->>'turnId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then raise exception 'INVALID_INPUT'; end if;
    tid := (p_input->>'turnId')::uuid;
    u := turn_private.text_owner();
    s := (auth.jwt()->>'session_id')::uuid;
    if not turn_private.lock_turn(tid, u, s) then return jsonb_build_object('kind', 'unavailable'); end if;

    select * into g from turn_private.grounded_turns where turn_id = tid and owner_id = u;
    if not found or g.original_outcome is distinct from 'blocked' then return jsonb_build_object('kind', 'not_applicable'); end if;

    select * into job from turn_private.grounded_ai_assist_jobs where turn_id = tid for update;
    if not found then
      insert into turn_private.grounded_ai_assist_jobs(turn_id, owner_id, status, started_at)
        values (tid, u, 'running', clock_timestamp())
        returning * into job;
      return jsonb_build_object('kind', 'claimed', 'jobId', job.id, 'claimToken', job.claim_token);
    end if;
    if job.owner_id <> u then return jsonb_build_object('kind', 'unavailable'); end if;
    if job.status in ('succeeded', 'failed', 'cancelled') then
      return jsonb_build_object('kind', 'done', 'jobId', job.id, 'status', job.status, 'outcome', job.outcome, 'errorCode', job.error_code);
    end if;
    if job.status = 'running' and job.started_at > clock_timestamp() - interval '2 minutes' then
      return jsonb_build_object('kind', 'pending', 'jobId', job.id);
    end if;
    -- Either still 'queued' (should not normally happen, since insert above
    -- starts a job 'running' directly) or a 'running' claim old enough to
    -- treat as an abandoned attempt. A fresh claim_token fences off any late
    -- completion from whoever held the job before this reclaim.
    update turn_private.grounded_ai_assist_jobs
      set status = 'running', started_at = clock_timestamp(), finished_at = null, outcome = null, error_code = null, claim_token = gen_random_uuid()
      where id = job.id
      returning * into job;
    return jsonb_build_object('kind', 'claimed', 'jobId', job.id, 'claimToken', job.claim_token);
  end if;

  -- complete
  if (select array_agg(key order by key) from jsonb_object_keys(p_input) key) <> array['action','claimToken','jobId','outcome']
    or jsonb_typeof(p_input->'jobId') is distinct from 'string'
    or (p_input->>'jobId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'claimToken') is distinct from 'string'
    or (p_input->>'claimToken') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'outcome') <> 'object' or p_input->'outcome'->>'kind' not in ('succeeded', 'failed')
    then raise exception 'INVALID_INPUT'; end if;

  u := turn_private.text_owner();
  select * into job from turn_private.grounded_ai_assist_jobs where id = (p_input->>'jobId')::uuid for update;
  if not found then raise exception 'OPS_NOT_FOUND'; end if;
  if job.owner_id <> u then raise exception 'UNAUTHENTICATED'; end if;
  if job.status <> 'running' then raise exception 'OPS_CONFLICT'; end if;
  if (p_input->>'claimToken')::uuid is distinct from job.claim_token then raise exception 'OPS_CONFLICT'; end if;

  if p_input->'outcome'->>'kind' = 'succeeded' then
    if jsonb_typeof(p_input->'outcome'->'result') <> 'object' then raise exception 'INVALID_INPUT'; end if;
    update turn_private.grounded_ai_assist_jobs
      set status = 'succeeded', finished_at = clock_timestamp(), outcome = p_input->'outcome'->'result'
      where id = job.id;
    result := jsonb_build_object('kind', 'succeeded', 'jobId', job.id);
  else
    if length(btrim(p_input->'outcome'->>'errorCode')) not between 1 and 60 then raise exception 'INVALID_INPUT'; end if;
    update turn_private.grounded_ai_assist_jobs
      set status = 'failed', finished_at = clock_timestamp(), error_code = p_input->'outcome'->>'errorCode'
      where id = job.id;
    result := jsonb_build_object('kind', 'failed', 'jobId', job.id);
  end if;
  return result;
end $$;
revoke all on function public.grounded_ai_assist_work_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.grounded_ai_assist_work_v1(jsonb) to authenticated;
