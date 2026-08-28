import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function localEnv() {
  try {
    const raw = execFileSync("supabase", ["status", "--workdir", ".", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Object.fromEntries(raw.trim().split("\n").map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^\"|\"$/g, "")]; }));
  } catch { return null; }
}

test("V4-11 preserves exact/user place references and rejects cross-owner reads or inserts", async (t) => {
  const env = localEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");
  const suffix = crypto.randomUUID(); const password = "Probe-password-123!"; const ids = []; let canonicalId = null;
  const request = async (path, init = {}) => { const response = await fetch(`${env.API_URL}${path}`, init); return { response, body: await response.text() }; };
  const adminHeaders = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
  try {
    const create = async (email) => { const result = await request("/auth/v1/admin/users", { method: "POST", headers: adminHeaders, body: JSON.stringify({ email, password, email_confirm: true }) }); const user = JSON.parse(result.body); ids.push(user.id); return user; };
    const owner = await create(`v4-11-owner-${suffix}@local.test`); const other = await create(`v4-11-other-${suffix}@local.test`);
    const login = async (email) => JSON.parse((await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).body).access_token;
    const headers = (token) => ({ apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "return=representation" });
    const ownerHeaders = headers(await login(owner.email)); const otherHeaders = headers(await login(other.email));
    const trip = JSON.parse((await request("/rest/v1/trips", { method: "POST", headers: ownerHeaders, body: JSON.stringify([{ owner_id: owner.id, title: "Place scope" }]) })).body)[0];
    canonicalId = crypto.randomUUID();
    const registered = await request("/rest/v1/canonical_pois", { method: "POST", headers: { ...adminHeaders, Prefer: "return=representation" }, body: JSON.stringify([{ id: canonicalId }]) });
    assert.equal(registered.response.status, 201, registered.body);
    const added = await request("/rest/v1/trip_place_references", { method: "POST", headers: { ...adminHeaders, Prefer: "return=representation" }, body: JSON.stringify([{ owner_id: owner.id, trip_id: trip.id, reference_kind: "canonical", canonical_poi_id: canonicalId, freshness: "recheck_required" }, { owner_id: owner.id, trip_id: trip.id, reference_kind: "user", user_label: "My hotel note", freshness: "current" }]) });
    assert.equal(added.response.status, 201, added.body);
    const ownerRows = JSON.parse((await request(`/rest/v1/trip_place_references?trip_id=eq.${trip.id}&select=reference_kind,canonical_poi_id,user_label,freshness&order=reference_kind`, { headers: ownerHeaders })).body);
    assert.deepEqual(ownerRows, [{ reference_kind: "canonical", canonical_poi_id: canonicalId, user_label: null, freshness: "recheck_required" }, { reference_kind: "user", canonical_poi_id: null, user_label: "My hotel note", freshness: "current" }]);
    assert.deepEqual(JSON.parse((await request(`/rest/v1/trip_place_references?trip_id=eq.${trip.id}&select=id`, { headers: otherHeaders })).body), []);
    const deniedInsert = await request("/rest/v1/trip_place_references", { method: "POST", headers: ownerHeaders, body: JSON.stringify([{ owner_id: owner.id, trip_id: trip.id, reference_kind: "canonical", canonical_poi_id: crypto.randomUUID(), freshness: "current" }]) });
    assert.notEqual(deniedInsert.response.status, 201, deniedInsert.body);
  } finally {
    for (const id of ids) await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
    if (canonicalId) await request(`/rest/v1/canonical_pois?id=eq.${canonicalId}`, { method: "DELETE", headers: adminHeaders });
  }
});
