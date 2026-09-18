-- Security audit finding (2026-09-18): private.ai10_confirm_fault_trigger, added by
-- 20260825161535_ai10_confirm_fault_triggers.sql, still carries the Postgres default
-- PUBLIC EXECUTE grant that was never revoked. It is fired only as an AFTER trigger on
-- trips/trip_events/trip_proposals/trip_idempotency/trip_audit_events, so no role needs
-- EXECUTE privilege for the trigger itself to work: Postgres fires trigger functions
-- without checking the DML caller's EXECUTE privilege on the function. The remaining
-- privilege is therefore unused surface, not a required grant, and is inconsistent with
-- every later-added function in this schema (which explicitly revokes from
-- public/anon/authenticated on creation). No caller in lib/, tests/, or scripts/ sets the
-- app.ai10_fault_at GUC this trigger reads; closing the ACL here does not remove or alter
-- that harness hook, only the accidental default grant.
revoke all on function private.ai10_confirm_fault_trigger() from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon','private.ai10_confirm_fault_trigger()'::regprocedure,'EXECUTE')
    or has_function_privilege('authenticated','private.ai10_confirm_fault_trigger()'::regprocedure,'EXECUTE') then
    raise exception 'AI10_FAULT_TRIGGER_ACL_NOT_REVOKED';
  end if;
end $$;
