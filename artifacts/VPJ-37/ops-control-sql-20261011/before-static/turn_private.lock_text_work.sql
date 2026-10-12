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
  if not found or not turn_private.text_policy_current(c.policy_id) then return false; end if;
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
