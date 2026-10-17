-- LOCAL-VALIDATED SOURCE SUBSET ONLY. Missing global-worker/trigger/schema proofs; no target lease.
BEGIN;
DO $$BEGIN RAISE EXCEPTION 'D2_DEPENDENCIES_UNVERIFIED';END$$;
create function public.qa_accept_policy_v1(p_policy_id uuid,p_notice_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();
begin
 if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') then return jsonb_build_object('kind','blocked');end if;
 return public.accept_text_policy(p_policy_id,p_notice_hash);
end $$;
alter function public.qa_accept_policy_v1(p_policy_id uuid, p_notice_hash text) owner to postgres;
revoke all on function public.qa_accept_policy_v1(p_policy_id uuid, p_notice_hash text) from public,anon,authenticated,service_role;

create function public.qa_cancellation_v1(p_action text,p_thread_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
 turn_n uuid; t public.turns%rowtype; result_state text; stopped record;
begin
 if p_action is null or p_action not in ('read','cancel') or p_thread_id is null or p_request_id is null then raise exception 'INVALID_INPUT';end if;
 if u is null or sid is null then raise exception 'UNAUTHENTICATED';end if;
 -- Preserve the original cancellation capacity-lock -> mobile/account lock order.
 if p_action='cancel' then perform pg_advisory_xact_lock(hashtextextended(u::text,34));end if;
 -- The original identity guard plus the same live Auth-row checks as text_owner,
 -- without its account-registration INSERT: GET stays metadata-read-only.
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 perform 1 from auth.sessions where id=sid and user_id=u for key share;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null;
 if not found then raise exception 'FORBIDDEN';end if;
 select i.turn_id into turn_n from public.chat_turn_idempotency i
 where i.owner_id=u and i.thread_id=p_thread_id and i.idempotency_key=p_request_id::text;
 if found then
  -- Only the original QA text/Task lineage qualifies. No current provider consent
  -- or policy activation is required to stop an already-owned request. No body is read.
  if not exists(select 1 from turn_private.service_task_turns l
   join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=u and s.thread_id=p_thread_id
   join turn_private.text_content c on c.turn_id=l.turn_id and c.owner_id=u and c.thread_id=p_thread_id
    and c.policy_id=s.policy_id and c.consent_id=s.consent_id
   join turn_private.text_policies p on p.id=s.policy_id and p.context_mode='qa_session_history_v1'
   where l.turn_id=turn_n and l.owner_id=u and l.idempotency_key=p_request_id)
   then raise exception 'FORBIDDEN';end if;
  if not turn_private.lock_turn(turn_n,u,sid) then raise exception 'FORBIDDEN';end if;
  select * into t from public.turns where id=turn_n and owner_id=u and thread_id=p_thread_id;
  if not found then raise exception 'FORBIDDEN';end if;
  if p_action='cancel' and t.status not in ('completed','proposal_ready','unavailable','failed','cancelled') then
   select * into stopped from public.cancel_chat_turn(turn_n);
   -- The original row/event transaction is authoritative, not POST arrival.
   select * into t from public.turns where id=turn_n and owner_id=u and thread_id=p_thread_id;
  end if;
  if t.status='cancelled' then
   if not exists(select 1 from public.chat_turn_events e where e.turn_id=turn_n and e.owner_id=u and e.thread_id=p_thread_id
    and e.event_type='terminal' and e.state='cancelled') then raise exception 'TURN_UNAVAILABLE';end if;
   result_state:='cancelled';
  elsif t.status in ('completed','proposal_ready','unavailable','failed') then result_state:='terminal';
  elsif t.status in ('accepted','planning','retrieving','generating','validating') then result_state:='pending';
  else raise exception 'TURN_UNAVAILABLE';end if;
 else result_state:='not_observed';end if;
 return jsonb_build_object('version','qa-cancellation/1','sessionId',p_thread_id,'requestId',p_request_id,'state',result_state,
  'ack',case when result_state in ('cancelled','terminal') then 'observed' else 'unknown' end);
end $$;
alter function public.qa_cancellation_v1(p_action text, p_thread_id uuid, p_request_id uuid) owner to postgres;
revoke all on function public.qa_cancellation_v1(p_action text, p_thread_id uuid, p_request_id uuid) from public,anon,authenticated,service_role;

create function public.qa_read_policy_v1(p_policy_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();r jsonb;
begin
 if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') then return jsonb_build_object('kind','unavailable');end if;
 r:=public.read_text_policy(p_policy_id);
 if r->>'kind' is distinct from 'policy' then return r;end if;
 return jsonb_set(r,'{policy}',(r->'policy')||jsonb_build_object('contextMode','qa_session_history_v1','maxTurns',8,'maxHistoryPairs',7,'maxHistoryBytes',65536));
end $$;
alter function public.qa_read_policy_v1(p_policy_id uuid) owner to postgres;
revoke all on function public.qa_read_policy_v1(p_policy_id uuid) from public,anon,authenticated,service_role;

create function public.qa_ready_groups_v3(p_limit integer,p_model text,p_price_version text,p_endpoint text,p_owner_id uuid,p_policy_id uuid,p_scope_id uuid,p_notice_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.hosted_worker_control%rowtype;groups_n jsonb;
begin
 if p_owner_id is null or p_policy_id is null or p_scope_id is null or p_notice_hash is null or p_notice_hash !~ '^[a-f0-9]{64}$'
 or p_limit is null or p_limit not between 1 and 50 or p_model is null or p_model !~ '^[A-Za-z0-9._-]{1,100}$'
 or p_price_version is null or p_price_version !~ '^[A-Za-z0-9._-]{1,100}$' or p_endpoint is null or length(p_endpoint)>512
 or p_endpoint !~ '^https://[^/?#@]+/[^?#]*$' then raise exception 'INVALID_INPUT';end if;
 select * into c from turn_private.hosted_worker_control where singleton;
 if not found or not c.enabled then return jsonb_build_object('kind','disabled');end if;
 select coalesce(jsonb_agg(jsonb_build_object('ownerId',g.owner_id,'policyId',g.policy_id,'contextMode',g.context_mode,
 'provider',g.provider,'endpoint',g.endpoint,'noticeHash',g.notice_hash,'scopes',g.scopes) order by g.oldest,g.owner_id,g.policy_id),'[]'::jsonb) into groups_n
 from(
  select w.*,b.scopes from(
   select q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint,p.notice_hash,min(q.created_at) oldest
   from turn_private.work q join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
   join turn_private.text_policies p on p.id=x.policy_id
   join turn_private.text_consents a on a.owner_id=x.owner_id and a.policy_id=x.policy_id and a.consent_id=x.consent_id
   where q.owner_id=p_owner_id and x.policy_id=p_policy_id and p.notice_hash=p_notice_hash
    and q.execution_mode='text' and p.context_mode='qa_session_history_v1' and p.provider='qwen' and p.endpoint=p_endpoint
    and x.hidden_at is null and p.revoked_at is null and p.effective_at<=clock_timestamp()
    and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and a.revoked_at is null
    and(q.state='queued' or(q.state='leased' and q.expires_at<=clock_timestamp()))
    and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
    and not exists(select 1 from public.model_budget_attempts t join public.model_budget_scopes s on s.id=t.scope_id
     where s.owner_id=q.owner_id and t.status<>'released' and(t.task_id=q.turn_id or t.attempt_id=q.lease_token))
   group by q.owner_id,x.policy_id,p.context_mode,p.provider,p.endpoint,p.notice_hash
  )w cross join lateral(
   -- Match first, then keep at most two witnesses: zero is unavailable, two is
   -- ambiguous. Nonmatching first-five scopes cannot hide a later exact match.
   select count(*) scope_n,coalesce(jsonb_agg(jsonb_build_object('scopeId',e.id,'model',e.model,'priceVersion',e.price_version) order by e.id),'[]'::jsonb) scopes
   from(select s.id,l.model,l.price_version from public.model_budget_scopes s
    join public.model_budget_provider_limits l on l.scope_id=s.id and l.provider='qwen'
    where s.owner_id=w.owner_id and s.enabled and not s.frozen and s.expires_at>clock_timestamp() and l.enabled
     and l.model=p_model and l.price_version=p_price_version order by s.id limit 2)e
  )b where b.scope_n=1 and (b.scopes->0->>'scopeId')::uuid=p_scope_id
  order by w.oldest,w.owner_id,w.policy_id limit p_limit
 )g;
 return jsonb_build_object('kind','groups','groups',groups_n);
end $$;
alter function public.qa_ready_groups_v3(p_limit integer, p_model text, p_price_version text, p_endpoint text, p_owner_id uuid, p_policy_id uuid, p_scope_id uuid, p_notice_hash text) owner to postgres;
revoke all on function public.qa_ready_groups_v3(p_limit integer, p_model text, p_price_version text, p_endpoint text, p_owner_id uuid, p_policy_id uuid, p_scope_id uuid, p_notice_hash text) from public,anon,authenticated,service_role;

create function turn_private.qa_consumer_window_v1(p_history jsonb,p_text text)
returns boolean language plpgsql immutable set search_path='' as $$
declare n integer;i integer;item jsonb;body_n text;role_n text;
 content_n integer:=octet_length(p_text);prompt_n integer;
begin
 if not turn_private.valid_text(p_text,4000) or jsonb_typeof(p_history) is distinct from 'array' then return false;end if;
 n:=jsonb_array_length(p_history);
 if n>14 or n%2<>0 then return false;end if;
 prompt_n:=2+3775+1+octet_length('{"role":"user","content":'||to_json(p_text)::text||'}');
 for i in 0..n-1 loop
  item:=p_history->i;body_n:=item->>'content';role_n:=case when i%2=0 then 'user' else 'assistant' end;
  if item->>'role' is distinct from role_n or not turn_private.valid_text(body_n,case when i%2=0 then 4000 else 8000 end) then return false;end if;
  -- Explicit JS UTF-16 units for every upstream message, including older pairs
  -- outside the selected window. valid_text also enforces this on source rows.
  if (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(body_n,'') ch)
   > (case when i%2=0 then 4000 else 8000 end) then return false;end if;
  if i>=greatest(0,n-6) then
   content_n:=content_n+octet_length(body_n);
   prompt_n:=prompt_n+1+octet_length('{"role":'||to_json(role_n)::text||',"content":'||to_json(body_n)::text||'}');
  end if;
 end loop;
 return content_n<=16384 and prompt_n<=32768;
end $$;
alter function turn_private.qa_consumer_window_v1(p_history jsonb, p_text text) owner to postgres;
revoke all on function turn_private.qa_consumer_window_v1(p_history jsonb, p_text text) from public,anon,authenticated,service_role;

create function turn_private.qa_history_v1(p_turn uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype; l turn_private.service_task_turns%rowtype;
 c turn_private.text_content%rowtype; cursor_n uuid:=p_turn;seen uuid[]:='{}';hist jsonb:='[]';state_n text;
begin
 select x.* into s from turn_private.service_tasks x join turn_private.service_task_turns a on a.task_id=x.id where a.turn_id=p_turn;
 if not found or not exists(select 1 from turn_private.text_policies where id=s.policy_id and context_mode='qa_session_history_v1')
 or not turn_private.text_policy_current(s.policy_id) then return null;end if;
 perform 1 from turn_private.text_consents where owner_id=s.owner_id and policy_id=s.policy_id and consent_id=s.consent_id and revoked_at is null for share;
 if not found then return null;end if;
 perform 1 from public.chat_threads where id=s.thread_id and owner_id=s.owner_id and status='active' and trip_id is null for share;
 if not found then return null;end if;
 loop
  if cursor_n is null or cursor_n=any(seen) or cardinality(seen)>=8 then return null;end if;
  seen:=array_append(seen,cursor_n);
  select * into l from turn_private.service_task_turns where turn_id=cursor_n and task_id=s.id and owner_id=s.owner_id for share;
  if not found then return null;end if;
  select * into c from turn_private.text_content where turn_id=cursor_n and owner_id=s.owner_id and thread_id=s.thread_id and policy_id=s.policy_id and consent_id=s.consent_id and hidden_at is null for share;
  if not found then return null;end if;
  select status into state_n from public.turns where id=cursor_n and owner_id=s.owner_id and thread_id=s.thread_id for share;
  if not found then return null;end if;
  if cursor_n<>p_turn then
   if state_n not in ('completed','failed') or c.output_text is null or c.output_kind not in ('answered','partial','clarification','technical_failure') then return null;end if;
   hist:=jsonb_build_array(jsonb_build_object('turnId',cursor_n,'role','user','content',c.input_text),jsonb_build_object('turnId',cursor_n,'role','assistant','content',c.output_text))||hist;
   if octet_length(hist::text)>65536 then return null;end if;
  end if;
  if l.parent_turn_id is null then
   if cursor_n<>s.goal_turn_id or l.relationship<>'new_goal' then return null;end if;
   return jsonb_build_object('history',hist,'sourceTurnIds',to_jsonb(seen));
  end if;
  if l.relationship not in ('qa_followup','qa_correction') then return null;end if;
  cursor_n:=l.parent_turn_id;
 end loop;
end $$;
alter function turn_private.qa_history_v1(p_turn uuid) owner to postgres;
revoke all on function turn_private.qa_history_v1(p_turn uuid) from public,anon,authenticated,service_role;

create function turn_private.qa_link_mode_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare mode_n text;
begin
 select p.context_mode into mode_n from turn_private.service_tasks s join turn_private.text_policies p on p.id=s.policy_id where s.id=NEW.task_id;
 if (NEW.relationship in ('qa_followup','qa_correction') and mode_n is distinct from 'qa_session_history_v1')
 or (mode_n='qa_session_history_v1' and NEW.relationship not in ('new_goal','qa_followup','qa_correction')) then raise exception 'QA_MODE_CONFLICT';end if;
 return NEW;
end $$;
alter function turn_private.qa_link_mode_v1() owner to postgres;
revoke all on function turn_private.qa_link_mode_v1() from public,anon,authenticated,service_role;

create function public.qa_claim_work_v1(p_owner_id uuid,p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; c turn_private.text_content%rowtype; turn_state text;
begin
  if p_owner_id is null or p_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  -- An unlocked filter avoids taking policy/consent locks before the established
  -- owner -> account/session -> Turn/thread -> work -> policy/consent order.
  -- Everything relevant to dispatch is checked again after those locks.
  for candidate in
    select q.turn_id,q.owner_id,q.session_id from turn_private.work q
    join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
    join turn_private.text_policies p on p.id=x.policy_id
    join turn_private.text_consents s on s.owner_id=x.owner_id and s.policy_id=x.policy_id and s.consent_id=x.consent_id
    where q.owner_id=p_owner_id and x.policy_id=p_policy_id and x.hidden_at is null and p.context_mode='qa_session_history_v1'
      and p.revoked_at is null and p.effective_at<=clock_timestamp()
      and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and s.revoked_at is null
      and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
      and not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id where b.owner_id=q.owner_id and a.status<>'released' and (a.task_id=q.turn_id or a.attempt_id=q.lease_token))
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100
  loop
    -- Same advisory key as the legacy global claimer: concurrent versions cannot
    -- lease the same candidate. Return after taking any entity lock.
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      perform turn_private.cancel_unclaimable_turn_v1(candidate.turn_id,candidate.owner_id);
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null
        where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id and owner_id=p_owner_id for update;
    if not found or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select * into c from turn_private.text_content where turn_id=w.turn_id and owner_id=p_owner_id and policy_id=p_policy_id and hidden_at is null;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    perform 1 from turn_private.text_consents where owner_id=p_owner_id and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null for share;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    if exists(select 1 from turn_private.text_dispatches d where d.turn_id=w.turn_id) or exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id where b.owner_id=w.owner_id and a.status<>'released' and (a.task_id=w.turn_id or a.attempt_id=w.lease_token)) then return jsonb_build_object('kind','reconciliation_required','turnId',w.turn_id); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if turn_private.qa_history_v1(w.turn_id) is null then
      -- No receipt/uncertain ledger can reach this branch. Keep all retained text;
      -- use the original terminal/event path, and return after this owner's locks.
      perform turn_private.terminal(w.turn_id,'cancelled',w.attempt);
      return jsonb_build_object('kind','empty');
    end if;
    -- A slow policy/consent lock cannot revive an already leased item. Its state
    -- and expiry were locked above; only queued/expired work receives a new token.
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  select q.turn_id into candidate from turn_private.work q
   join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
   join turn_private.text_policies p on p.id=x.policy_id
   where q.owner_id=p_owner_id and x.policy_id=p_policy_id and p.context_mode='qa_session_history_v1'
    and q.state in ('queued','leased') and (q.state='queued' or q.expires_at<=clock_timestamp())
    and (exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id) or exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id where b.owner_id=q.owner_id and a.status<>'released' and (a.task_id=q.turn_id or a.attempt_id=q.lease_token)))
   order by q.created_at,q.turn_id limit 1;
  if found then return jsonb_build_object('kind','reconciliation_required','turnId',candidate.turn_id);end if;
  return jsonb_build_object('kind','empty');
end $$;
alter function public.qa_claim_work_v1(p_owner_id uuid, p_policy_id uuid) owner to postgres;
revoke all on function public.qa_claim_work_v1(p_owner_id uuid, p_policy_id uuid) from public,anon,authenticated,service_role;

create function public.qa_read_session_v1(p_thread_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;r record;messages jsonb:='[]';v jsonb;
begin
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 select a.* into s from turn_private.service_tasks a join turn_private.text_policies p on p.id=a.policy_id where a.thread_id=p_thread_id and a.owner_id=u and p.context_mode='qa_session_history_v1';
 if not found then
  if exists(select 1 from public.turns where thread_id=p_thread_id) or exists(select 1 from turn_private.text_content where thread_id=p_thread_id) or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id) then return jsonb_build_object('kind','unavailable');end if;
  return jsonb_build_object('kind','session','schemaVersion','qa-session/1','threadId',p_thread_id,'serviceTaskId',null,'lastTurnId',null,'policyId',null,'messages','[]'::jsonb);
 end if;
 if turn_private.qa_history_v1(s.last_turn_id) is null then return jsonb_build_object('kind','unavailable');end if;
 for r in select value::uuid as turn_id from jsonb_array_elements_text(turn_private.qa_history_v1(s.last_turn_id)->'sourceTurnIds') with ordinality a(value,ord) order by ord desc loop
  if jsonb_array_length(messages)>=8 then return jsonb_build_object('kind','unavailable');end if;
  v:=public.read_text_turn(r.turn_id);if v->>'kind' is distinct from 'text' then return jsonb_build_object('kind','unavailable');end if;
  messages:=messages||jsonb_build_array(v||jsonb_build_object('status',(select status from public.turns where id=r.turn_id and owner_id=u),'createdAt',(select created_at from public.turns where id=r.turn_id and owner_id=u),
   'reconciliationRequired',exists(
    select 1 from turn_private.text_content body_n join public.turns turn_n on turn_n.id=body_n.turn_id and turn_n.owner_id=u
    join turn_private.work work_n on work_n.turn_id=body_n.turn_id and work_n.owner_id=u
    where body_n.turn_id=r.turn_id and body_n.owner_id=u and body_n.thread_id=p_thread_id
     and body_n.policy_id=s.policy_id and body_n.consent_id=s.consent_id and body_n.hidden_at is null
     and body_n.output_text is null and body_n.output_kind is null
     and turn_n.status not in ('completed','proposal_ready','unavailable','failed','cancelled')
     and (work_n.state='queued' or (work_n.state='leased' and work_n.expires_at<=clock_timestamp()))
     and (exists(select 1 from turn_private.text_dispatches d where d.turn_id=body_n.turn_id and d.policy_id=body_n.policy_id and d.consent_id=body_n.consent_id)
      or exists(select 1 from public.model_budget_attempts attempt_n join public.model_budget_scopes scope_n on scope_n.id=attempt_n.scope_id
       where scope_n.owner_id=u and attempt_n.status<>'released'
        and (attempt_n.task_id=work_n.turn_id or attempt_n.attempt_id=work_n.lease_token)))
   )));
 end loop;
 return jsonb_build_object('kind','session','schemaVersion','qa-session/1','threadId',p_thread_id,'serviceTaskId',s.id,'lastTurnId',s.last_turn_id,'policyId',s.policy_id,'messages',messages);
end $$;
alter function public.qa_read_session_v1(p_thread_id uuid) owner to postgres;
revoke all on function public.qa_read_session_v1(p_thread_id uuid) from public,anon,authenticated,service_role;

create function public.qa_submit_turn_v1(
  p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,
  p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  s turn_private.service_tasks%rowtype; prior turn_private.service_task_turns%rowtype;
  parent turn_private.text_content%rowtype; digest text; result jsonb;
begin
  if p_text is not null and (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(p_text,'') ch)>4000 then raise exception 'QA_CONTEXT_LIMIT';end if;
  if p_thread_id is null or p_turn_id is null or p_task_id is null or p_turn_id=p_task_id
    or p_idempotency_key is null or p_scope_version is distinct from 1
    or p_relationship is null or p_relationship not in ('new_goal','qa_followup','qa_correction')
    or ((p_relationship='new_goal') is distinct from (p_parent_turn_id is null))
    or p_locale is null or p_locale not in ('zh','en','es','ru','ar')
    or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') or not turn_private.text_policy_current(p_policy_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,p_scope_version,p_relationship,p_parent_turn_id)::text,'UTF8')),'hex');
  -- Shared identity locks precede thread locks; acquire the pair in UUID order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
  if p_relationship='new_goal' then
    insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
  end if;
  perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into s from turn_private.service_tasks where id=p_task_id for update;
  if found then
    if s.owner_id<>u or s.thread_id<>p_thread_id or s.policy_id<>p_policy_id or s.consent_id<>c.consent_id
      or s.scope_version<>p_scope_version then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    perform 1 from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=s.goal_turn_id and g.owner_id=u and g.hidden_at is null;
    if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
    select * into prior from turn_private.service_task_turns where owner_id=u and task_id=s.id and idempotency_key=p_idempotency_key;
    if found then
      if prior.request_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      -- Existing admission rechecks original content visibility/consent and never enqueues again.
      result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
      if result->>'kind'<>'accepted' then raise exception 'DATA_POLICY_BLOCKED'; end if;
      return result||jsonb_build_object('serviceTaskId',s.id,'scopeVersion',s.scope_version,'relationship',prior.relationship,'parentTurnId',prior.parent_turn_id);
    end if;
    if p_relationship='new_goal' or s.last_turn_id is distinct from p_parent_turn_id then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    select g.* into parent from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=p_parent_turn_id and g.owner_id=u and g.thread_id=p_thread_id and g.hidden_at is null
      and t.status in ('completed','failed');
    if not found or parent.policy_id<>p_policy_id or parent.consent_id<>c.consent_id
      or parent.output_kind not in ('answered','partial','clarification','technical_failure')
      or parent.output_text is null then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  else
    if p_relationship<>'new_goal' or exists(select 1 from public.turns where thread_id=p_thread_id)
      or exists(select 1 from public.turns where id=p_task_id)
      or exists(select 1 from turn_private.text_content where thread_id=p_thread_id or turn_id=p_task_id)
      or exists(select 1 from public.model_budget_attempts where task_id=p_task_id)
      or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id)
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if not turn_private.qa_consumer_window_v1('[]'::jsonb,p_text) then raise exception 'QA_CONTEXT_LIMIT';end if;
    insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
      values(p_task_id,u,p_thread_id,p_turn_id,p_turn_id,p_policy_id,c.consent_id,p_scope_version,
        encode(pg_catalog.sha256(convert_to(p_text,'UTF8')),'hex'));
  end if;
  if p_relationship<>'new_goal' and not turn_private.qa_consumer_window_v1((turn_private.qa_history_v1(p_parent_turn_id)->'history')||jsonb_build_array(jsonb_build_object('turnId',p_parent_turn_id,'role','user','content',parent.input_text),jsonb_build_object('turnId',p_parent_turn_id,'role','assistant','content',parent.output_text)),p_text) then raise exception 'QA_CONTEXT_LIMIT';end if;
  if exists(select 1 from turn_private.service_tasks where id=p_task_id) and p_relationship<>'new_goal' then
    if turn_private.qa_history_v1(p_parent_turn_id) is null or octet_length(((turn_private.qa_history_v1(p_parent_turn_id)->'history')||jsonb_build_array(jsonb_build_object('turnId',p_parent_turn_id,'role','user','content',parent.input_text),jsonb_build_object('turnId',p_parent_turn_id,'role','assistant','content',parent.output_text)))::text)>65536 or (select count(*) from turn_private.service_task_turns where task_id=p_task_id)>=8 then raise exception 'QA_CONTEXT_LIMIT'; end if;
  end if;
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)
    or exists(select 1 from public.turns where id=p_turn_id)
    or exists(select 1 from turn_private.text_content where turn_id=p_turn_id)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
    values(p_turn_id,p_task_id,u,p_parent_turn_id,p_relationship,p_idempotency_key,digest);
  result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
  if result->>'kind'<>'accepted' or result->>'reused'<>'false' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.service_tasks set last_turn_id=p_turn_id where id=p_task_id;
  return result||jsonb_build_object('serviceTaskId',p_task_id,'scopeVersion',p_scope_version,'relationship',p_relationship,'parentTurnId',p_parent_turn_id);
end $$;
alter function public.qa_submit_turn_v1(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_task_id uuid, p_scope_version integer, p_relationship text, p_parent_turn_id uuid) owner to postgres;
revoke all on function public.qa_submit_turn_v1(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_task_id uuid, p_scope_version integer, p_relationship text, p_parent_turn_id uuid) from public,anon,authenticated,service_role;

create function turn_private.qa_lock_work_v1(p_turn uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;
begin
 select * into w from turn_private.work where turn_id=p_turn;
 if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false;end if;
 select * into w from turn_private.work where turn_id=p_turn for update;
 if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
 or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false;end if;
 return turn_private.qa_history_v1(p_turn) is not null and w.expires_at>clock_timestamp();
end $$;
alter function turn_private.qa_lock_work_v1(p_turn uuid, p_token uuid) owner to postgres;
revoke all on function turn_private.qa_lock_work_v1(p_turn uuid, p_token uuid) from public,anon,authenticated,service_role;

create function public.qa_complete_work_v1(p_turn_id uuid,p_lease_token uuid,p_kind text,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;task_n uuid;
begin
 if p_kind is null or p_kind not in ('answered','partial','clarification','blocked','technical_failure') or not turn_private.valid_text(p_text,8000) then raise exception 'INVALID_INPUT';end if;
 if not turn_private.qa_lock_work_v1(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 select task_id into task_n from turn_private.service_task_turns where turn_id=p_turn_id;
 if p_kind in ('answered','partial','clarification') and (not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id)
 or not exists(select 1 from public.model_budget_attempts a join turn_private.service_tasks s on s.id=a.task_id and s.budget_scope_id=a.scope_id where a.attempt_id=p_lease_token and a.task_id=task_n and a.status='settled')) then return jsonb_build_object('kind','blocked');end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 update turn_private.text_content set output_kind=p_kind,output_text=p_text where turn_id=p_turn_id;
 perform turn_private.terminal(p_turn_id,case when p_kind='blocked' then 'unavailable' when p_kind='technical_failure' then 'failed' else 'completed' end,w.attempt);
 return jsonb_build_object('kind','finished');
end $$;
alter function public.qa_complete_work_v1(p_turn_id uuid, p_lease_token uuid, p_kind text, p_text text) owner to postgres;
revoke all on function public.qa_complete_work_v1(p_turn_id uuid, p_lease_token uuid, p_kind text, p_text text) from public,anon,authenticated,service_role;

create function public.qa_list_sessions_v1(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();r record;v jsonb;rows_n jsonb:='[]';
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'INVALID_INPUT';end if;
 for r in select h.id from public.chat_threads h left join turn_private.service_tasks s on s.thread_id=h.id and s.owner_id=u left join turn_private.text_policies p on p.id=s.policy_id where h.owner_id=u and h.status='active' and h.trip_id is null and (p.context_mode='qa_session_history_v1' or (s.id is null and not exists(select 1 from public.turns where thread_id=h.id) and not exists(select 1 from turn_private.text_content where thread_id=h.id))) order by h.updated_at desc,h.id limit p_limit loop
  v:=public.qa_read_session_v1(r.id);if v->>'kind'='session' then rows_n:=rows_n||jsonb_build_array(v-'messages');end if;
 end loop;
 return jsonb_build_object('kind','sessions','sessions',rows_n);
end $$;
alter function public.qa_list_sessions_v1(p_limit integer) owner to postgres;
revoke all on function public.qa_list_sessions_v1(p_limit integer) from public,anon,authenticated,service_role;

create function public.qa_read_work_v1(p_turn_id uuid,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype;p turn_private.text_policies%rowtype;s turn_private.service_tasks%rowtype;w turn_private.work%rowtype;h jsonb;payload jsonb;
begin
 if not turn_private.qa_lock_work_v1(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 select * into c from turn_private.text_content where turn_id=p_turn_id;
 select * into p from turn_private.text_policies where id=c.policy_id;
 select x.* into s from turn_private.service_tasks x join turn_private.service_task_turns l on l.task_id=x.id where l.turn_id=p_turn_id;
 h:=turn_private.qa_history_v1(p_turn_id);if h is null then return jsonb_build_object('kind','blocked');end if;
 payload:=jsonb_build_object('kind','qa_input','schemaVersion','qa-context/1','contextMode','qa_session_history_v1','ownerId',w.owner_id,'authSessionId',w.session_id,'turnId',p_turn_id,'threadId',c.thread_id,'serviceTaskId',s.id,'policyId',p.id,'consentId',c.consent_id,'provider',p.provider,'endpoint',p.endpoint,'text',c.input_text,'locale',c.locale,'history',h->'history','sourceTurnIds',h->'sourceTurnIds');
 return payload||jsonb_build_object('contextDigest',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end $$;
alter function public.qa_read_work_v1(p_turn_id uuid, p_lease_token uuid) owner to postgres;
revoke all on function public.qa_read_work_v1(p_turn_id uuid, p_lease_token uuid) from public,anon,authenticated,service_role;

create function public.qa_submit_message_v1(p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,p_task_id uuid,p_relationship text default 'qa_followup')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;l turn_private.service_task_turns%rowtype;rel text;parent_n uuid;
begin
 if p_thread_id is null or p_turn_id is null or p_task_id is null or p_idempotency_key is null or p_relationship is null or p_relationship not in ('qa_followup','qa_correction') then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
 perform pg_advisory_xact_lock(hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
 insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
 if not found then raise exception 'FORBIDDEN';end if;
 select * into s from turn_private.service_tasks where id=p_task_id for update;
 if found then
  select * into l from turn_private.service_task_turns where owner_id=u and task_id=p_task_id and idempotency_key=p_idempotency_key;
  if found then
   if l.turn_id is distinct from p_turn_id or (l.relationship<>'new_goal' and l.relationship is distinct from p_relationship) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
   rel:=l.relationship;parent_n:=l.parent_turn_id;
  else rel:=p_relationship;parent_n:=s.last_turn_id;end if;
 else rel:='new_goal';parent_n:=null;end if;
 return public.qa_submit_turn_v1(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,1,rel,parent_n);
end $$;
alter function public.qa_submit_message_v1(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_task_id uuid, p_relationship text) owner to postgres;
revoke all on function public.qa_submit_message_v1(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_task_id uuid, p_relationship text) from public,anon,authenticated,service_role;

create function public.qa_authorize_dispatch_v1(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;fresh_n jsonb;r jsonb;task_n uuid;
begin
 payload:=public.qa_read_work_v1(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'qa_input' or payload->>'policyId' is distinct from p_policy_id::text or payload->>'provider' is distinct from p_provider or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked');end if;
 task_n:=(payload->>'serviceTaskId')::uuid;
 if not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id
 join turn_private.service_tasks s on s.id=a.task_id and s.budget_scope_id=a.scope_id and s.owner_id=b.owner_id
 where a.scope_id=p_scope_id and a.attempt_id=p_lease_token and a.task_id=task_n and a.provider=p_provider and a.status='reserved'
 and b.owner_id=(select owner_id from turn_private.text_content where turn_id=p_turn_id))
 or exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 -- The original budget RPC may wait on its scope row. Roll back THIS dispatch
 -- if the lease or any locked source expires while that lock is awaited.
 begin
  r:=public.dispatch_model_budget(p_scope_id,(select owner_id from turn_private.text_content where turn_id=p_turn_id),p_lease_token);
  if r->>'kind' is distinct from 'dispatched' then return jsonb_build_object('kind','blocked');end if;
  fresh_n:=public.qa_read_work_v1(p_turn_id,p_lease_token);
  if fresh_n->>'kind' is distinct from 'qa_input' or fresh_n->>'policyId' is distinct from p_policy_id::text
   or fresh_n->>'provider' is distinct from p_provider or fresh_n->>'contextDigest' is distinct from p_context_digest
   then raise exception using errcode='PQA01',message='QA_DISPATCH_SOURCE_EXPIRED';end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,(fresh_n->>'consentId')::uuid,p_policy_id);
 exception when sqlstate 'PQA01' then
  return jsonb_build_object('kind','blocked');
 end;
 return jsonb_build_object('kind','authorized');
end $$;
alter function public.qa_authorize_dispatch_v1(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text) owner to postgres;
revoke all on function public.qa_authorize_dispatch_v1(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text) from public,anon,authenticated,service_role;

create function public.qa_native_session_v1(p_action text,p_mobile_epoch bigint,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_n jsonb;claims_n jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 u uuid:=coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),claims_n->>'sub')::uuid;
 sid uuid:=(claims_n->>'session_id')::uuid;
 expected_n text[];keys_n text[];row_n public.chat_threads%rowtype;r jsonb;rows_n jsonb;
begin
 if p_mobile_epoch is null or p_mobile_epoch<1 or p_action is null or p_payload is null
 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then raise exception 'INVALID_INPUT';end if;
 if u is null or sid is null then raise exception 'UNAUTHENTICATED';end if;
 expected_n:=case p_action
  when 'list' then array[]::text[] when 'create' then array[]::text[]
  when 'read' then array['p_thread_id']
  when 'qa_read_policy_v1' then array['p_policy_id']
  when 'qa_accept_policy_v1' then array['p_policy_id','p_notice_hash']
  when 'qa_list_sessions_v1' then array['p_limit']
  when 'qa_read_session_v1' then array['p_thread_id']
  when 'read_text_turn' then array['p_turn_id']
  when 'qa_submit_message_v1' then array['p_thread_id','p_turn_id','p_idempotency_key','p_policy_id','p_locale','p_text','p_task_id','p_relationship']
  when 'qa_cancellation_v1' then array['p_action','p_thread_id','p_request_id']
  else null end;
 if expected_n is null then raise exception 'INVALID_INPUT';end if;
 select coalesce(array_agg(k order by k),array[]::text[]) into keys_n from jsonb_object_keys(p_payload) k;
 if keys_n is distinct from (select coalesce(array_agg(k order by k),array[]::text[]) from unnest(expected_n) k)
 or exists(select 1 from jsonb_each(p_payload) v where (v.key='p_limit' and (jsonb_typeof(v.value)<>'number' or v.value::text !~ '^[0-9]+$'))
 or (v.key<>'p_limit' and jsonb_typeof(v.value)<>'string')) then raise exception 'INVALID_INPUT';end if;
 -- Cancellation's existing capacity lock precedes its account/session lock.
 if p_action='qa_cancellation_v1' then
  if p_payload->>'p_action' not in ('read','cancel') then raise exception 'INVALID_INPUT';end if;
  if p_payload->>'p_action'='cancel' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,34));
  end if;
 end if;
 -- The original function validates ordinary authenticated/nonanonymous JWT,
 -- live Auth session and active mobile session under the shared account lock.
 -- This lock remains held through the operation below, not an HTTP precheck.
 actor_n:=public.native_session_v2('session');
 if actor_n->>'version' is distinct from '2' or actor_n->>'subject' is distinct from u::text
 or actor_n->>'sessionId' is distinct from sid::text
 or actor_n->>'mobileEpoch' is distinct from p_mobile_epoch::text then raise exception 'SESSION_REPLACED';end if;
 u:=(actor_n->>'subject')::uuid;
 case p_action
 when 'list' then
  r:=public.qa_list_sessions_v1(20);
  if r->>'kind' is distinct from 'sessions' then return r;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'status',h.status,'createdAt',h.created_at,'updatedAt',h.updated_at) order by h.updated_at desc,h.id),'[]'::jsonb)
   into rows_n from public.chat_threads h where h.owner_id=u and h.status='active' and h.trip_id is null
   and exists(select 1 from jsonb_array_elements(r->'sessions') s where s->>'threadId'=h.id::text);
  return jsonb_build_object('kind','threads','threads',rows_n);
 when 'create' then
  insert into public.chat_threads(owner_id,trip_id) values(u,null) returning * into row_n;
  return jsonb_build_object('kind','thread','thread',jsonb_build_object('id',row_n.id,'status',row_n.status,'createdAt',row_n.created_at,'updatedAt',row_n.updated_at));
 when 'read' then
  select * into row_n from public.chat_threads where id=(p_payload->>'p_thread_id')::uuid and owner_id=u and status='active' and trip_id is null;
  if not found then raise exception 'FORBIDDEN';end if;
  r:=public.qa_read_session_v1((p_payload->>'p_thread_id')::uuid);
  if r->>'kind' is distinct from 'session' then return r;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'createdAt',t.created_at) order by t.created_at,t.id),'[]'::jsonb)
   into rows_n from public.turns t where t.thread_id=row_n.id and t.owner_id=u;
  return jsonb_build_object('kind','thread_read','thread',jsonb_build_object('id',row_n.id,'status',row_n.status,'createdAt',row_n.created_at,'updatedAt',row_n.updated_at),'turns',rows_n);
 when 'qa_read_policy_v1' then return public.qa_read_policy_v1((p_payload->>'p_policy_id')::uuid);
 when 'qa_accept_policy_v1' then return public.qa_accept_policy_v1((p_payload->>'p_policy_id')::uuid,p_payload->>'p_notice_hash');
 when 'qa_list_sessions_v1' then return public.qa_list_sessions_v1((p_payload->>'p_limit')::integer);
 when 'qa_read_session_v1' then return public.qa_read_session_v1((p_payload->>'p_thread_id')::uuid);
 when 'read_text_turn' then return public.read_text_turn((p_payload->>'p_turn_id')::uuid);
 when 'qa_submit_message_v1' then return public.qa_submit_message_v1((p_payload->>'p_thread_id')::uuid,(p_payload->>'p_turn_id')::uuid,
  (p_payload->>'p_idempotency_key')::uuid,(p_payload->>'p_policy_id')::uuid,p_payload->>'p_locale',p_payload->>'p_text',
  (p_payload->>'p_task_id')::uuid,p_payload->>'p_relationship');
 when 'qa_cancellation_v1' then return public.qa_cancellation_v1(p_payload->>'p_action',(p_payload->>'p_thread_id')::uuid,(p_payload->>'p_request_id')::uuid);
 end case;
 raise exception 'INVALID_INPUT';
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INPUT';
end $$;
alter function public.qa_native_session_v1(p_action text, p_mobile_epoch bigint, p_payload jsonb) owner to postgres;
revoke all on function public.qa_native_session_v1(p_action text, p_mobile_epoch bigint, p_payload jsonb) from public,anon,authenticated,service_role;

