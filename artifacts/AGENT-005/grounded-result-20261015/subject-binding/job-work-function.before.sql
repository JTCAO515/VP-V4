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
