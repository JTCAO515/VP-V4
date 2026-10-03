import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { identityLocalEnv } from "./local-supabase.mjs";
import test from "node:test";

// Function EXECUTE allowlist on a disposable Supabase stack with every migration applied.
// Scope: every function owned by the migration role (postgres) that is not an extension member —
// i.e. every function this repository creates, in any schema. Supabase platform functions (auth,
// storage, realtime, graphql, extensions) are owned by other roles and are out of scope.
// Adding a function that anon or authenticated can execute must update the matching list here in
// the same PR, with the intended caller recorded in its migration's explicit GRANT.

const ANON = ["public.research_intake_v1(jsonb)"];

const AUTHENTICATED = [
  "public.read_assistant_message_sources_v2(uuid,uuid,uuid,uuid,integer)",
  "public.submit_assistant_message_sources_v2(uuid,uuid,uuid,uuid,text,text,text,uuid,integer,uuid,uuid,uuid,jsonb)",
  "public.submit_assistant_travel_intake_v1(uuid,uuid,uuid,uuid,integer,integer,uuid,uuid,text,text,text,jsonb,jsonb)",
  "public.read_assistant_travel_intake_v1(uuid,uuid,uuid)",
  "public.read_assistant_travel_intake_write_basis_v1(uuid,uuid,uuid)",
  "identity_private.mobile_access_v2()",
  "identity_private.mobile_session_v2(text,uuid)",
  "ops_budget_private.read_ops_budget_scope_for_member_v1(uuid)",
  "public.accept_planning_policy_v1(uuid,text)",
  "public.accept_text_policy(uuid,text)",
  "public.archive_trip_v1(uuid,integer,uuid,boolean)",
  "public.cancel_chat_turn(uuid)",
  "public.community_workspace(jsonb)",
  "public.confirm_and_apply_trip_proposal(uuid,text,text)",
  "public.connection_probe_ops_visible_count()",
  "public.consume_place_quota_v1(text,integer,integer)",
  "public.create_explicit_memory_profile(uuid,uuid,uuid,text,text)",
  "public.create_explicit_memory_profile_v2(uuid,uuid,uuid,text,text)",
  "public.create_memory_retrieval_consent()",
  "public.create_trip_proposal_patch(uuid,jsonb)",
  "public.create_trip_rollback_proposal(uuid,integer)",
  "public.grant_memory_retrieval_consent(uuid)",
  "public.grounded_ai_assist_work_v1(jsonb)",
  "public.knowledge_answer_v1(jsonb)",
  "public.knowledge_read_v1(jsonb)",
  "public.list_grounded_turns(uuid,integer)",
  "public.list_assistant_goal_trip_links_v1(uuid,integer)",
  "public.list_assistant_conversations_v1(uuid)",
  "public.list_assistant_conversation_tasks_v1(uuid,uuid,jsonb)",
  "public.read_assistant_task_activity_v1(uuid,uuid,uuid)",
  "public.list_service_task_turns(uuid,integer)",
  "public.list_saved_translations_v1(uuid,uuid)",
  "public.list_text_turns(uuid,integer)",
  "public.native_task_travel_pace_v1(jsonb)",
  "public.native_travel_pace_v1(jsonb)",
  "public.native_session_v2(text,uuid)",
  "public.ops_budget_scope_read_v1(uuid)",
  "public.ops_knowledge_provenance_read_v1(jsonb)",
  "public.ops_review_workspace(jsonb)",
  "public.ops_source_revision_withdraw_v1(jsonb)",
  "public.ops_wiki_generation_v1(jsonb)",
  "public.ops_wiki_read_v1(jsonb)",
  "public.ops_wiki_withdrawal_scan_v1(jsonb)",
  "public.read_grounded_ai_assist_context_v1(uuid)",
  "public.read_grounded_events(uuid,uuid,bigint)",
  "public.read_grounded_policy(uuid)",
  "public.read_grounded_turn(uuid)",
  "public.read_assistant_conversation_v1(uuid,uuid)",
  "public.read_assistant_goal_trip_link_v1(uuid)",
  "public.read_assistant_journeys_page_v1(uuid,text)",
  "public.read_journeys_goal_index_v1(uuid,text)",
  "public.read_planning_policy_v1(uuid)",
  "public.read_result_artifacts_v1(uuid,integer)",
  "public.choose_result_decision_v2(uuid,integer,uuid,text)",
  "public.read_result_artifact_v2(uuid,integer)",
  "public.read_task_result_reference_v2(uuid)",
  "public.read_trip_result_reference_v2(uuid)",
  "public.search_result_artifacts_v2(text,uuid)",
  "public.read_change_proposal_reference_v1(uuid,integer)",
  "public.read_trip_change_proposal_reference_v1(uuid)",
  "public.read_task_result_reference_v1(uuid)",
  "public.search_result_artifacts_v1(text,uuid)",
  "public.read_trip_result_reference_v1(uuid)",
  "public.read_retrievable_memory_profiles()",
  "public.read_text_policy(uuid)",
  "public.read_text_task_policy(uuid)",
  "public.read_text_turn(uuid)",
  "public.read_saved_translation_v1(uuid,uuid)",
  "public.read_trip_confirmation_receipt_v1(uuid)",
  "public.read_trip_deletion_v1(uuid)",
  "public.read_trip_proposal_v2(uuid)",
  "public.record_turn_feedback(uuid,text,text)",
  "public.reject_trip_proposal_v2(uuid)",
  "public.request_privacy_action(uuid,text)",
  "public.request_trip_deletion_v1(uuid,uuid,integer,boolean)",
  "public.research_intake_v1(jsonb)",
  "public.revise_trip_proposal(uuid,text)",
  "public.revise_trip_proposal_patch(uuid,jsonb)",
  "public.revoke_memory_retrieval_consent(uuid)",
  "public.save_user_profile(text,text,text,text,text,text,time without time zone)",
  "public.service_case_v1(jsonb)",
  "public.set_assistant_goal_trip_link_v1(uuid,uuid,uuid,uuid,integer,integer,text,uuid,integer,boolean)",
  "public.start_chat_turn(uuid,uuid,uuid,text)",
  "public.start_text_turn(uuid,uuid,uuid,uuid,text,text)",
  "public.submit_grounded_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid,text)",
  "public.submit_assistant_message_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,integer,uuid,uuid,uuid)",
  "public.submit_planning_comparison_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb)",
  "public.submit_planning_comparison_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,uuid,bigint,integer,text,jsonb)",
  "public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid)",
  "public.submit_text_turn(uuid,uuid,uuid,uuid,text,text)",
  "public.transition_memory_profile(uuid,text)",
  "public.undo_explicit_memory_create_v1(uuid,uuid,bigint,uuid)",
  "public.travel_reminders_v1(uuid,text,jsonb)",
  "public.withdraw_planning_policy_v1(uuid)",
  "public.withdraw_text_policy(uuid)",
];

