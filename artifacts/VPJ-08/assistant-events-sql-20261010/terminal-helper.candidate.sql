-- Candidate internal failure cleanup only, invoked by exact original claimers
-- after their lock_turn returned false. No dispatch/settlement/financial write.
create function turn_private.cancel_unclaimable_turn_v1(p_turn uuid,p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare t public.turns%rowtype;attempt_n integer;
begin
 -- Only the newly versioned conversation Task observer emits a cancellation.
 -- Legacy plain/grounded Turns retain their original history and projection.
 if not exists(select 1 from turn_private.service_task_turns l where l.turn_id=p_turn
  and l.owner_id=p_owner and turn_private.assistant_event_link_v1(p_owner,l.task_id,p_turn) is not null) then return;end if;
 -- lock_turn has already taken auth owner + account (unless owner is gone).
 -- Recheck using the same order; never require a now-revoked worker session
 -- in order to emit the actual cancellation that the original writer performs.
 perform 1 from auth.users where id=p_owner for key share nowait;
 if not found then return;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update nowait;
 select * into t from public.turns where id=p_turn and owner_id=p_owner for update nowait;
 if not found then return;end if;
 perform 1 from public.chat_threads where id=t.thread_id and owner_id=p_owner for update nowait;
 if not found then return;end if;
 select attempt into attempt_n from turn_private.work where turn_id=p_turn and owner_id=p_owner
  and state in ('queued','leased') for update nowait;
 if not found then return;end if;
 -- Existing terminal helper preserves an already terminal status; it records
 -- only a genuine newly cancelled Turn and clears its original work lease.
 perform turn_private.terminal(p_turn,'cancelled',attempt_n);
end $$;
revoke all on function turn_private.cancel_unclaimable_turn_v1(uuid,uuid) from public,anon,authenticated,service_role;
