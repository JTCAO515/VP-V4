create function public.claim_planning_intake_place_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
q:=turn_private.planning_v2_run_basis(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;return turn_private.claim_planning_v2_place_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
