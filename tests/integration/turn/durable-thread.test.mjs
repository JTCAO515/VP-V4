import assert from "node:assert/strict";
import test from "node:test";
import { identityLocalEnv } from "../identity/local-supabase.mjs";
import { createHmac } from "node:crypto";


test("V4-08 persists owner-scoped thread replay and terminal cancellation", async (t) => {
  const env = identityLocalEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("explicit disposable identity Supabase target is not configured");
  const password = "V4-08-probe-password-123!";
  const makeUser = async () => {
    const email = `v408-${crypto.randomUUID()}@local.test`;
    const response = await fetch(`${env.API_URL}/auth/v1/admin/users`, {
      method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    assert.equal(response.status, 200);
    const user = await response.json();
    const login = await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    return { id: user.id, token: (await login.json()).access_token };
  };
  const owner = await makeUser();
  const stranger = await makeUser();
  const headers = (token) => ({ apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "return=representation" });
  const request = (path, token, init = {}) => fetch(`${env.API_URL}${path}`, { ...init, headers: { ...headers(token), ...(init.headers ?? {}) } });
  try {
    const threadResponse = await request("/rest/v1/chat_threads", owner.token, { method: "POST", body: JSON.stringify([{ owner_id: owner.id }]) });
    const thread = (await threadResponse.json())[0];
    const turnId = crypto.randomUUID();
    const start = (digest) => request("/rest/v1/rpc/start_chat_turn", owner.token, { method: "POST", body: JSON.stringify({ p_thread_id: thread.id, p_turn_id: turnId, p_idempotency_key: "11111111-1111-4111-8111-111111111111", p_digest: digest }) });

    const strangerStart = await request("/rest/v1/rpc/start_chat_turn", stranger.token, { method: "POST", body: JSON.stringify({ p_thread_id: thread.id, p_turn_id: crypto.randomUUID(), p_idempotency_key: crypto.randomUUID(), p_digest: "chat-state-control-v1" }) });
    assert.equal(strangerStart.status, 400);
    assert.equal((await strangerStart.json()).message, "FORBIDDEN");
    const anonymousStart = await fetch(`${env.API_URL}/rest/v1/rpc/start_chat_turn`, { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ p_thread_id: thread.id, p_turn_id: crypto.randomUUID(), p_idempotency_key: crypto.randomUUID(), p_digest: "chat-state-control-v1" }) });
    assert.equal(anonymousStart.status, 401);
    assert.deepEqual(await (await start("chat-state-control-v1")).json(), [{ turn_id: turnId, reused: false }]);
    assert.deepEqual(await (await start("chat-state-control-v1")).json(), [{ turn_id: turnId, reused: true }]);
    assert.equal((await start("digest-b")).status, 400);
    assert.notEqual((await request("/rest/v1/rpc/append_chat_turn_event", owner.token, { method: "POST", body: JSON.stringify({ p_turn_id: turnId, p_event_id: "raw prompt must not persist", p_event_type: "answer", p_state: "generating" }) })).status, 200);
    // Local-only trusted writer fixture: ordinary owner tokens never gain EXECUTE.
    assert.ok(env.JWT_SECRET, "local JWT signing input is required for the service actor fixture");
    const unsigned = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ role: "service_role", sub: owner.id, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 120 })).toString("base64url")].join(".");
    const serviceActor = `${unsigned}.${createHmac("sha256", env.JWT_SECRET).update(unsigned).digest("base64url")}`;
    const append = (state) => request("/rest/v1/rpc/append_chat_turn_event", serviceActor, { method: "POST", body: JSON.stringify({ p_turn_id: turnId, p_event_id: state, p_event_type: "phase", p_state: state }) });
    const planned = await append("planning");
    assert.equal(planned.status, 200);
    assert.deepEqual(await planned.json(), [{ sequence: 2, state: "planning" }]);
    const cancel = () => request("/rest/v1/rpc/cancel_chat_turn", owner.token, { method: "POST", body: JSON.stringify({ p_turn_id: turnId }) });
    const cancelled = await cancel();
    assert.equal(cancelled.status, 200);
    assert.deepEqual(await cancelled.json(), [{ sequence: 3, state: "cancelled" }]);
    assert.deepEqual(await (await cancel()).json(), [{ sequence: 3, state: "cancelled" }]);
    const ownerAppend = await request("/rest/v1/rpc/append_chat_turn_event", owner.token, { method: "POST", body: JSON.stringify({ p_turn_id: turnId, p_event_id: "late", p_event_type: "phase", p_state: "generating" }) });
    assert.equal(ownerAppend.status, 403);
    assert.equal((await ownerAppend.json()).code, "42501");
    const lateServiceAppend = await append("generating");
    assert.equal(lateServiceAppend.status, 400);
    assert.equal((await lateServiceAppend.json()).message, "terminal turn cannot emit events");
    const events = await (await request(`/rest/v1/chat_turn_events?turn_id=eq.${turnId}&select=sequence,state&order=sequence.asc`, owner.token)).json();
    assert.deepEqual(events, [{ sequence: 1, state: "accepted" }, { sequence: 2, state: "planning" }, { sequence: 3, state: "cancelled" }]);
    assert.deepEqual(await (await request(`/rest/v1/chat_turn_events?turn_id=eq.${turnId}&select=id`, stranger.token)).json(), []);
  } finally {
    for (const user of [owner, stranger]) {
      await fetch(`${env.API_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
    }
  }
});
