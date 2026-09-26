import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { identityLocalEnv } from "../identity/local-supabase.mjs";

test("explicit Memory create receipt and exact-version Undo preserve owner, consent and later edits", async (t) => {
  const env = identityLocalEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY || !env.DB_CONTAINER)
    return t.skip("explicit disposable identity Supabase target is not configured");
  const users = [];
  const password = "Local-Memory-undo-123!";
  const admin = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
  const request = async (path, headers, body) => {
    const response = await fetch(`${env.API_URL}${path}`, {
      headers, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const createActor = async () => {
    const email = `memory-undo-${crypto.randomUUID()}@local.test`;
    const account = await request("/auth/v1/admin/users", admin, { email, password, email_confirm: true });
    assert.equal(account.status, 200);
    users.push(account.body.id);
    const login = await request("/auth/v1/token?grant_type=password", { apikey: env.ANON_KEY, "content-type": "application/json" }, { email, password });
    assert.equal(login.status, 200);
    return { id: account.body.id, headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${login.body.access_token}`, "content-type": "application/json" } };
  };
  const rpc = (actor, name, body) => request(`/rest/v1/rpc/${name}`, actor.headers, body);
  const db = (sql) => execFileSync("docker", ["exec", "-i", env.DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" });
  try {
    const a = await createActor(), b = await createActor();
    const consent = await rpc(a, "create_memory_retrieval_consent", {});
    assert.equal(consent.status, 200, JSON.stringify(consent.body));
    const consentId = consent.body[0].consent_id;
    const newInput = () => ({ p_memory_id: crypto.randomUUID(), p_receipt_id: crypto.randomUUID(),
      p_consent_id: consentId, p_constraint_kind: "preference", p_summary: "Walk at a relaxed pace" });
    const first = newInput();
    assert.equal((await request("/rest/v1/rpc/create_explicit_memory_profile_v2", { apikey: env.ANON_KEY, "content-type": "application/json" }, first)).status, 401);
    const created = await rpc(a, "create_explicit_memory_profile_v2", first);
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.deepEqual(created.body[0], { memory_id: first.p_memory_id, state: "explicit",
      reused: false, revision: 1, source_receipt_id: first.p_receipt_id });
    const replay = await rpc(a, "create_explicit_memory_profile_v2", first);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body[0], { ...created.body[0], reused: true });

    const undo = (input, operation = crypto.randomUUID(), revision = 1, receipt = input.p_receipt_id) => ({
      p_memory_id: input.p_memory_id, p_source_receipt_id: receipt,
      p_expected_revision: revision, p_operation_id: operation,
    });
    const anonymousUndo = await request("/rest/v1/rpc/undo_explicit_memory_create_v1", { apikey: env.ANON_KEY, "content-type": "application/json" }, undo(first));
    assert.equal(anonymousUndo.status, 401);
    const foreignUndo = await rpc(b, "undo_explicit_memory_create_v1", undo(first));
    assert.equal(foreignUndo.status, 400);
    assert.equal(foreignUndo.body.message, "FORBIDDEN");
    assert.deepEqual((await request(`/rest/v1/memory_profiles?id=eq.${first.p_memory_id}&select=id`, b.headers)).body, []);
    assert.equal((await rpc(a, "undo_explicit_memory_create_v1", undo(first, crypto.randomUUID(), 1, crypto.randomUUID()))).body.message, "MEMORY_CONFLICT");

    assert.equal((await rpc(a, "transition_memory_profile", { p_memory_id: first.p_memory_id, p_next_state: "paused" })).status, 200);
    assert.equal((await rpc(a, "transition_memory_profile", { p_memory_id: first.p_memory_id, p_next_state: "explicit" })).status, 200);
    const changed = await request(`/rest/v1/memory_profiles?id=eq.${first.p_memory_id}&select=state,revision,summary`, a.headers);
    assert.deepEqual(changed.body, [{ state: "explicit", revision: 3, summary: first.p_summary }]);
    assert.equal((await rpc(a, "undo_explicit_memory_create_v1", undo(first))).body.message, "MEMORY_CONFLICT");

    const second = newInput();
    assert.equal((await rpc(a, "create_explicit_memory_profile_v2", second)).body[0].revision, 1);
    const operation = crypto.randomUUID();
    const undone = await rpc(a, "undo_explicit_memory_create_v1", undo(second, operation));
    assert.equal(undone.status, 200, JSON.stringify(undone.body));
    assert.deepEqual(undone.body[0], { memory_id: second.p_memory_id, state: "deleted", reused: false, revision: 2 });
    const duplicate = await rpc(a, "undo_explicit_memory_create_v1", undo(second, operation));
    assert.deepEqual(duplicate.body[0], { ...undone.body[0], reused: true });
    assert.equal((await rpc(a, "undo_explicit_memory_create_v1", undo(second))).body.message, "MEMORY_CONFLICT");
    assert.equal((await rpc(a, "undo_explicit_memory_create_v1", undo(first, operation))).body.message, "MEMORY_OPERATION_REUSE");
    const bConsent = await rpc(b, "create_memory_retrieval_consent", {});
    assert.equal(bConsent.status, 200);
    const bMemory = { ...newInput(), p_consent_id: bConsent.body[0].consent_id };
    assert.equal((await rpc(b, "create_explicit_memory_profile_v2", bMemory)).status, 200);
    assert.equal((await rpc(b, "undo_explicit_memory_create_v1", undo(bMemory, operation))).body.message, "FORBIDDEN");
    assert.deepEqual((await request(`/rest/v1/memory_profiles?id=eq.${second.p_memory_id}&select=state,revision,summary`, a.headers)).body,
      [{ state: "deleted", revision: 2, summary: null }]);
    assert.deepEqual((await request(`/rest/v1/memory_receipts?id=eq.${operation}&select=event_state,memory_id`, a.headers)).body,
      [{ event_state: "deleted", memory_id: second.p_memory_id }]);

    const third = newInput();
    assert.equal((await rpc(a, "create_explicit_memory_profile_v2", third)).body[0].revision, 1);
    const faultOperation = crypto.randomUUID();
    db("create function memory_private.test_undo_fault_v1() returns trigger language plpgsql as $$begin raise exception 'synthetic undo failure';end$$;create trigger test_memory_undo_fault after update on public.memory_profiles for each row execute function memory_private.test_undo_fault_v1();");
    try {
      const failed = await rpc(a, "undo_explicit_memory_create_v1", undo(third, faultOperation));
      assert.equal(failed.status, 400);
      assert.equal(failed.body.message, "synthetic undo failure");
      assert.deepEqual((await request(`/rest/v1/memory_profiles?id=eq.${third.p_memory_id}&select=state,revision,summary`, a.headers)).body,
        [{ state: "explicit", revision: 1, summary: third.p_summary }]);
      assert.deepEqual((await request(`/rest/v1/memory_receipts?id=eq.${faultOperation}&select=id`, a.headers)).body, []);
    } finally {
      db("drop trigger test_memory_undo_fault on public.memory_profiles;drop function memory_private.test_undo_fault_v1();");
    }
  } finally {
    for (const id of users) await fetch(`${env.API_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
  }
});
