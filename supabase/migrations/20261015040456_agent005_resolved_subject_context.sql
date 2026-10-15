-- AGENT-005: project the original current resolved place subject into the
-- existing Native/Web AI Assist context. No table, role, ACL or signature change.
-- Exact reviewed prosrc hashes are derived from the accepted QA source, never
-- adopted from the execution target. CREATE OR REPLACE retains the original ACL.

do $agent005_guard$
declare spec jsonb; actual record;
begin
  for spec in select value from jsonb_array_elements('[{"signature":"public.read_grounded_ai_assist_context_v1(uuid)","arguments":"p_turn_id uuid","before":"c3d2d77a39fe8e27fec9f56a7cd7f5dd2120240a982308e62de7fd22e6a0dac7","after":"5bba47c26a3bcf314c2070a46df358d2d41f25988e4dcf674b2353909876409b"},{"signature":"public.grounded_ai_assist_work_v1(jsonb)","arguments":"p_input jsonb","before":"3a14dd18658b474a48fc29e4b43f05a2a24ebaefb46acf8de8fd7ecd4c9c55b0","after":"338327a557d3558c039975823567200ab783d161e0dfe88448e7968cf4fe25e9"}]'::jsonb) loop
    select p.*, pg_get_userbyid(p.proowner) as owner_name, l.lanname,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
      into actual from pg_proc p join pg_language l on l.oid=p.prolang
      where p.oid=to_regprocedure(spec->>'signature');
    if not found or actual.owner_name is distinct from 'postgres'
      or actual.lanname is distinct from 'plpgsql' or actual.prokind is distinct from 'f'
      or not actual.prosecdef or actual.proisstrict or actual.proleakproof or actual.proretset
      or actual.provolatile is distinct from 'v' or actual.proparallel is distinct from 'u'
      or actual.proconfig is distinct from array['search_path=""']::text[]
      or actual.prorettype is distinct from 'jsonb'::regtype or actual.pronargdefaults<>0
      or actual.procost<>100 or actual.prorows<>0 or actual.prosupport<>0
      or actual.probin is not null or actual.proargmodes is not null
      or actual.identity_arguments is distinct from spec->>'arguments'
      or actual.proacl::text is distinct from '{postgres=X/postgres,authenticated=X/postgres}'
      or not has_function_privilege('authenticated',actual.oid,'EXECUTE')
      or has_function_privilege('anon',actual.oid,'EXECUTE')
      or has_function_privilege('service_role',actual.oid,'EXECUTE')
      or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex') is distinct from spec->>'before' then
      raise exception 'AGENT005_BEFORE_DEFINITION_MISMATCH %',spec->>'signature';
    end if;
  end loop;
end
$agent005_guard$;

create or replace function public.read_grounded_ai_assist_context_v1(p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); g turn_private.grounded_turns%rowtype; c turn_private.text_content%rowtype; qualified jsonb;
begin
  if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select * into g from turn_private.grounded_turns where turn_id=p_turn_id and owner_id=u;
  if not found or g.completed_at is null then return jsonb_build_object('kind','unavailable'); end if;
  -- The one real gate: AI-assisted search is offered only as a supplement
  -- when the authoritative structured answer genuinely found nothing for
  -- every required claim. It is never offered as a bypass when the
  -- resolver's own judgement was answered or partial.
  if g.original_outcome <> 'blocked' then return jsonb_build_object('kind','not_applicable'); end if;
  -- Reuse the original current owner/session/consent/source read and its
  -- existing Guide-marked binding guard; do not mint a subject from a name,
  -- a client canonical ID, or model output at this integration point.
  if g.intent in ('place_address','place_opening_hours','place_address_and_hours') then
    qualified := public.read_grounded_turn(p_turn_id);
    if qualified->>'kind' is distinct from 'grounded_turn'
      or qualified->>'turnId' is distinct from p_turn_id::text
      or qualified->>'locale' is distinct from c.locale
      or qualified->>'input' is distinct from c.input_text
      or qualified->'result'->>'projection' is distinct from 'current'
      or qualified->'result'->>'city' is distinct from g.city
      or qualified->'result'->>'intent' is distinct from g.intent
      or qualified->'result'->>'originalOutcome' is distinct from 'blocked'
      or qualified->'result'->>'placeResolution' is distinct from 'matched'
      or qualified->'result'->>'placeSubjectId' is distinct from g.place_subject_id
      or g.place_subject_id is null then return jsonb_build_object('kind','unavailable'); end if;
  end if;
  return jsonb_build_object('kind','context','turnId',c.turn_id,'city',g.city,'locale',c.locale,
    'intent',g.intent,'inputText',c.input_text,'placeName',g.place_name,
    'placeSubjectId',g.place_subject_id,'placeResolution',g.place_resolution);
