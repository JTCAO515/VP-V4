-- SOURCE ONLY; integrate exact before/after pins into a reviewed complete patch.
BEGIN;
DO $$BEGIN RAISE EXCEPTION 'D2_NO_TARGET_APPLY_LEASE';END$$;
create or replace function public.claim_turn_work()
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; turn_state text;
begin
  -- Advisory locks keep competing claimers off one candidate without reversing
  -- the account/Turn lock order used by cancellation and admission. Once any
  -- entity lock is acquired, handle only that candidate and return. Continuing
  -- would accumulate locks across owners and allow opposite-order deadlocks.
  -- An empty result may mean one stale candidate was cleaned; callers poll again.
  for candidate in select turn_id,owner_id,session_id from turn_private.work q
    where q.execution_mode='text' and (state='queued' or (state='leased' and expires_at<=clock_timestamp()))
      and not exists(select 1 from turn_private.text_content c join turn_private.text_policies p on p.id=c.policy_id
        where c.turn_id=q.turn_id and p.context_mode in ('task_history_v1','knowledge_intent_v1','qa_session_history_v1')) order by created_at,turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
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
end $$;

create or replace function turn_private.lock_text_work(p_turn uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; c turn_private.text_content%rowtype;
begin
  select * into w from turn_private.work where turn_id=p_turn;
  if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false; end if;
  select * into w from turn_private.work where turn_id=p_turn for update;
  if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
    or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false; end if;
  select * into c from turn_private.text_content where turn_id=p_turn and owner_id=w.owner_id and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) or exists(select 1 from turn_private.text_policies where id=c.policy_id and context_mode='qa_session_history_v1') then return false; end if;
  if exists(select 1 from turn_private.service_task_turns where turn_id=p_turn)
    and not exists(select 1 from turn_private.service_task_turns l
      join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=c.owner_id and s.thread_id=c.thread_id
      join turn_private.text_content g on g.turn_id=s.goal_turn_id and g.hidden_at is null
      join public.turns t on t.id=g.turn_id and t.owner_id=c.owner_id
      where l.turn_id=p_turn and s.policy_id=c.policy_id and s.consent_id=c.consent_id)
    then return false; end if;
  perform 1 from turn_private.text_consents where owner_id=c.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
  return found and w.expires_at>clock_timestamp() and (
    (select context_mode from turn_private.text_policies where id=c.policy_id) in ('current_input_v1','knowledge_intent_v1')
    or turn_private.task_history(p_turn) is not null);
end $$;
ROLLBACK;
