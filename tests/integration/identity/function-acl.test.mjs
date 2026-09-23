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
  "identity_private.mobile_access_v2()",
  "identity_private.mobile_session_v2(text,uuid)",
  "ops_budget_private.read_ops_budget_scope_for_member_v1(uuid)",
  "public.accept_text_policy(uuid,text)",
  "public.archive_trip_v1(uuid,integer,uuid,boolean)",
  "public.cancel_chat_turn(uuid)",
  "public.community_workspace(jsonb)",
  "public.confirm_and_apply_trip_proposal(uuid,text,text)",
  "public.connection_probe_ops_visible_count()",
  "public.consume_place_quota_v1(text,integer,integer)",
  "public.create_explicit_memory_profile(uuid,uuid,uuid,text,text)",
  "public.create_memory_retrieval_consent()",
  "public.create_trip_proposal_patch(uuid,jsonb)",
  "public.create_trip_rollback_proposal(uuid,integer)",
  "public.grant_memory_retrieval_consent(uuid)",
  "public.grounded_ai_assist_work_v1(jsonb)",
  "public.knowledge_answer_v1(jsonb)",
  "public.knowledge_read_v1(jsonb)",
  "public.list_grounded_turns(uuid,integer)",
  "public.list_service_task_turns(uuid,integer)",
  "public.list_text_turns(uuid,integer)",
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
  "public.read_retrievable_memory_profiles()",
  "public.read_text_policy(uuid)",
  "public.read_text_task_policy(uuid)",
  "public.read_text_turn(uuid)",
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
  "public.start_chat_turn(uuid,uuid,uuid,text)",
  "public.start_text_turn(uuid,uuid,uuid,uuid,text,text)",
  "public.submit_grounded_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid,text)",
  "public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid)",
  "public.submit_text_turn(uuid,uuid,uuid,uuid,text,text)",
  "public.transition_memory_profile(uuid,text)",
  "public.travel_reminders_v1(uuid,text,jsonb)",
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

  await t.test("internal Trip content helpers are not callable by any API role", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.deepEqual(sql(`select has_function_privilege('${role}', 'public.trip_content_snapshot(uuid,text)'::regprocedure, 'EXECUTE'), has_function_privilege('${role}', 'public.apply_trip_content_patch(jsonb,jsonb)'::regprocedure, 'EXECUTE');`), ["f|f"], role);
    }
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
