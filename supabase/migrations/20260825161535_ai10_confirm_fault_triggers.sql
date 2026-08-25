create or replace function private.ai10_confirm_fault_trigger()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.ai10_fault_at', true) = tg_table_name then
    raise exception 'AI10_FAULT_%', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger ai10_fault_after_trip_update
after update on public.trips
for each row execute function private.ai10_confirm_fault_trigger();
create trigger ai10_fault_after_event_insert
after insert on public.trip_events
for each row execute function private.ai10_confirm_fault_trigger();
create trigger ai10_fault_after_proposal_update
after update on public.trip_proposals
for each row execute function private.ai10_confirm_fault_trigger();
create trigger ai10_fault_after_idempotency_insert
after insert on public.trip_idempotency
for each row execute function private.ai10_confirm_fault_trigger();
create trigger ai10_fault_after_audit_insert
after insert on public.trip_audit_events
for each row execute function private.ai10_confirm_fault_trigger();
