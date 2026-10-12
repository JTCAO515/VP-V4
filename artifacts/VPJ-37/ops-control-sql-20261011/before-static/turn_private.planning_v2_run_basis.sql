create function turn_private.planning_v2_run_basis(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r turn_private.planning_v2_execution_runs%rowtype;p turn_private.planning_v2_execution_profiles%rowtype;
 q jsonb;t turn_private.service_tasks%rowtype;s public.model_budget_scopes%rowtype;l public.model_budget_provider_limits%rowtype;tar turn_private.planning_v2_registered_tariffs%rowtype;origin text;
begin
 select * into r from turn_private.planning_v2_execution_runs where task_id=p_task and owner_id=p_owner and turn_id=p_turn;
 if not found then return null; end if;
 origin:=turn_private.planning_v2_collector_principal(r.profile_id);if origin is null or origin<>r.origin_kind then return null;end if;
 select * into p from turn_private.planning_v2_execution_profiles where id=r.profile_id;
 if to_jsonb(p) is distinct from r.profile_snapshot or p.revision<>r.profile_revision or not exists(select 1 from turn_private.text_policies tp join turn_private.planning_policies pp on pp.text_policy_id=tp.id where tp.id=p.text_policy_id and pp.id=p.planning_policy_id and pp.environment=p.environment and tp.endpoint=p.endpoint and tp.recipient=p.recipient) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,34));
 perform 1 from auth.users where id=p_owner for key share nowait;if not found then return null;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update;if not found then return null;end if;
 select * into t from turn_private.service_tasks where id=p_task and owner_id=p_owner for update nowait;
 if not found or t.last_turn_id<>p_turn or t.policy_id<>p.text_policy_id or t.budget_scope_id is distinct from p.scope_id then return null;end if;
 q:=turn_private.read_planning_qualified_intake_v1(p_owner,p_turn,p_lease);
 if q->>'kind' is distinct from 'planning_intake_input' or q->>'taskId' is distinct from p_task::text or q->>'planningPolicyId' is distinct from p.planning_policy_id::text
 or q->>'intakeContextDigest' is distinct from p_intake_digest or q->>'planningContextDigest' is distinct from p_planning_digest or r.intake_digest<>p_intake_digest or r.planning_digest<>p_planning_digest then return null;end if;
 select * into s from public.model_budget_scopes where id=p.scope_id for share nowait;
 if not found or s.owner_id<>p_owner or s.currency<>'CNY' or not s.enabled or s.frozen or s.expires_at<=clock_timestamp() then return null;end if;
 select * into l from public.model_budget_provider_limits where scope_id=p.scope_id and provider='qwen' for share nowait;
 select * into tar from turn_private.planning_v2_registered_tariffs where id=p.tariff_id for share nowait;
 if l.scope_id is null or tar.id is null or not l.enabled or not tar.enabled or tar.valid_until<=clock_timestamp() or l.model<>tar.model or l.price_version<>tar.price_version
 or r.execution->>'model' is distinct from tar.model or r.execution->>'priceVersion' is distinct from tar.price_version then return null;end if;
 perform 1 from turn_private.planning_v2_execution_runs where id=r.id for share nowait;
 return jsonb_build_object('runId',r.id,'qualification',q,'execution',r.execution,'originKind',origin,'originalLease',r.original_lease);
exception when lock_not_available then return null;
end $$;