create function public.qa_authorize_dispatch_v2(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text,p_owner_id uuid,p_notice_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 if p_owner_id is null or p_policy_id is null or p_scope_id is null or p_notice_hash is null or p_notice_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 -- Acquire the original lease/source locks first, preserving v1's lock order.
 payload:=public.qa_read_work_v1(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'qa_input' or payload->>'ownerId' is distinct from p_owner_id::text
 or payload->>'policyId' is distinct from p_policy_id::text then return jsonb_build_object('kind','blocked');end if;
 -- This is the actual immutable policy authority, not a hash echoed by a client.
 perform 1 from turn_private.text_policies where id=p_policy_id and notice_hash=p_notice_hash for share;
 if not found or not exists(select 1 from public.model_budget_scopes where id=p_scope_id and owner_id=p_owner_id) then
  return jsonb_build_object('kind','blocked');end if;
 return public.qa_authorize_dispatch_v1(p_turn_id,p_lease_token,p_scope_id,p_policy_id,p_provider,p_context_digest);
end $$;
alter function public.qa_authorize_dispatch_v2(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text, p_owner_id uuid, p_notice_hash text) owner to postgres;
revoke all on function public.qa_authorize_dispatch_v2(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text, p_owner_id uuid, p_notice_hash text) from public,anon,authenticated,service_role;
alter table turn_private.text_policies drop constraint text_policies_context_mode_check;alter table turn_private.text_policies add constraint text_policies_context_mode_check check(context_mode in ('current_input_v1','task_history_v1','knowledge_intent_v1','qa_session_history_v1'));alter table turn_private.service_task_turns drop constraint service_task_turns_relationship_check;alter table turn_private.service_task_turns add constraint service_task_turns_relationship_check check(relationship in ('new_goal','clarification','repair','qa_followup','qa_correction'));create or replace function turn_private.require_text_task()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode in ('task_history_v1','knowledge_intent_v1','qa_session_history_v1'))
    and not exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=NEW.turn_id and l.owner_id=NEW.owner_id and s.owner_id=NEW.owner_id and s.thread_id=NEW.thread_id
        and s.policy_id=NEW.policy_id and s.consent_id=NEW.consent_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode='knowledge_intent_v1')
    and not exists(select 1 from turn_private.grounded_turns g where g.turn_id=NEW.turn_id and g.owner_id=NEW.owner_id and g.locale=NEW.locale) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  return NEW;
