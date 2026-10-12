create function identity_private.guard_mobile_rpc_v2()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from identity_private.mobile_accounts where owner_id=auth.uid() for update;
  if not identity_private.mobile_access_v2() then raise exception 'SESSION_REPLACED'; end if;
end $$;
