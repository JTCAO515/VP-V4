import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function localEnv() {
  try {
    const raw = execFileSync("supabase", ["status", "--workdir", ".", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Object.fromEntries(raw.trim().split("\n").map((line) => {
      const separator = line.indexOf("=");
      let value = line.slice(separator + 1);
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      return [line.slice(0, separator), value];
    }));
  } catch {
    return null;
  }
}

test("V4-08 persists owner-scoped thread replay and terminal cancellation", async (t) => {
  const env = localEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");
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

    assert.deepEqual(await (await start("chat-state-control-v1")).json(), [{ turn_id: turnId, reused: false }]);
    assert.deepEqual(await (await start("chat-state-control-v1")).json(), [{ turn_id: turnId, reused: true }]);
    assert.equal((await start("digest-b")).status, 400);
    assert.notEqual((await request("/rest/v1/rpc/append_chat_turn_event", owner.token, { method: "POST", body: JSON.stringify({ p_turn_id: turnId, p_event_id: "raw prompt must not persist", p_event_type: "answer", p_state: "generating" }) })).status, 200);
    assert.equal((await request("/rest/v1/rpc/cancel_chat_turn", owner.token, { method: "POST", body: JSON.stringify({ p_turn_id: turnId }) })).status, 200);
    assert.equal((await request("/rest/v1/rpc/append_chat_turn_event", owner.token, { method: "POST", body: JSON.stringify({ p_turn_id: turnId, p_event_id: "late", p_event_type: "phase", p_state: "generating" }) })).status, 400);
    const events = await (await request(`/rest/v1/chat_turn_events?turn_id=eq.${turnId}&select=sequence,state&order=sequence.asc`, owner.token)).json();
    assert.deepEqual(events, [{ sequence: 1, state: "accepted" }, { sequence: 2, state: "cancelled" }]);
    assert.deepEqual(await (await request(`/rest/v1/chat_turn_events?turn_id=eq.${turnId}&select=id`, stranger.token)).json(), []);
  } finally {
    for (const user of [owner, stranger]) {
      await fetch(`${env.API_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
    }
  }
});
