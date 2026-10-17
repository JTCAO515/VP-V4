-- SOURCE ONLY. Never execute independently; all D1/D2 gates unresolved.
BEGIN;
DO $$BEGIN RAISE EXCEPTION 'D2_NO_TARGET_LEASE_OR_DEPENDENCY_PROOF';END$$;
grant execute on function public.qa_accept_policy_v1(p_policy_id uuid, p_notice_hash text) to authenticated;
grant execute on function public.qa_cancellation_v1(p_action text, p_thread_id uuid, p_request_id uuid) to authenticated;
grant execute on function public.qa_read_policy_v1(p_policy_id uuid) to authenticated;
grant execute on function public.qa_ready_groups_v3(p_limit integer, p_model text, p_price_version text, p_endpoint text, p_owner_id uuid, p_policy_id uuid, p_scope_id uuid, p_notice_hash text) to service_role;
grant execute on function public.qa_claim_work_v1(p_owner_id uuid, p_policy_id uuid) to service_role;
grant execute on function public.qa_read_session_v1(p_thread_id uuid) to authenticated;
grant execute on function public.qa_complete_work_v1(p_turn_id uuid, p_lease_token uuid, p_kind text, p_text text) to service_role;
grant execute on function public.qa_list_sessions_v1(p_limit integer) to authenticated;
grant execute on function public.qa_read_work_v1(p_turn_id uuid, p_lease_token uuid) to service_role;
grant execute on function public.qa_submit_message_v1(p_thread_id uuid, p_turn_id uuid, p_idempotency_key uuid, p_policy_id uuid, p_locale text, p_text text, p_task_id uuid, p_relationship text) to authenticated;
grant execute on function public.qa_authorize_dispatch_v1(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text) to service_role;
grant execute on function public.qa_native_session_v1(p_action text, p_mobile_epoch bigint, p_payload jsonb) to authenticated;
grant execute on function public.qa_authorize_dispatch_v2(p_turn_id uuid, p_lease_token uuid, p_scope_id uuid, p_policy_id uuid, p_provider text, p_context_digest text, p_owner_id uuid, p_notice_hash text) to service_role;
ROLLBACK;
