create function public.set_hosted_worker_enabled(p_enabled boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_enabled is null or p_reason is null or p_reason !~ '^[A-Za-z0-9 ._:#/-]{1,200}$' then raise exception 'INVALID_INPUT'; end if;
  update turn_private.hosted_worker_control set enabled = p_enabled, changed_at = clock_timestamp(), reason = p_reason where singleton;
  return jsonb_build_object('kind','ok','enabled',p_enabled);
end $$;
