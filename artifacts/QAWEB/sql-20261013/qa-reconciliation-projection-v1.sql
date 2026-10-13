-- Read-only protected projection; no public state, accounting or lease mutation.
do $$begin if (select md5(prosrc) from pg_proc where oid='public.qa_read_session_v1(uuid)'::regprocedure) is distinct from '01b936c45eafca232b075c9a1b272f14' then raise exception 'QA_RECONCILIATION_PROJECTION_SOURCE_CONFLICT';end if;end$$;
create or replace function public.qa_read_session_v1(p_thread_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
