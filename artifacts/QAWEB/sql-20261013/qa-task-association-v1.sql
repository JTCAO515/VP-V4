-- Candidate append for Main review only. No policy, grants, or retained table change.
do $$begin if (select md5(prosrc) from pg_proc where oid='turn_private.require_text_task()'::regprocedure) is distinct from '95fb74d25934ea29de80eeb3fdc640fd' or (select md5(prosrc) from pg_proc where oid='public.qa_claim_work_v1(uuid,uuid)'::regprocedure) is distinct from '85a4f8d5a317769bccaa455c1ed0d3ff' then raise exception 'QA_ASSOCIATION_SOURCE_CONFLICT';end if;end$$;
create or replace function turn_private.require_text_task()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode in ('task_history_v1','knowledge_intent_v1','qa_session_history_v1'))
    and not exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=NEW.turn_id and l.owner_id=NEW.owner_id and s.owner_id=NEW.owner_id and s.thread_id=NEW.thread_id
        and s.policy_id=NEW.policy_id and s.consent_id=NEW.consent_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode='knowledge_intent_v1')
    and not exists(select 1 from turn_private.grounded_turns g where g.turn_id=NEW.turn_id and g.owner_id=NEW.owner_id and g.locale=NEW.locale) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  return NEW;
end $$;
create or replace function public.qa_claim_work_v1(p_owner_id uuid,p_policy_id uuid)
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
