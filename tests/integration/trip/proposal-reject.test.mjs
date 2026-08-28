import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function localEnv() {
  try {
    const raw = execFileSync("supabase", ["status", "--workdir", ".", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Object.fromEntries(raw.trim().split("\n").map((line) => {
      const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    }));
  } catch { return null; }
}

test("AI-13c lets only the owner reject one pending Proposal", async (t) => {
  const env = localEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");
  const password = "Probe-password-123!";
  const users = [];
  const request = async (path, init = {}) => {
    const response = await fetch(`${env.API_URL}${path}`, init); return { response, body: await response.text() };
  };
  const createUser = async (email) => {
    const result = await request("/auth/v1/admin/users", { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
    assert.equal(result.response.status, 200); const user = JSON.parse(result.body); users.push(user.id); return user;
  };
  const token = async (email) => {
    const result = await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    assert.equal(result.response.status, 200); return JSON.parse(result.body).access_token;
  };
  try {
    const suffix = crypto.randomUUID();
    const owner = await createUser(`ai13c-owner-${suffix}@local.test`);
    const other = await createUser(`ai13c-other-${suffix}@local.test`);
    const ownerToken = await token(owner.email);
    const otherToken = await token(other.email);
    const headers = (value) => ({ apikey: env.ANON_KEY, Authorization: `Bearer ${value}`, "content-type": "application/json", Prefer: "return=representation" });
    const trip = JSON.parse((await request("/rest/v1/trips", { method: "POST", headers: headers(ownerToken), body: JSON.stringify([{ owner_id: owner.id, title: "Before" }]) })).body)[0];
    const proposal = JSON.parse((await request("/rest/v1/trip_proposals", { method: "POST", headers: headers(ownerToken), body: JSON.stringify([{ owner_id: owner.id, trip_id: trip.id, revision: 1, base_trip_version: 0, status: "pending", patch: { title: "Reject me" }, expires_at: "2099-01-01T00:00:00Z" }]) })).body)[0];
    const reject = (auth) => request(`/rest/v1/trip_proposals?id=eq.${proposal.id}&trip_id=eq.${trip.id}&status=eq.pending`, { method: "PATCH", headers: headers(auth), body: JSON.stringify({ status: "rejected" }) });
    assert.deepEqual(JSON.parse((await reject(otherToken)).body), []);
    assert.deepEqual(JSON.parse((await reject(ownerToken)).body), [{ ...proposal, status: "rejected" }]);
    assert.deepEqual(JSON.parse((await reject(ownerToken)).body), []);
    const pending = await request(`/rest/v1/trip_proposals?id=eq.${proposal.id}&status=eq.pending&select=id`, { headers: headers(ownerToken) });
    assert.deepEqual(JSON.parse(pending.body), []);
  } finally {
    for (const id of users) await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
  }
});
