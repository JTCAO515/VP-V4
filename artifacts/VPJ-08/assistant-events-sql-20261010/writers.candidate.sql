-- Exact original latest definitions from full base6e catalog. REVIEW ONLY.

-- Existing CREATE OR REPLACE preserves original owner and ACL. No execute grant.

CREATE OR REPLACE FUNCTION public.claim_turn_work()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record; w turn_private.work%rowtype; turn_state text;
begin
  for candidate in select turn_id,owner_id,session_id from turn_private.work q
    where q.execution_mode='text' and (state='queued' or (state='leased' and expires_at<=clock_timestamp()))
      and not exists(select 1 from turn_private.text_content c join turn_private.text_policies p on p.id=c.policy_id
        where c.turn_id=q.turn_id and p.context_mode in ('task_history_v1','knowledge_intent_v1')) order by created_at,turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      perform turn_private.cancel_unclaimable_turn_v1(candidate.turn_id,candidate.owner_id);
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id for update;
    if not found or w.execution_mode<>'text' or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond' where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_planning_comparison_work_v1(p_owner_id uuid, p_planning_policy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record; w turn_private.work%rowtype; job turn_private.planning_comparisons%rowtype;
begin
  if (select auth.role())<>'service_role' or p_owner_id is null or p_planning_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  for candidate in select q.turn_id,q.owner_id,q.session_id from turn_private.work q
    join turn_private.planning_comparisons j on j.turn_id=q.turn_id and j.owner_id=q.owner_id
    where q.owner_id=p_owner_id and q.execution_mode='planning_comparison_v1'
      and j.planning_policy_id=p_planning_policy_id and j.state='queued'
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    -- Capacity admission, cancellation and completion all take this owner
    -- advisory lock before the Turn. Match their lock order here too.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate.owner_id::text,34));
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      perform turn_private.cancel_unclaimable_turn_v1(candidate.turn_id,candidate.owner_id);
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id=candidate.turn_id and state in ('queued','leased');
      update turn_private.service_task_capacity set state='released',released_at=clock_timestamp()
        where task_id=(select task_id from turn_private.planning_comparisons where turn_id=candidate.turn_id) and state='reserved';
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id for update;
    select * into job from turn_private.planning_comparisons where turn_id=candidate.turn_id for update;
    if not found or job.state<>'queued' or w.execution_mode<>'planning_comparison_v1'
      or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp())
      then return jsonb_build_object('kind','empty'); end if;
    if not exists(select 1 from public.turns where id=w.turn_id and owner_id=w.owner_id and status='accepted')
      then update turn_private.service_task_capacity set state='released',released_at=clock_timestamp()
          where task_id=job.task_id and state='reserved';
        perform turn_private.terminal(w.turn_id,'cancelled',w.attempt);
        return jsonb_build_object('kind','empty'); end if;
    if not turn_private.planning_policy_current(job.planning_policy_id)
      or not exists(select 1 from turn_private.planning_consents c where c.owner_id=w.owner_id and c.policy_id=job.planning_policy_id
        and c.consent_id=job.planning_consent_id and c.revoked_at is null)
      then update turn_private.planning_comparisons set state='paused_unknown' where turn_id=w.turn_id;
        update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=w.turn_id;
        return jsonb_build_object('kind','empty'); end if;
    -- Any prior non-released model attempt without an artifact may have been
    -- charged even when its process lost the validated output. Reconcile it;
    -- never start another paid call merely because the work lease expired.
    if exists(select 1 from public.model_budget_attempts a where a.task_id=job.task_id and a.status in ('dispatched','pending','settled'))
      or exists(select 1 from turn_private.planning_action_receipts a where a.turn_id=w.turn_id and a.state in ('started','unknown'))
      then update turn_private.planning_comparisons set state='paused_unknown' where turn_id=w.turn_id;
        update turn_private.work set state='queued',lease_token=null,expires_at=null where turn_id=w.turn_id;
        return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then
      update turn_private.service_task_capacity set state='released',released_at=clock_timestamp()
        where task_id=job.task_id and state='reserved';
      perform turn_private.terminal(w.turn_id,'quarantined',w.attempt);
      return jsonb_build_object('kind','empty');
    end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $function$
;

CREATE OR REPLACE FUNCTION turn_private.claim_text_mode(p_owner_id uuid, p_policy_id uuid, p_context_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record; w turn_private.work%rowtype; c turn_private.text_content%rowtype; turn_state text;
begin
  if p_owner_id is null or p_policy_id is null then raise exception 'INVALID_INPUT'; end if;
  for candidate in
    select q.turn_id,q.owner_id,q.session_id from turn_private.work q
    join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
    join turn_private.text_policies p on p.id=x.policy_id
    join turn_private.text_consents s on s.owner_id=x.owner_id and s.policy_id=x.policy_id and s.consent_id=x.consent_id
    where q.owner_id=p_owner_id and q.execution_mode='text' and x.policy_id=p_policy_id and x.hidden_at is null and p.context_mode=p_context_mode
      and p.revoked_at is null and p.effective_at<=clock_timestamp()
      and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and s.revoked_at is null
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      perform turn_private.cancel_unclaimable_turn_v1(candidate.turn_id,candidate.owner_id);
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null
        where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id and owner_id=p_owner_id for update;
    if not found or w.execution_mode<>'text' or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select * into c from turn_private.text_content where turn_id=w.turn_id and owner_id=p_owner_id and policy_id=p_policy_id and hidden_at is null;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    perform 1 from turn_private.text_consents where owner_id=p_owner_id and policy_id=p_policy_id and consent_id=c.consent_id and revoked_at is null for share;
    if not found or not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $function$
;
