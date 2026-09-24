-- Function EXECUTE hardening (VP-V4 optimisation thread T8, 2026-09-23).
--
-- Observed on a disposable local Supabase stack with every migration applied: the role that runs
-- migrations (postgres) carries Supabase's default privileges
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
--     TO anon, authenticated, service_role
-- so every function created in public receives direct anon/authenticated/service_role grants. The
-- migrations below only wrote `revoke all ... from public`, which does not remove those direct
-- grants, so anon could EXECUTE 18 public functions (14 SECURITY DEFINER). The function bodies still
-- reject a missing auth.uid() (FORBIDDEN), so no bypass was observed; this closes the privilege layer
-- underneath that check (defence in depth) and restores each migration's written intent.
--
-- Intent recovered from each creating migration (the grant it wrote, not the observed default):
--   * authenticated only (explicit `grant ... to authenticated`): the 15 functions revoked from anon below.
--   * no API role at all (`revoke all ... from public`, no grant): trip_content_snapshot and
--     apply_trip_content_patch. They are called only from SECURITY DEFINER functions
--     (confirm_and_apply_trip_proposal, create_trip_proposal_patch, revise_trip_proposal_patch),
--     which execute them as the owner, so no caller role needs EXECUTE.
--   * anon: public.research_intake_v1(jsonb) only (public research intake), unchanged here.
-- service_role keeps its existing grants on those 15 functions; changing trusted server-key
-- access is out of scope for this repair.

revoke execute on function public.cancel_chat_turn(uuid) from anon;
revoke execute on function public.confirm_and_apply_trip_proposal(uuid, text, text) from anon;
revoke execute on function public.connection_probe_ops_visible_count() from anon;
revoke execute on function public.create_explicit_memory_profile(uuid, uuid, uuid, text, text) from anon;
revoke execute on function public.create_memory_retrieval_consent() from anon;
revoke execute on function public.create_trip_proposal_patch(uuid, jsonb) from anon;
revoke execute on function public.create_trip_rollback_proposal(uuid, integer) from anon;
revoke execute on function public.grant_memory_retrieval_consent(uuid) from anon;
revoke execute on function public.read_retrievable_memory_profiles() from anon;
revoke execute on function public.record_turn_feedback(uuid, text, text) from anon;
revoke execute on function public.request_privacy_action(uuid, text) from anon;
revoke execute on function public.revise_trip_proposal_patch(uuid, jsonb) from anon;
revoke execute on function public.revoke_memory_retrieval_consent(uuid) from anon;
revoke execute on function public.save_user_profile(text, text, text, text, text, text, time) from anon;
revoke execute on function public.transition_memory_profile(uuid, text) from anon;

revoke all on function public.trip_content_snapshot(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.apply_trip_content_patch(jsonb, jsonb) from public, anon, authenticated, service_role;

-- Future functions created by the migration role get no implicit EXECUTE for PUBLIC (global
-- default, which a per-schema entry cannot remove) nor for anon/authenticated in public (Supabase
-- per-schema default). Each new function must state its callers with an explicit GRANT; service_role
-- keeps its public-schema default. tests/integration/identity/function-acl.test.mjs pins the result.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Checks only the functions this migration owns the intent for; the complete anon/authenticated
-- allowlist over every repository function is asserted by the integration test, so objects that a
-- hosted project may hold outside this repository cannot block the deploy here.
do $$
declare
  unexpected text;
begin
  select string_agg(f::text, ', ') into unexpected
  from unnest(array[
    'public.cancel_chat_turn(uuid)',
    'public.confirm_and_apply_trip_proposal(uuid,text,text)',
    'public.connection_probe_ops_visible_count()',
    'public.create_explicit_memory_profile(uuid,uuid,uuid,text,text)',
    'public.create_memory_retrieval_consent()',
    'public.create_trip_proposal_patch(uuid,jsonb)',
    'public.create_trip_rollback_proposal(uuid,integer)',
    'public.grant_memory_retrieval_consent(uuid)',
    'public.read_retrievable_memory_profiles()',
    'public.record_turn_feedback(uuid,text,text)',
    'public.request_privacy_action(uuid,text)',
    'public.revise_trip_proposal_patch(uuid,jsonb)',
    'public.revoke_memory_retrieval_consent(uuid)',
    'public.save_user_profile(text,text,text,text,text,text,time)',
    'public.transition_memory_profile(uuid,text)',
    'public.trip_content_snapshot(uuid,text)',
    'public.apply_trip_content_patch(jsonb,jsonb)'
  ]::regprocedure[]) f
  where has_function_privilege('anon', f, 'EXECUTE');
  if unexpected is not null then
    raise exception 'FUNCTION_ACL_ANON_NOT_REVOKED: %', unexpected;
  end if;
  if not has_function_privilege('anon', 'public.research_intake_v1(jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'FUNCTION_ACL_INTAKE_ANON_LOST';
  end if;
  if has_function_privilege('authenticated', 'public.trip_content_snapshot(uuid,text)'::regprocedure, 'EXECUTE')
    or has_function_privilege('authenticated', 'public.apply_trip_content_patch(jsonb,jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'FUNCTION_ACL_INTERNAL_HELPER_EXPOSED';
  end if;
  if not has_function_privilege('authenticated', 'public.save_user_profile(text,text,text,text,text,text,time)'::regprocedure, 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'FUNCTION_ACL_AUTHENTICATED_LOST';
  end if;
  if exists (
    select 1 from pg_default_acl a, aclexplode(a.defaclacl) x
    where a.defaclrole = current_user::regrole and a.defaclobjtype = 'f'
      and a.defaclnamespace in (0, 'public'::regnamespace)
      and x.privilege_type = 'EXECUTE'
      and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole))
  ) or not exists (
    select 1 from pg_default_acl a
    where a.defaclrole = current_user::regrole and a.defaclnamespace = 0 and a.defaclobjtype = 'f'
  ) then
    raise exception 'FUNCTION_ACL_DEFAULT_PRIVILEGES_NOT_REVOKED';
  end if;
end $$;
