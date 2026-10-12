create function turn_private.planning_v2_exact_model_basis(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;e jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return null;end if;e:=q->'execution';
 if e->>'textPolicyId' is distinct from p_text_policy::text or e->>'scopeId' is distinct from p_scope::text or e->>'provider' is distinct from p_provider or e->>'model' is distinct from p_model or e->>'priceVersion' is distinct from p_price_version or q->'qualification'->>'planningPolicyId' is distinct from p_planning_policy::text or p_attempt is null then return null;end if;
 if exists(select 1 from turn_private.planning_v2_model_attempt_bindings mb where mb.turn_id=p_turn and (mb.claim_lease is distinct from p_lease or mb.scope_id is distinct from p_scope or mb.attempt_id is distinct from p_attempt)) then return null;end if;
 return q;
exception when lock_not_available then return null;
end $$;
