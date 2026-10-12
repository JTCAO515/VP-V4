CREATE OR REPLACE FUNCTION public.stop_model_budget(p_scope_id uuid, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform ops_control_private.repeated_budget_stop_v1(p_scope_id,p_owner_id,s.enabled);
return jsonb_build_object('kind','stopped','released',released_count,'pending',pending_count);
end;
$function$