end $$;

create or replace function public.grounded_ai_assist_work_v1(p_input jsonb)
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
    if public.read_grounded_ai_assist_context_v1(tid)->>'kind' is distinct from 'context' then return jsonb_build_object('kind','unavailable'); end if;

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
  -- Resolve and authorize before taking the job row lock: context/root
  -- locks precede job locks, matching ensure. Re-read the immutable identity
  -- and token state under the row lock before any completion write.
  select * into job from turn_private.grounded_ai_assist_jobs where id = (p_input->>'jobId')::uuid;
  if not found then raise exception 'OPS_NOT_FOUND'; end if;
  if job.owner_id <> u then raise exception 'UNAUTHENTICATED'; end if;
  if public.read_grounded_ai_assist_context_v1(job.turn_id)->>'kind' is distinct from 'context' then return jsonb_build_object('kind','unavailable'); end if;
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

do $agent005_guard$
declare spec jsonb; actual record;
begin
  for spec in select value from jsonb_array_elements('[{"signature":"public.read_grounded_ai_assist_context_v1(uuid)","arguments":"p_turn_id uuid","before":"c3d2d77a39fe8e27fec9f56a7cd7f5dd2120240a982308e62de7fd22e6a0dac7","after":"5bba47c26a3bcf314c2070a46df358d2d41f25988e4dcf674b2353909876409b"},{"signature":"public.grounded_ai_assist_work_v1(jsonb)","arguments":"p_input jsonb","before":"3a14dd18658b474a48fc29e4b43f05a2a24ebaefb46acf8de8fd7ecd4c9c55b0","after":"338327a557d3558c039975823567200ab783d161e0dfe88448e7968cf4fe25e9"}]'::jsonb) loop
    select p.*, pg_get_userbyid(p.proowner) as owner_name, l.lanname,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
      into actual from pg_proc p join pg_language l on l.oid=p.prolang
      where p.oid=to_regprocedure(spec->>'signature');
    if not found or actual.owner_name is distinct from 'postgres'
      or actual.lanname is distinct from 'plpgsql' or actual.prokind is distinct from 'f'
      or not actual.prosecdef or actual.proisstrict or actual.proleakproof or actual.proretset
      or actual.provolatile is distinct from 'v' or actual.proparallel is distinct from 'u'
      or actual.proconfig is distinct from array['search_path=""']::text[]
      or actual.prorettype is distinct from 'jsonb'::regtype or actual.pronargdefaults<>0
      or actual.procost<>100 or actual.prorows<>0 or actual.prosupport<>0
      or actual.probin is not null or actual.proargmodes is not null
      or actual.identity_arguments is distinct from spec->>'arguments'
      or actual.proacl::text is distinct from '{postgres=X/postgres,authenticated=X/postgres}'
      or not has_function_privilege('authenticated',actual.oid,'EXECUTE')
      or has_function_privilege('anon',actual.oid,'EXECUTE')
      or has_function_privilege('service_role',actual.oid,'EXECUTE')
      or encode(pg_catalog.sha256(convert_to(actual.prosrc,'UTF8')),'hex') is distinct from spec->>'after' then
      raise exception 'AGENT005_AFTER_DEFINITION_MISMATCH %',spec->>'signature';
    end if;
  end loop;
end
$agent005_guard$;