end $$;create trigger qa_link_mode_v1 before insert or update on turn_private.service_task_turns for each row execute function turn_private.qa_link_mode_v1();grant execute on function public.qa_accept_policy_v1(p_policy_id uuid, p_notice_hash text) to authenticated;
grant execute on function public.qa_cancellation_v1(p_action text, p_thread_id uuid, p_request_id uuid) to authenticated;
grant execute on function public.qa_read_policy_v1(p_policy_id uuid) to authenticated;
grant execute on function public.qa_ready_groups_v3(p_limit integer, p_model text, p_price_version text, p_endpoint text, p_owner_id uuid, p_policy_id uuid, p_scope_id uuid, p_notice_hash text) to service_role;
grant execute on function public.qa_claim_work_v1(p_owner_id uuid, p_policy_id uuid) to service_role;
grant execute on function public.qa_read_session_v1(p_thread_id uuid) to authenticated;
grant execute on function public.qa_complete_work_v1(p_turn_id uuid, p_lease_token uuid, p_kind text, p_text text) to service_role;
grant execute on function public.qa_list_sessions_v1(p_limit integer) to authenticated;
grant execute on function public.qa_read_work_v1(p_turn_id uuid, p_lease_token uuid) to service_role;
grant execute on function public.qa_submit_message_v1(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_task_id uuid, p_relationship text) to authenticated;
grant execute on function public.qa_authorize_dispatch_v1(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text) to service_role;
grant execute on function public.qa_native_session_v1(p_action text, p_mobile_epoch bigint, p_payload jsonb) to authenticated;
grant execute on function public.qa_authorize_dispatch_v2(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text, p_owner_id uuid, p_notice_hash text) to service_role;

ROLLBACK;
