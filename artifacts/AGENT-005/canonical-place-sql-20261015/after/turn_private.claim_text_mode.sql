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
    where q.owner_id=p_owner_id and q.execution_mode='text' and x.policy_id=p_policy_id and x.hidden_at is null and ((p.context_mode=p_context_mode and not exists(select 1 from turn_private.grounded_turns g where g.turn_id=q.turn_id and g.selected_place_request is not null)) or (p_context_mode='knowledge_intent_v1' and p.context_mode='current_input_v1' and exists(select 1 from turn_private.grounded_turns g where g.turn_id=q.turn_id and g.selected_place_request is not null)))
      and p.revoked_at is null and p.effective_at<=clock_timestamp()
      and p.expires_at>clock_timestamp() and p.terms_recheck_at>clock_timestamp() and s.revoked_at is null
      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))
    order by q.created_at,q.turn_id limit 100
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if exists(select 1 from turn_private.grounded_turns where turn_id=candidate.turn_id and selected_place_request is not null) then
     if not turn_private.lock_trip_account_v1(candidate.owner_id) then continue;end if;
     perform pg_advisory_xact_lock(hashtextextended(candidate.owner_id::text,34));
    end if;
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
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); if exists(select 1 from turn_private.grounded_turns where turn_id=w.turn_id and selected_place_request is not null) then perform place_actions_private.ask_finish_capacity_v1(w.turn_id,'technical_failure',null);end if; return jsonb_build_object('kind','empty'); end if;
    if exists(select 1 from turn_private.grounded_turns where turn_id=w.turn_id and selected_place_request is not null) and not place_actions_private.ask_claim_current_v1(w.turn_id) then continue;end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond'
      where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $function$
;
