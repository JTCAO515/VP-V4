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

test("AI-10 confirms exactly one pending proposal in a local RLS transaction", async (t) => {
  const env = localEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");
  const password = "Probe-password-123!";
  const email = `ai10-${crypto.randomUUID()}@local.test`;
  let ownerId = "";
  const request = async (path, init = {}) => {
    const response = await fetch(`${env.API_URL}${path}`, init);
    return { response, body: await response.text() };
  };
  try {
    let result = await request("/auth/v1/admin/users", {
      method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    assert.equal(result.response.status, 200);
    ownerId = JSON.parse(result.body).id;
    result = await request("/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    const token = JSON.parse(result.body).access_token;
    const headers = { apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "return=representation" };
    result = await request("/rest/v1/trips", { method: "POST", headers, body: JSON.stringify([{ owner_id: ownerId, title: "Before" }]) });
    const trip = JSON.parse(result.body)[0];
    result = await request("/rest/v1/trip_proposals", {
      method: "POST", headers,
      body: JSON.stringify([{ owner_id: ownerId, trip_id: trip.id, revision: 1, base_trip_version: 0, status: "pending", patch: { title: "After" }, expires_at: "2099-01-01T00:00:00Z" }]),
    });
    const proposal = JSON.parse(result.body)[0];
    const call = (digest) => request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers, body: JSON.stringify({ p_proposal_id: proposal.id, p_idempotency_key: "probe-key", p_digest: digest }) });
    assert.equal(JSON.parse((await call("digest-a")).body)[0].outcome, "applied");
    assert.equal(JSON.parse((await call("digest-a")).body)[0].outcome, "already_applied");
    assert.equal((await call("digest-b")).response.status, 400);
    result = await request(`/rest/v1/trips?id=eq.${trip.id}&select=title,head_version`, { headers });
    assert.deepEqual(JSON.parse(result.body)[0], { title: "After", head_version: 1 });
    result = await request("/rest/v1/trip_events?select=id", { headers });
    assert.equal(JSON.parse(result.body).length, 1);
    result = await request("/rest/v1/trip_audit_events?select=id", { headers });
    assert.equal(JSON.parse(result.body).length, 1);
  } finally {
    if (ownerId) execFileSync("docker", ["exec", "supabase_db_vp-v4-ai-08", "psql", "-U", "postgres", "-d", "postgres", "-c", `delete from public.trips where owner_id = '${ownerId}'::uuid;`], { stdio: "ignore" });
    if (ownerId) await request(`/auth/v1/admin/users/${ownerId}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
  }
});
