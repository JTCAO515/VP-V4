import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function localEnv() {
  try {
    const raw = execFileSync("supabase", ["status", "--workdir", ".", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Object.fromEntries(raw.trim().split("\n").map((line) => {
      const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).replace(/^\"|\"$/g, "")];
    }));
  } catch { return null; }
}

test("V4-10 rollback confirms a prior snapshot as a new append-only version", async (t) => {
  const env = localEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");
  const password = "Probe-password-123!";
  const suffix = crypto.randomUUID();
  const email = `v4-10-owner-${suffix}@local.test`;
  const otherEmail = `v4-10-other-${suffix}@local.test`;
  const userIds = [];
  const request = async (path, init = {}) => {
    const response = await fetch(`${env.API_URL}${path}`, init); return { response, body: await response.text() };
  };
  try {
    const createdUser = await request("/auth/v1/admin/users", { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
    const ownerId = JSON.parse(createdUser.body).id;
    userIds.push(ownerId);
    const otherUser = await request("/auth/v1/admin/users", { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email: otherEmail, password, email_confirm: true }) });
    const otherId = JSON.parse(otherUser.body).id;
    userIds.push(otherId);
    const signedIn = await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    const token = JSON.parse(signedIn.body).access_token;
    const otherSignedIn = await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: otherEmail, password }) });
    const otherToken = JSON.parse(otherSignedIn.body).access_token;
    const headers = (value) => ({ apikey: env.ANON_KEY, Authorization: `Bearer ${value}`, "content-type": "application/json", Prefer: "return=representation" });
    const ownerHeaders = headers(token);
    const otherHeaders = headers(otherToken);
    const trip = JSON.parse((await request("/rest/v1/trips", { method: "POST", headers: ownerHeaders, body: JSON.stringify([{ owner_id: ownerId, title: "Before" }]) })).body)[0];
    for (const [revision, title] of [[1, "After"], [2, "Latest"]]) {
      const proposal = JSON.parse((await request("/rest/v1/trip_proposals", { method: "POST", headers: ownerHeaders, body: JSON.stringify([{ owner_id: ownerId, trip_id: trip.id, revision, base_trip_version: revision - 1, status: "pending", patch: { title }, expires_at: "2099-01-01T00:00:00Z" }]) })).body)[0];
      const confirmed = await request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ p_proposal_id: proposal.id, p_idempotency_key: `confirm-${revision}`, p_digest: `digest-${revision}` }) });
      assert.equal(JSON.parse(confirmed.body)[0].outcome, "applied", confirmed.body);
    }
    const deniedRollback = await request("/rest/v1/rpc/create_trip_rollback_proposal", { method: "POST", headers: otherHeaders, body: JSON.stringify({ p_trip_id: trip.id, p_target_version: 0 }) });
    assert.notEqual(deniedRollback.response.status, 200, deniedRollback.body);
    assert.deepEqual(JSON.parse((await request(`/rest/v1/trip_version_snapshots?trip_id=eq.${trip.id}&select=version`, { headers: otherHeaders })).body), []);
    assert.deepEqual(JSON.parse((await request(`/rest/v1/trip_events?trip_id=eq.${trip.id}&select=resulting_version`, { headers: otherHeaders })).body), []);
    const rollback = await request("/rest/v1/rpc/create_trip_rollback_proposal", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ p_trip_id: trip.id, p_target_version: 0 }) });
    assert.equal(rollback.response.status, 200, rollback.body);
    const rollbackProposal = JSON.parse(rollback.body)[0];
    const deniedConfirm = await request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers: otherHeaders, body: JSON.stringify({ p_proposal_id: rollbackProposal.proposal_id, p_idempotency_key: "other-user-key", p_digest: "rollback-v0-to-v2" }) });
    assert.notEqual(JSON.parse(deniedConfirm.body)[0].outcome, "applied", deniedConfirm.body);
    const beforeOwnerConfirm = JSON.parse((await request(`/rest/v1/trips?id=eq.${trip.id}&select=title,head_version`, { headers: ownerHeaders })).body)[0];
    assert.deepEqual(beforeOwnerConfirm, { title: "Latest", head_version: 2 });
    const confirmRollback = await request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ p_proposal_id: rollbackProposal.proposal_id, p_idempotency_key: "rollback-confirm", p_digest: "rollback-v0-to-v2" }) });
    assert.deepEqual(JSON.parse(confirmRollback.body)[0], { outcome: "applied", resulting_version: 3 });
    const current = JSON.parse((await request(`/rest/v1/trips?id=eq.${trip.id}&select=title,head_version`, { headers: ownerHeaders })).body)[0];
    assert.deepEqual(current, { title: "Before", head_version: 3 });
    const events = JSON.parse((await request(`/rest/v1/trip_events?trip_id=eq.${trip.id}&select=resulting_version&order=resulting_version`, { headers: ownerHeaders })).body);
    assert.deepEqual(events.map((event) => event.resulting_version), [1, 2, 3]);
    const snapshots = JSON.parse((await request(`/rest/v1/trip_version_snapshots?trip_id=eq.${trip.id}&select=version,title&order=version`, { headers: ownerHeaders })).body);
    assert.deepEqual(snapshots, [{ version: 0, title: "Before" }, { version: 1, title: "After" }, { version: 2, title: "Latest" }, { version: 3, title: "Before" }]);
  } finally {
    for (const id of userIds) await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
  }
});
