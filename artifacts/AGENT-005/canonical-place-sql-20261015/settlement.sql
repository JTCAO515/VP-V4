-- Original text ServiceTask finalization, after the original grounded result is
-- terminal in this transaction. The caller holds account/mobile/34 before Root.
-- No second completion, grant, budget attempt, fee ledger or Task is created.
create or replace function place_actions_private.ask_finish_capacity_v1(p_turn_id uuid,p_kind text,p_text text) returns void
language plpgsql security definer set search_path='' as $$
declare task uuid;task_owner uuid;capacity turn_private.service_task_capacity%rowtype;task_enforced boolean;
begin
 select l.task_id,l.owner_id into task,task_owner from turn_private.service_task_turns l where l.turn_id=p_turn_id;
 if task is null then return;end if;
 if not turn_private.lock_trip_account_v1(task_owner) then raise exception 'SERVICE_TASK_RESULT_UNREADABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(task_owner::text,34));
 select * into capacity from turn_private.service_task_capacity where task_id=task for update;
 if not found then
  select capacity_enforced into task_enforced from turn_private.service_tasks where id=task;
  if task_enforced then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
  return;
 end if;
 if capacity.state<>'reserved' then return;end if;
 if p_kind='answered' then
  if not exists(select 1 from turn_private.text_content c
   join public.turns t on t.id=c.turn_id and t.owner_id=c.owner_id and t.status='completed'
   join public.chat_threads h on h.id=c.thread_id and h.owner_id=c.owner_id and h.status='active'
   join turn_private.text_consents consent on consent.owner_id=c.owner_id and consent.policy_id=c.policy_id and consent.consent_id=c.consent_id and consent.revoked_at is null
   where c.turn_id=p_turn_id and c.owner_id=task_owner and c.hidden_at is null and c.output_kind='answered' and c.output_text=p_text and turn_private.text_policy_current(c.policy_id)) then raise exception 'SERVICE_TASK_RESULT_UNREADABLE';end if;
  if capacity.tier='journey_pass' and not exists(select 1 from public.storekit_grants g
   where g.environment=capacity.grant_environment and g.transaction_id=capacity.grant_transaction_id and g.owner_id=task_owner and g.state='active' and g.starts_at<=capacity.admitted_at and g.ends_at>clock_timestamp()) then raise exception 'SERVICE_TASK_GRANT_UNAVAILABLE';end if;
  update turn_private.service_task_capacity set state='settled',settled_turn_id=p_turn_id,settled_at=clock_timestamp() where task_id=task and state='reserved';
 elsif p_kind in('partial','blocked','technical_failure','cancelled') then
  update turn_private.service_task_capacity set state='released',released_at=clock_timestamp() where task_id=task and state='reserved';
 end if;
 -- Clarification retains the original reservation for the same-Task continuation.
end $$;
revoke all on function place_actions_private.ask_finish_capacity_v1(uuid,text,text) from public,anon,authenticated,service_role;
