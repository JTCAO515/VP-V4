import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function localEnv() {
  try {
    const raw = execFileSync("supabase", ["status", "--workdir", ".", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Object.fromEntries(raw.trim().split("\n").map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, "")];
    }));
  } catch { return null; }
}

test("AI-13a pending proposal rows remain owner-scoped in local RLS", async (t) => {
  const env = localEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");
  const password = "Probe-password-123!";
  const suffix = crypto.randomUUID();
  const users = [];
  const request = async (path, init = {}) => {
    const response = await fetch(`${env.API_URL}${path}`, init);
    return { response, body: await response.text() };
  };
  const createUser = async (email) => {
    const result = await request("/auth/v1/admin/users", { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
    assert.equal(result.response.status, 200);
    const user = JSON.parse(result.body); users.push(user.id); return user;
  };
  const login = async (email) => {
    const result = await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    assert.equal(result.response.status, 200); return JSON.parse(result.body).access_token;
  };
  try {
    const owner = await createUser(`ai13a-owner-${suffix}@local.test`);
    const other = await createUser(`ai13a-other-${suffix}@local.test`);
    const ownerToken = await login(owner.email);
    const otherToken = await login(other.email);
    const headers = (token) => ({ apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "return=representation" });
    const tripResult = await request("/rest/v1/trips", { method: "POST", headers: headers(ownerToken), body: JSON.stringify([{ owner_id: owner.id, title: "Before" }]) });
    const trip = JSON.parse(tripResult.body)[0];
    const proposalResult = await request("/rest/v1/trip_proposals", { method: "POST", headers: headers(ownerToken), body: JSON.stringify([{ owner_id: owner.id, trip_id: trip.id, revision: 1, base_trip_version: 0, status: "pending", patch: { title: "After" }, expires_at: "2099-01-01T00:00:00Z" }]) });
    const proposal = JSON.parse(proposalResult.body)[0];
    const ownerRead = await request(`/rest/v1/trip_proposals?select=id,revision,status,patch&trip_id=eq.${trip.id}&status=eq.pending`, { headers: headers(ownerToken) });
    assert.deepEqual(JSON.parse(ownerRead.body), [{ id: proposal.id, revision: 1, status: "pending", patch: { title: "After" } }]);
    const otherRead = await request(`/rest/v1/trip_proposals?select=id&trip_id=eq.${trip.id}&status=eq.pending`, { headers: headers(otherToken) });
    assert.deepEqual(JSON.parse(otherRead.body), []);
  } finally {
    for (const id of users) await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
  }
});
