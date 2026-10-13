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
        where c.turn_id=q.turn_id and p.context_mode in ('task_history_v1','knowledge_intent_v1','qa_session_history_v1')) order by created_at,turn_id limit 100 loop
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
