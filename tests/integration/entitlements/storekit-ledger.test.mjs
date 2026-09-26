import assert from "node:assert/strict";
import test from "node:test";
import { identityLocalEnv } from "../identity/local-supabase.mjs";

test("verified-input ledger serializes grants, isolates owners and preserves erased transaction tombstones", async (t) => {
  const env = identityLocalEnv();
  if (!env?.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return t.skip("explicit disposable Supabase target is not configured");
  const users = [];
  const password = "Local-ledger-probe-123!";
  const admin = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
  const request = async (path, headers, body) => {
    const response = await fetch(`${env.API_URL}${path}`, { headers, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const create = async () => {
    const email = `pass-${crypto.randomUUID()}@local.test`;
    const user = await request("/auth/v1/admin/users", admin, { email, password, email_confirm: true });
    assert.equal(user.status, 200, JSON.stringify(user.body));
    users.push(user.body.id);
    const login = await request("/auth/v1/token?grant_type=password", { apikey: env.ANON_KEY, "content-type": "application/json" }, { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { id: user.body.id, headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${login.body.access_token}`, "content-type": "application/json" } };
  };
  try {
    const owner = await create();
    const other = await create();
    const base = { environment: "Sandbox", transactionId: "200000000000001", ownerId: owner.id,
      appAccountToken: owner.id, productId: "local.fixture.pass", purchaseAt: new Date(Date.now() - 60000).toISOString(),
      catalogVersion: 2, policyVersion: "service-task-development/1", capacitySnapshot: { period: { hours: 720, quantity: 80 } } };
    assert.notEqual((await request("/rest/v1/storekit_grants", admin, { transaction_id: "forged" })).status, 201,
      "service key cannot bypass verified-input RPC with direct table INSERT");
    const apply = (input, headers = admin) => request("/rest/v1/rpc/storekit_apply_verified_v1", headers, { p_input: input });
    assert.notEqual((await apply(base, owner.headers)).status, 200, "authenticated client may not forge decoded Apple claims");
    const first = await apply(base);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.state, "active");
    assert.equal(first.body.replayed, false);
    assert.equal(Date.parse(first.body.endsAt) - Date.parse(first.body.startsAt), 720 * 3600000);
    const replay = await apply({ ...base, catalogVersion: 3, capacitySnapshot: { period: { hours: 720, quantity: 100 } } });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.startsAt, first.body.startsAt);
    assert.notEqual((await apply({ ...base, ownerId: other.id, appAccountToken: other.id })).status, 200);
    const second = await apply({ ...base, transactionId: "200000000000002", purchaseAt: new Date(Date.now() - 30000).toISOString() });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.startsAt, first.body.endsAt);
    const concurrent = await Promise.all(["200000000000003", "200000000000004"].map(transactionId =>
      apply({ ...base, transactionId, purchaseAt: new Date(Date.now() - 10000).toISOString() })));
    for (const item of concurrent) assert.equal(item.status, 200, JSON.stringify(item.body));
    const intervals = concurrent.map(item => item.body).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    assert.equal(intervals[0].startsAt, second.body.endsAt);
    assert.equal(intervals[1].startsAt, intervals[0].endsAt);
    const select = (headers) => request("/rest/v1/storekit_grants?select=transaction_id,capacity_snapshot,state,starts_at,ends_at&order=starts_at.asc", headers);
    assert.equal((await select(owner.headers)).body.length, 4);
    assert.deepEqual((await select(other.headers)).body, []);
    assert.notEqual((await select({ apikey: env.ANON_KEY })).status, 200, "anonymous callers cannot read grants");
    const revoked = await apply({ ...base, revokedAt: new Date().toISOString() });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    assert.equal(revoked.body.state, "revoked");
    assert.equal((await select(owner.headers)).body[0].state, "revoked");
    const exported = await request("/rest/v1/rpc/storekit_export_owner_v1", admin, { p_owner: owner.id });
    assert.equal(exported.status, 200, JSON.stringify(exported.body));
    assert.equal(exported.body.length, 4);
    const erased = await request("/rest/v1/rpc/storekit_erase_owner_v1", admin, { p_owner: owner.id });
    assert.equal(erased.status, 200, JSON.stringify(erased.body));
    assert.equal(erased.body, 4);
    assert.deepEqual((await select(owner.headers)).body, []);
    assert.notEqual((await apply(base)).status, 200, "erased transaction must never grant again");
  } finally {
    for (const id of users) await fetch(`${env.API_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
  }
});
