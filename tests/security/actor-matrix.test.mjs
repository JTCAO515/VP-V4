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

test("AI-14 owner RLS and fault rollback hold on a running local Supabase", async (t) => {
  const env = localEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("local Supabase is not running");

  const users = [];
  const password = "Probe-password-123!";
  const tag = `ai14-${crypto.randomUUID()}`;
  const request = async (path, init = {}) => {
    const response = await fetch(`${env.API_URL}${path}`, init);
    return { response, body: await response.text() };
  };
  const createUser = async (email) => {
    const { response, body } = await request("/auth/v1/admin/users", {
      method: "POST",
      headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    assert.equal(response.status, 200);
    const id = JSON.parse(body).id;
    users.push(id);
    return { id, email };
  };
  const login = async (email) => {
    const { response, body } = await request("/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: env.ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    return JSON.parse(body).access_token;
  };

  try {
    const owner = await createUser(`owner-${tag}@local.test`);
    const other = await createUser(`other-${tag}@local.test`);
    const ownerToken = await login(owner.email);
    const otherToken = await login(other.email);
    const created = await request("/rest/v1/trips", {
      method: "POST", headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${ownerToken}`, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify([{ owner_id: owner.id, title: "AI-14 RLS probe" }]),
    });
    assert.equal(created.response.status, 201);
    const tripId = JSON.parse(created.body)[0].id;
    const otherRead = await request("/rest/v1/trips?select=id", { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${otherToken}` } });
    assert.deepEqual(JSON.parse(otherRead.body), []);
    const otherUpdate = await request(`/rest/v1/trips?id=eq.${tripId}`, {
      method: "PATCH", headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${otherToken}`, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ title: "illegal" }),
    });
    assert.deepEqual(JSON.parse(otherUpdate.body), []);
    const anonRead = await request("/rest/v1/trips?select=id", { headers: { apikey: env.ANON_KEY } });
    assert.equal(anonRead.response.status, 401);
    assert.throws(() => execFileSync("docker", ["exec", "supabase_db_vp-v4-ai-08", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `set role service_role; select private.ai14_fault_probe('${owner.id}'::uuid, true);`], { stdio: "pipe" }), /AI14_FAULT_PROBE/);
    const rollbackRows = execFileSync("docker", ["exec", "supabase_db_vp-v4-ai-08", "psql", "-U", "postgres", "-d", "postgres", "-Atqc", "select count(*) from public.trips where title = 'AI-14 fault probe';"], { encoding: "utf8" }).trim();
    assert.equal(rollbackRows, "0");
  } finally {
    for (const id of users) await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
  }
});
