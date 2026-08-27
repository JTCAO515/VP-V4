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

test("AI-13b replaces a pending owner proposal with an immutable child revision", async (t) => {
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
    const owner = await createUser(`ai13b-owner-${suffix}@local.test`);
    const other = await createUser(`ai13b-other-${suffix}@local.test`);
    const ownerToken = await token(owner.email);
    const otherToken = await token(other.email);
    const headers = (value) => ({ apikey: env.ANON_KEY, Authorization: `Bearer ${value}`, "content-type": "application/json", Prefer: "return=representation" });
    const trip = JSON.parse((await request("/rest/v1/trips", { method: "POST", headers: headers(ownerToken), body: JSON.stringify([{ owner_id: owner.id, title: "Before" }]) })).body)[0];
    const parent = JSON.parse((await request("/rest/v1/trip_proposals", { method: "POST", headers: headers(ownerToken), body: JSON.stringify([{ owner_id: owner.id, trip_id: trip.id, revision: 1, base_trip_version: 0, status: "pending", patch: { title: "Parent" }, expires_at: "2099-01-01T00:00:00Z" }]) })).body)[0];
    const revise = async (auth, proposalId, title) => request("/rest/v1/rpc/revise_trip_proposal", { method: "POST", headers: headers(auth), body: JSON.stringify({ p_proposal_id: proposalId, p_title: title }) });
    const reviseResult = await revise(ownerToken, parent.id, "Child");
    assert.equal(reviseResult.response.status, 200, reviseResult.body);
    const revised = JSON.parse(reviseResult.body)[0];
    assert.equal(revised.outcome, "revised");
    const rows = JSON.parse((await request(`/rest/v1/trip_proposals?select=id,status,parent_proposal_id,revision,patch&id=in.(${parent.id},${revised.proposal_id})`, { headers: headers(ownerToken) })).body);
    const parentRow = rows.find((row) => row.id === parent.id);
    const childRow = rows.find((row) => row.id === revised.proposal_id);
    assert.deepEqual(parentRow, { id: parent.id, status: "superseded", parent_proposal_id: null, revision: 1, patch: { title: "Parent" } });
    assert.deepEqual(childRow, { id: revised.proposal_id, status: "pending", parent_proposal_id: parent.id, revision: 2, patch: { title: "Child" } });
    assert.equal(JSON.parse((await revise(otherToken, revised.proposal_id, "Illegal")).body)[0].outcome, "proposal_not_confirmable");
    const confirm = await request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers: headers(ownerToken), body: JSON.stringify({ p_proposal_id: revised.proposal_id, p_idempotency_key: "revision-probe", p_digest: "revision-digest" }) });
    assert.equal(JSON.parse(confirm.body)[0].outcome, "applied");
    const current = JSON.parse((await request(`/rest/v1/trips?id=eq.${trip.id}&select=title,head_version`, { headers: headers(ownerToken) })).body)[0];
    assert.deepEqual(current, { title: "Child", head_version: 1 });
  } finally {
    for (const id of users) await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
  }
});
