-- Repairs ACLs for existing databases. The baseline correction in
-- 20260909223841 is required separately so fresh bootstrap reaches this point.
revoke all on function public.append_chat_turn_event(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.append_chat_turn_event(uuid,text,text,text) to service_role;
revoke all on function public.capture_initial_trip_version() from public,anon,authenticated;

do $$
begin
  if has_function_privilege('anon','public.append_chat_turn_event(uuid,text,text,text)'::regprocedure,'EXECUTE')
    or has_function_privilege('authenticated','public.append_chat_turn_event(uuid,text,text,text)'::regprocedure,'EXECUTE')
    or has_function_privilege('anon','public.capture_initial_trip_version()'::regprocedure,'EXECUTE')
    or has_function_privilege('authenticated','public.capture_initial_trip_version()'::regprocedure,'EXECUTE') then
    raise exception 'MOBILE_GUARD_RPC_ACL_NOT_REVOKED';
  end if;
  if not has_function_privilege('service_role','public.append_chat_turn_event(uuid,text,text,text)'::regprocedure,'EXECUTE') then
    raise exception 'MOBILE_GUARD_WORKER_RPC_NOT_GRANTED';
  end if;
end $$;
