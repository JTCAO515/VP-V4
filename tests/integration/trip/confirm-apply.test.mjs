import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { confirmationDigest } from "./confirmation-input.mjs";
import { identityLocalEnv } from "../identity/local-supabase.mjs";


test("AI-10 confirms exactly one pending proposal in a local RLS transaction", async (t) => {
  const env = identityLocalEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("explicit disposable identity Supabase target is not configured");
  const password = "Probe-password-123!";
  const email = `ai10-${crypto.randomUUID()}@local.test`;
  let ownerId = "";
  let otherId = "";
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
    const receipt = (id, authHeaders = headers) => request("/rest/v1/rpc/read_trip_confirmation_receipt_v1", {
      method: "POST", headers: authHeaders, body: JSON.stringify({ p_proposal_id: id }),
    });
    const capacityCount = () => execFileSync("docker", ["exec", env.DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-c",
      `select count(*) from turn_private.service_task_capacity where owner_id='${ownerId}'::uuid;`], { encoding: "utf8" }).trim();
    assert.equal(capacityCount(), "0", "a manually created Trip proposal has no ServiceTask admission");
    assert.deepEqual(JSON.parse((await receipt(proposal.id)).body), [], "a pending proposal is not a Trip result");
    const call = (digest) => request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers, body: JSON.stringify({ p_proposal_id: proposal.id, p_idempotency_key: "probe-key", p_digest: digest }) });
    const digest = await confirmationDigest(env, headers, proposal.id, "digest-a");
    assert.equal(JSON.parse((await call(digest)).body)[0].outcome, "applied");
    assert.equal(JSON.parse((await call(digest)).body)[0].outcome, "already_applied");
    assert.deepEqual(JSON.parse((await receipt(proposal.id)).body), [{ proposal_id: proposal.id, trip_id: trip.id, resulting_version: 1 }]);
    assert.equal(capacityCount(), "0", "a Trip confirmation receipt cannot settle or create text capacity");
    assert.notEqual((await receipt(proposal.id, { apikey: env.ANON_KEY, "content-type": "application/json" })).response.status, 200, "anonymous cannot read the receipt");
    const otherEmail = `ai10-other-${crypto.randomUUID()}@local.test`;
    result = await request("/auth/v1/admin/users", { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ email: otherEmail, password, email_confirm: true }) });
    assert.equal(result.response.status, 200);
    otherId = JSON.parse(result.body).id;
    result = await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email: otherEmail, password }) });
    assert.equal(result.response.status, 200);
    assert.deepEqual(JSON.parse((await receipt(proposal.id, { ...headers, Authorization: `Bearer ${JSON.parse(result.body).access_token}` })).body), [], "another owner cannot read the result");
    assert.equal((await call("digest-b")).response.status, 400);
    result = await request(`/rest/v1/trips?id=eq.${trip.id}&select=title,head_version`, { headers });
    assert.deepEqual(JSON.parse(result.body)[0], { title: "After", head_version: 1 });
    result = await request("/rest/v1/trip_events?select=id", { headers });
    assert.equal(JSON.parse(result.body).length, 1);
    result = await request("/rest/v1/trip_audit_events?select=id", { headers });
    assert.equal(JSON.parse(result.body).length, 1);
    result = await request("/rest/v1/trip_proposals", { method: "POST", headers,
      body: JSON.stringify([{ owner_id: ownerId, trip_id: trip.id, revision: 2, base_trip_version: 1, status: "pending", patch: { title: "Later" }, expires_at: "2099-01-01T00:00:00Z" }]),
    });
    const later = JSON.parse(result.body)[0];
    assert.deepEqual(JSON.parse((await receipt(later.id)).body), [], "a displayed proposal is not a result");
    result = await request("/rest/v1/rpc/reject_trip_proposal_v2", { method: "POST", headers, body: JSON.stringify({ p_proposal_id: later.id }) });
    assert.equal(JSON.parse(result.body)[0].status, "rejected");
    assert.deepEqual(JSON.parse((await receipt(later.id)).body), [], "rejection cannot become a result");
    result = await request("/rest/v1/trip_proposals", { method: "POST", headers,
      body: JSON.stringify([{ owner_id: ownerId, trip_id: trip.id, revision: 3, base_trip_version: 1, status: "pending", patch: { title: "Expired" }, expires_at: "2020-01-01T00:00:00Z" }]),
    });
    const expired = JSON.parse(result.body)[0];
    const expiredDigest = await confirmationDigest(env, headers, expired.id, "digest-expired");
    result = await request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers,
      body: JSON.stringify({ p_proposal_id: expired.id, p_idempotency_key: "probe-key-expired", p_digest: expiredDigest }) });
    assert.equal(JSON.parse(result.body)[0].outcome, "proposal_expired");
    assert.deepEqual(JSON.parse((await receipt(expired.id)).body), [], "expired proposals cannot become results");
    result = await request("/rest/v1/trip_proposals", { method: "POST", headers,
      body: JSON.stringify([{ owner_id: ownerId, trip_id: trip.id, revision: 4, base_trip_version: 1, status: "pending", patch: { title: "Newer" }, expires_at: "2099-01-01T00:00:00Z" }]),
    });
    const newer = JSON.parse(result.body)[0];
    const newerDigest = await confirmationDigest(env, headers, newer.id, "digest-c");
    result = await request("/rest/v1/rpc/confirm_and_apply_trip_proposal", { method: "POST", headers,
      body: JSON.stringify({ p_proposal_id: newer.id, p_idempotency_key: "probe-key-newer", p_digest: newerDigest }) });
    assert.equal(JSON.parse(result.body)[0].outcome, "applied");
    assert.deepEqual(JSON.parse((await receipt(proposal.id)).body), [], "a superseded Trip head is not the current result");
    assert.deepEqual(JSON.parse((await receipt(newer.id)).body), [{ proposal_id: newer.id, trip_id: trip.id, resulting_version: 2 }]);
    assert.equal(capacityCount(), "0", "a newer manual confirmation remains unmetered");
  } finally {
    if (ownerId) execFileSync("docker", ["exec", env.DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-c", `delete from public.trips where owner_id = '${ownerId}'::uuid;`], { stdio: "ignore" });
    if (ownerId) await request(`/auth/v1/admin/users/${ownerId}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
    if (otherId) await request(`/auth/v1/admin/users/${otherId}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
  }
});
