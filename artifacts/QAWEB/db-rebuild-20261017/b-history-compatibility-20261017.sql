BEGIN READ ONLY;
SELECT jsonb_build_object(
 'dbTimeUTC',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'readOnly',current_setting('transaction_read_only'),'currentUser',current_user,'sessionUser',session_user,
 'currentRole',(SELECT jsonb_build_object('superuser',rolsuper,'bypassRls',rolbypassrls) FROM pg_catalog.pg_roles WHERE rolname=current_user),
 'policyContextViolations',(SELECT count(*) FROM turn_private.text_policies WHERE context_mode IS NULL OR context_mode NOT IN ('current_input_v1','task_history_v1','knowledge_intent_v1','qa_session_history_v1')),
 'relationshipViolations',(SELECT count(*) FROM turn_private.service_task_turns WHERE relationship IS NULL OR relationship NOT IN ('new_goal','clarification','repair','qa_followup','qa_correction')),
 'existingQaPolicyRows',(SELECT count(*) FROM turn_private.text_policies WHERE context_mode='qa_session_history_v1'),
 'existingQaRelationshipRows',(SELECT count(*) FROM turn_private.service_task_turns WHERE relationship IN ('qa_followup','qa_correction')),
 'workLeaseShapeViolations',(SELECT count(*) FROM turn_private.work WHERE ((state='leased') IS DISTINCT FROM (lease_token IS NOT NULL AND expires_at IS NOT NULL)) OR (state<>'leased' AND (lease_token IS NOT NULL OR expires_at IS NOT NULL))),
 'visibleHistoryMissingOwnerLink',(SELECT count(*) FROM turn_private.text_content c JOIN turn_private.text_policies p ON p.id=c.policy_id WHERE c.hidden_at IS NULL AND p.context_mode IN ('task_history_v1','knowledge_intent_v1') AND NOT EXISTS(SELECT 1 FROM turn_private.service_task_turns l WHERE l.turn_id=c.turn_id AND l.owner_id=c.owner_id))
) AS compatibility;
ROLLBACK;
