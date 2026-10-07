CREATE OR REPLACE FUNCTION profile_data_private.sources_v1()
 RETURNS TABLE(relation_name text, predicate text, order_key text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$values
 ('service_cases_private.cases','owner_id=$1 and id=any($2)','id'),
 ('service_brief_private.briefs','case_id=any($2)','case_id'),
 ('service_brief_private.previews','case_id=any($2)','id'),
 ('service_brief_private.operations','case_id=any($2)','operation_id'),
 ('service_brief_private.audit','case_id=any($2)','event_id'),
 ('service_brief_private.export_leases','owner_id=$1','request_id'),
 ('scoped_edit_private.contexts_v1','owner_id=$1','id'),
 ('scoped_edit_private.operations_v1','context_id=any($3)','operation_id'),
 ('scoped_edit_private.lineage_v1','context_id=any($3)','proposal_id'),
 ('scoped_edit_private.proofs_v1','context_id=any($3)','proposal_id'),
 ('public.turns','id=any($4)','id'),
 ('turn_private.service_tasks','id in(select task_id from scoped_edit_private.work_v1 where context_id=any($3))','id'),
 ('public.model_budget_scopes','id in(select scope_id from scoped_edit_private.work_v1 where context_id=any($3))','id'),
 ('public.model_budget_attempts','attempt_id in(select attempt_id from scoped_edit_private.work_v1 where context_id=any($3))','attempt_id'),
 ('turn_private.work','turn_id=any($4)','turn_id'),
 ('scoped_edit_private.work_v1','context_id=any($3)','turn_id'),
 ('scoped_edit_private.requests_v1','turn_id=any($4)','turn_id'),
 ('turn_private.text_content','turn_id=any($4)','turn_id'),
 ('turn_private.text_dispatches','turn_id=any($4)','lease_token'),
 ('scoped_edit_private.worker_settings_v1','policy_id in(select policy_id from scoped_edit_private.work_v1 where context_id=any($3))','policy_id'),
 ('recovery_private.contexts_v1','owner_id=$1','id'),
 ('recovery_private.operations_v1','context_id=any($5)','operation_id'),
 ('recovery_private.lineage_v1','context_id=any($5)','proposal_id'),
 ('recovery_private.transport_proofs_v1','context_id=any($5)','proposal_id'),
 ('export_private.core_policies_v1','id in(select policy_id from export_private.core_jobs_v1 where owner_id=$1)','id'),
 ('export_private.core_jobs_v1','owner_id=$1','request_id'),
 ('export_private.core_artifacts_v1','request_id in(select request_id from export_private.core_jobs_v1 where owner_id=$1)','request_id'),
 ('export_private.core_tickets_v1','request_id in(select request_id from export_private.core_jobs_v1 where owner_id=$1)','operation_id'),
 ('public.privacy_requests','owner_id=$1','id')
$function$
