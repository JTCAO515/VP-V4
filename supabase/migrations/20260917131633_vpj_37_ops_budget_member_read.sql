-- VPJ-37: expose the existing service-only aggregate to live Ops members.
-- This dedicated schema grants no access to the wider knowledge private schema.
create schema ops_budget_private;
revoke all on schema ops_budget_private from public, anon, authenticated, service_role;
create function ops_budget_private.read_ops_budget_scope_for_member_v1(p_scope_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  -- This existing guard locks the live Auth session and active membership before
  -- the read. Revocation cannot commit between this check and the snapshot.
  perform knowledge_review_private.current_actor();
  if p_scope_id is null then raise exception 'INVALID_INPUT'; end if;
  return public.read_ops_budget_scope_v1(p_scope_id);
end $$;
revoke all on function ops_budget_private.read_ops_budget_scope_for_member_v1(uuid)
  from public, anon, authenticated, service_role;
grant usage on schema ops_budget_private to authenticated;
grant execute on function ops_budget_private.read_ops_budget_scope_for_member_v1(uuid)
  to authenticated;

create function public.ops_budget_scope_read_v1(p_scope_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select ops_budget_private.read_ops_budget_scope_for_member_v1(p_scope_id);
$$;
revoke all on function public.ops_budget_scope_read_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.ops_budget_scope_read_v1(uuid) to authenticated;
notify pgrst, 'reload schema';
