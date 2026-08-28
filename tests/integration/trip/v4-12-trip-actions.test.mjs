import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function localEnv() { try { const raw = execFileSync("supabase", ["status", "--workdir", ".", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); return Object.fromEntries(raw.trim().split("\n").map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^\"|\"$/g, "")]; })); } catch { return null; } }

test("V4-12 exposes only owner action references and rejects user writes", async (t) => {
  const env = localEnv(); if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");
  const suffix = crypto.randomUUID(); const password = "Probe-password-123!"; const ids = [];
  const request = async (path, init = {}) => { const response = await fetch(`${env.API_URL}${path}`, init); return { response, body: await response.text() }; };
  const admin = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
  try {
    const create = async (email) => { const result = await request("/auth/v1/admin/users", { method: "POST", headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) }); const user = JSON.parse(result.body); ids.push(user.id); return user; };
    const owner = await create(`v4-12-owner-${suffix}@local.test`); const other = await create(`v4-12-other-${suffix}@local.test`);
    const login = async (email) => JSON.parse((await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).body).access_token;
    const headers = (token) => ({ apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "return=representation" }); const ownerHeaders = headers(await login(owner.email)); const otherHeaders = headers(await login(other.email));
    const trip = JSON.parse((await request("/rest/v1/trips", { method: "POST", headers: ownerHeaders, body: JSON.stringify([{ owner_id: owner.id, title: "Actions" }]) })).body)[0];
    const added = await request("/rest/v1/trip_action_references", { method: "POST", headers: { ...admin, Prefer: "return=representation" }, body: JSON.stringify([{ owner_id: owner.id, trip_id: trip.id, action_kind: "reservation", source_kind: "trip", action_status: "recheck_required", label: "Reserve", external_link_url: "https://official.example/reserve" }]) }); assert.equal(added.response.status, 201, added.body);
    assert.equal(JSON.parse((await request(`/rest/v1/trip_action_references?trip_id=eq.${trip.id}&select=label`, { headers: ownerHeaders })).body)[0].label, "Reserve");
    assert.deepEqual(JSON.parse((await request(`/rest/v1/trip_action_references?trip_id=eq.${trip.id}&select=id`, { headers: otherHeaders })).body), []);
    assert.notEqual((await request("/rest/v1/trip_action_references", { method: "POST", headers: ownerHeaders, body: JSON.stringify([{ owner_id: owner.id, trip_id: trip.id, action_kind: "preparation", source_kind: "trip", action_status: "current", label: "Fake" }]) })).response.status, 201);
  } finally { for (const id of ids) await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin }); }
});