const executable = (role) => `
  select p.oid::regprocedure::text
  from pg_proc p
  where p.proowner = 'postgres'::regrole
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('${role}', p.oid, 'EXECUTE')
  order by p.oid::regprocedure::text collate "C";`;

test("repository functions grant EXECUTE to anon and authenticated only through the reviewed allowlist", async (t) => {
  const env = identityLocalEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.DB_CONTAINER) return t.skip("explicit disposable identity Supabase target is not configured");
  // search_path '' makes regprocedure print schema-qualified names.
  const sql = (query) => execFileSync("docker", ["exec", "-i", env.DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-Atq", "-v", "ON_ERROR_STOP=1"], {
    input: `set statement_timeout = '10s'; set search_path = ''; ${query}`,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim().split("\n").filter(Boolean);

  await t.test("anon executes only the public research intake", () => {
    assert.deepEqual(sql(executable("anon")), ANON);
  });

  await t.test("authenticated executes exactly the reviewed caller list", () => {
    assert.deepEqual(sql(executable("authenticated")), [...AUTHENTICATED].sort());
  });

  await t.test("selected-source export remains exactly service-only and source storage private",()=>{
    assert.deepEqual(sql("select has_function_privilege('anon','public.assistant_message_source_export_owner_v2(uuid,uuid,integer)'::regprocedure,'EXECUTE'),has_function_privilege('authenticated','public.assistant_message_source_export_owner_v2(uuid,uuid,integer)'::regprocedure,'EXECUTE'),has_function_privilege('service_role','public.assistant_message_source_export_owner_v2(uuid,uuid,integer)'::regprocedure,'EXECUTE');"),["f|f|t"]);
    for(const role of ["anon","authenticated","service_role"])assert.deepEqual(sql(`select has_table_privilege('${role}','turn_private.assistant_message_source_receipts','SELECT,INSERT,UPDATE,DELETE');`),["f"]);
  });

  await t.test("internal Trip content helpers are not callable by any API role", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.deepEqual(sql(`select has_function_privilege('${role}', 'public.trip_content_snapshot(uuid,text)'::regprocedure, 'EXECUTE'), has_function_privilege('${role}', 'public.apply_trip_content_patch(jsonb,jsonb)'::regprocedure, 'EXECUTE');`), ["f|f"], role);
    }
  });

  await t.test("Memory create/Undo grants only authenticated, never anonymous or service role", () => {
    for (const role of ["anon", "service_role"]) {
      assert.deepEqual(sql(`select has_function_privilege('${role}', 'public.create_explicit_memory_profile_v2(uuid,uuid,uuid,text,text)'::regprocedure, 'EXECUTE'), has_function_privilege('${role}', 'public.undo_explicit_memory_create_v1(uuid,uuid,bigint,uuid)'::regprocedure, 'EXECUTE');`), ["f|f"], role);
    }
  });

  await t.test("result publication is internal and result tables have no direct API grants", () => {
    assert.deepEqual(sql(`select has_function_privilege('anon', 'public.publish_comparison_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb)'::regprocedure, 'EXECUTE'),
      has_function_privilege('authenticated', 'public.publish_comparison_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb)'::regprocedure, 'EXECUTE'),
      has_function_privilege('service_role', 'public.publish_comparison_result_v1(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb)'::regprocedure, 'EXECUTE');`), ["f|f|t"]);
    assert.deepEqual(sql(`select has_function_privilege('anon','public.withdraw_result_artifact_v1(uuid,uuid,integer)'::regprocedure,'EXECUTE'),
      has_function_privilege('authenticated','public.withdraw_result_artifact_v1(uuid,uuid,integer)'::regprocedure,'EXECUTE'),
      has_function_privilege('service_role','public.withdraw_result_artifact_v1(uuid,uuid,integer)'::regprocedure,'EXECUTE');`), ["f|f|t"]);
    assert.deepEqual(sql(`select has_function_privilege('anon','public.read_result_events_v1(bigint,integer)'::regprocedure,'EXECUTE'),
      has_function_privilege('authenticated','public.read_result_events_v1(bigint,integer)'::regprocedure,'EXECUTE'),
      has_function_privilege('service_role','public.read_result_events_v1(bigint,integer)'::regprocedure,'EXECUTE');`), ["f|f|t"]);
    for (const table of ["result_artifacts", "result_revisions", "result_events"]) {
      assert.deepEqual(sql(`select has_table_privilege('authenticated','turn_private.${table}','SELECT'),has_table_privilege('service_role','turn_private.${table}','SELECT');`), ["f|f"]);
    }
  });

  await t.test("five-result v2 exact grants keep publisher/export internal and helpers inaccessible", () => {
    for (const fn of ["publish_result_artifact_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb,jsonb)","result_artifact_export_owner_v1(uuid,text,jsonb,integer)"]) {
      assert.deepEqual(sql(`select has_function_privilege('anon','public.${fn}'::regprocedure,'EXECUTE'),has_function_privilege('authenticated','public.${fn}'::regprocedure,'EXECUTE'),has_function_privilege('service_role','public.${fn}'::regprocedure,'EXECUTE');`),["f|f|t"],fn);
    }
    for(const fn of ["choose_result_decision_v2(uuid,integer,uuid,text)","read_result_artifact_v2(uuid,integer)","read_task_result_reference_v2(uuid)","read_trip_result_reference_v2(uuid)","search_result_artifacts_v2(text,uuid)"]) {
      assert.deepEqual(sql(`select has_function_privilege('anon','public.${fn}'::regprocedure,'EXECUTE'),has_function_privilege('authenticated','public.${fn}'::regprocedure,'EXECUTE'),has_function_privilege('service_role','public.${fn}'::regprocedure,'EXECUTE');`),["f|t|f"],fn);
    }
    for(const role of ["anon","authenticated","service_role"]){
      assert.deepEqual(sql(`select has_function_privilege('${role}','turn_private.publish_result_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb,jsonb,boolean)'::regprocedure,'EXECUTE');`),["f"]);
      assert.deepEqual(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='turn_private' and p.proname in ('result_uuid_v2','result_int_v2','valid_result_evidence_v2','result_evidence_current_v2','valid_result_draft_v2','valid_result_content_v2','translation_numbers_v2','result_translation_projection_v2','result_domain_state_v2','result_state_v2','result_title_v2','result_summary_v2','project_result_display_v2','legacy_result_basis_state_v2') and has_function_privilege('${role}',p.oid,'EXECUTE');`),["0"]);
    }
  });

  await t.test("planning execution stays service-only with private, RLS-enabled storage", () => {
    for (const fn of ["claim_planning_comparison_work_v1(uuid,uuid)","read_planning_comparison_work_v1(uuid,uuid)",
      "hosted_planning_target_v1(uuid,uuid,uuid,text,bigint,uuid,uuid)",
      "authorize_planning_dispatch_v1(uuid,uuid,text,uuid,uuid)","complete_planning_observation_v1(uuid,uuid,uuid,text,jsonb)",
      "complete_planning_comparison_v1(uuid,uuid,uuid,text,uuid,text,jsonb)"]) {
      assert.deepEqual(sql(`select has_function_privilege('anon','public.${fn}'::regprocedure,'EXECUTE'),
        has_function_privilege('authenticated','public.${fn}'::regprocedure,'EXECUTE'),
        has_function_privilege('service_role','public.${fn}'::regprocedure,'EXECUTE');`),["f|f|t"],fn);
    }
    for (const table of ["planning_consents","planning_comparisons","planning_model_dispatches","planning_observations"]) {
      assert.deepEqual(sql(`select relrowsecurity from pg_class where oid='turn_private.${table}'::regclass;`),["t"],table);
      assert.deepEqual(sql(`select has_table_privilege('authenticated','turn_private.${table}','SELECT'),
        has_table_privilege('service_role','turn_private.${table}','SELECT');`),["f|f"],table);
    }
  });

  await t.test("Memory create/Undo definer RPCs guard replay and read branches against replaced mobile sessions", () => {
    assert.deepEqual(sql(`select position('identity_private.guard_mobile_rpc_v2()' in pg_get_functiondef('public.create_explicit_memory_profile_v2(uuid,uuid,uuid,text,text)'::regprocedure)) > 0,
      position('identity_private.guard_mobile_rpc_v2()' in pg_get_functiondef('public.undo_explicit_memory_create_v1(uuid,uuid,bigint,uuid)'::regprocedure)) > 0;`), ["t|t"]);
  });

  await t.test("default privileges give a new function no implicit anon, authenticated or PUBLIC EXECUTE", () => {
    const probe = (schema) => sql(`
      begin;
      create function ${schema}.vp_function_acl_probe() returns integer language sql as 'select 1';
      select has_function_privilege('anon', '${schema}.vp_function_acl_probe()'::regprocedure, 'EXECUTE'),
             has_function_privilege('authenticated', '${schema}.vp_function_acl_probe()'::regprocedure, 'EXECUTE'),
             (select coalesce(bool_or(x.grantee = 0), false) from pg_proc p, aclexplode(p.proacl) x where p.oid = '${schema}.vp_function_acl_probe()'::regprocedure);
      rollback;`);
    assert.deepEqual(probe("public"), ["f|f|f"]);
    assert.deepEqual(probe("private"), ["f|f|f"]);
  });

  await t.test("PostgREST rejects anonymous calls at the privilege layer and still serves the intake", async () => {
    const call = async (fn, body) => {
      const response = await fetch(`${env.API_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    for (const [fn, body] of [
      ["confirm_and_apply_trip_proposal", { p_proposal_id: crypto.randomUUID(), p_idempotency_key: "acl-probe", p_digest: "acl-probe" }],
      ["read_trip_confirmation_receipt_v1", { p_proposal_id: crypto.randomUUID() }],
      ["create_trip_proposal_patch", { p_trip_id: crypto.randomUUID(), p_patch: {} }],
      ["request_privacy_action", { p_request_id: crypto.randomUUID(), p_action: "export" }],
    ]) {
      const denied = await call(fn, body);
      assert.equal(denied.status, 401, `${fn}: ${JSON.stringify(denied.body)}`);
      assert.equal(denied.body.code, "42501", fn);
    }
    // A malformed payload reaches the function body and is refused there without writing: the anon path is intact.
    assert.deepEqual(await call("research_intake_v1", { p_input: {} }), { status: 200, body: { kind: "invalid_input" } });
  });
});
