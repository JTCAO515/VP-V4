-- VPJ-07 redefined this authenticated SECURITY DEFINER RPC after the VPJ-04
-- guard migration. Reapply the existing guard without changing its signature,
-- grants, or business body, so a replaced mobile session cannot replay a Turn.
do $$
declare
  f record;
  revised text;
  definition text;
begin
  select p.oid, p.prosrc, p.prosecdef, l.lanname into f
    from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'public.start_chat_turn(uuid,uuid,uuid,text)'::regprocedure;
  if not found or not f.prosecdef or f.lanname <> 'plpgsql'
    or not has_function_privilege('authenticated', f.oid, 'EXECUTE') then
    raise exception 'MOBILE_GUARD_START_CHAT_CONTRACT_CHANGED';
  end if;
  if f.prosrc !~* '\mBEGIN\M' then
    raise exception 'MOBILE_GUARD_START_CHAT_BODY_UNSUPPORTED';
  end if;
  if f.prosrc ~ 'PERFORM identity_private.guard_mobile_rpc_v2\(\);' then
    raise exception 'MOBILE_GUARD_START_CHAT_ALREADY_APPLIED';
  end if;
  revised := regexp_replace(f.prosrc, '(\mBEGIN\M)', '\1 PERFORM identity_private.guard_mobile_rpc_v2();', 'i');
  definition := replace(pg_get_functiondef(f.oid), f.prosrc, revised);
  execute definition;
  if position('PERFORM identity_private.guard_mobile_rpc_v2();' in revised) = 0 then
    raise exception 'MOBILE_GUARD_START_CHAT_REWRITE_FAILED';
  end if;
end $$;
