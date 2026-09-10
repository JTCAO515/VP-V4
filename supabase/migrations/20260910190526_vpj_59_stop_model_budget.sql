-- Stop a trusted worker scope without refunding any potentially dispatched charge.
-- Scope row locking serializes stop against reserve, dispatch and settlement.
-- No scope is created or enabled, and no existing usage evidence is rewritten.
create function public.stop_model_budget(p_scope_id uuid, p_owner_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.model_budget_scopes%rowtype;
  released_count bigint;
  pending_count bigint;
begin
  select * into s from public.model_budget_scopes where id = p_scope_id for update;
  if not found or s.owner_id is distinct from p_owner_id then
    return jsonb_build_object('kind','unavailable');
  end if;
  update public.model_budget_scopes set enabled = false where id = p_scope_id;
  update public.model_budget_attempts set status = 'released', updated_at = clock_timestamp()
    where scope_id = p_scope_id and status = 'reserved';
  get diagnostics released_count = row_count;
  update public.model_budget_attempts set status = 'pending', updated_at = clock_timestamp()
    where scope_id = p_scope_id and status = 'dispatched';
  get diagnostics pending_count = row_count;
  return jsonb_build_object('kind','stopped','released',released_count,'pending',pending_count);
end;
$$;
revoke all on function public.stop_model_budget(uuid,uuid) from public, anon, authenticated;
grant execute on function public.stop_model_budget(uuid,uuid) to service_role;
