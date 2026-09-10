import assert from "node:assert/strict";
import { identityLocalEnv } from "./local-supabase.mjs";
import test from "node:test";


test("profile upsert and privacy request replay preserve owner isolation without executing deletion", async (t) => {
  const env = identityLocalEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("explicit disposable identity Supabase target is not configured");
  const users = [];
  const password = "Local-RPC-probe-123!";
  const adminHeaders = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
  const request = async (path, headers, body) => {
    const response = await fetch(`${env.API_URL}${path}`, { headers, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const create = async () => {
    const email = `rpc-${crypto.randomUUID()}@local.test`;
    const user = await request("/auth/v1/admin/users", adminHeaders, { email, password, email_confirm: true });
    assert.equal(user.status, 200); users.push(user.body.id);
    const login = await request("/auth/v1/token?grant_type=password", { apikey: env.ANON_KEY, "content-type": "application/json" }, { email, password });
    assert.equal(login.status, 200);
    return { id: user.body.id, headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${login.body.access_token}`, "content-type": "application/json" } };
  };
  try {
    const owner = await create(); const other = await create();
    const anonymous = { apikey: env.ANON_KEY, "content-type": "application/json" };
    const profile = { p_display_name: "Local fixture", p_travel_pace: "balanced", p_locale: "en", p_currency: "CNY", p_distance_unit: "kilometre", p_temperature_unit: "celsius", p_default_departure_time: "09:00:00" };
    assert.equal((await request("/rest/v1/rpc/save_user_profile", anonymous, profile)).status, 401);
    const saved = await request("/rest/v1/rpc/save_user_profile", owner.headers, profile);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body[0].owner_id, owner.id);
    const updated = await request("/rest/v1/rpc/save_user_profile", owner.headers, { ...profile, p_currency: "USD" });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body[0].owner_id, owner.id);
    assert.equal((await request("/rest/v1/rpc/save_user_profile", owner.headers, { ...profile, p_locale: "invalid" })).status, 400);
    assert.deepEqual((await request(`/rest/v1/user_profiles?owner_id=eq.${owner.id}&select=owner_id`, other.headers)).body, []);
    const otherSaved = await request("/rest/v1/rpc/save_user_profile", other.headers, { ...profile, p_display_name: "Other fixture" });
    assert.equal(otherSaved.status, 200);
    assert.equal(otherSaved.body[0].owner_id, other.id);

    for (const action of ["export", "delete"]) {
      const payload = { p_request_id: crypto.randomUUID(), p_action: action };
      assert.equal((await request("/rest/v1/rpc/request_privacy_action", anonymous, payload)).status, 401);
      const created = await request("/rest/v1/rpc/request_privacy_action", owner.headers, payload);
      assert.equal(created.status, 200, JSON.stringify(created.body));
      assert.equal(created.body[0].request_id, payload.p_request_id);
      assert.equal(created.body[0].action, action);
      assert.equal(created.body[0].status, "requested");
      assert.equal(created.body[0].execution_state, "not_started");
      assert.equal(created.body[0].reused, false);
      const replay = await request("/rest/v1/rpc/request_privacy_action", owner.headers, payload);
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.body[0], { ...created.body[0], reused: true });
      const foreign = await request("/rest/v1/rpc/request_privacy_action", other.headers, payload);
      assert.equal(foreign.status, 400); assert.equal(foreign.body.message, "FORBIDDEN");
      const mismatch = await request("/rest/v1/rpc/request_privacy_action", owner.headers, { ...payload, p_action: action === "export" ? "delete" : "export" });
      assert.equal(mismatch.status, 400); assert.equal(mismatch.body.message, "PRIVACY_REQUEST_ID_REUSE");
      const receiptsPath = `/rest/v1/privacy_receipts?request_id=eq.${payload.p_request_id}&select=request_id,event_type`;
      assert.deepEqual((await request(receiptsPath, owner.headers)).body, [{ request_id: payload.p_request_id, event_type: "requested" }]);
      assert.deepEqual((await request(receiptsPath, other.headers)).body, []);
      assert.deepEqual((await request(`/rest/v1/privacy_requests?id=eq.${payload.p_request_id}&select=id`, other.headers)).body, []);
    }
    const preserved = await request(`/rest/v1/user_profiles?owner_id=eq.${owner.id}&select=display_name,currency`, owner.headers);
    assert.deepEqual(preserved.body, [{ display_name: "Local fixture", currency: "USD" }]);
  } finally {
    for (const id of users) await fetch(`${env.API_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
  }
});
