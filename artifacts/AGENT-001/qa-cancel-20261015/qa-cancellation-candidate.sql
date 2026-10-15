-- CANDIDATE ONLY. Main owns append migration/ACL registration and target apply.
-- No table/queue, new generation consent, financial settlement or original guard change.
create function public.qa_cancellation_v1(p_action text,p_thread_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
 turn_n uuid; t public.turns%rowtype; result_state text; stopped record;
begin
 if p_action is null or p_action not in ('read','cancel') or p_thread_id is null or p_request_id is null then raise exception 'INVALID_INPUT';end if;
 if u is null or sid is null then raise exception 'UNAUTHENTICATED';end if;
 -- Preserve the original cancellation capacity-lock -> mobile/account lock order.
 if p_action='cancel' then perform pg_advisory_xact_lock(hashtextextended(u::text,34));end if;
 u:=turn_private.text_owner();
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
revoke all on function public.qa_cancellation_v1(text,uuid,uuid) from public,anon,service_role;
grant execute on function public.qa_cancellation_v1(text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
