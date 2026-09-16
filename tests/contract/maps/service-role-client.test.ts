import test from "node:test";
import assert from "node:assert/strict";
import { createMapsServiceRoleClient } from "../../../lib/server/maps/service-role-client.ts";

test("missing URL or key returns null rather than throwing", () => {
  assert.equal(createMapsServiceRoleClient({}), null);
  assert.equal(createMapsServiceRoleClient({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }), null);
  assert.equal(createMapsServiceRoleClient({ SUPABASE_SERVICE_ROLE_KEY: "secret" }), null);
});

test("blank/whitespace-only values are treated as missing", () => {
  assert.equal(
    createMapsServiceRoleClient({ NEXT_PUBLIC_SUPABASE_URL: "   ", SUPABASE_SERVICE_ROLE_KEY: "secret" }),
    null,
  );
  assert.equal(
    createMapsServiceRoleClient({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "" }),
    null,
  );
});

test("a plausible URL and key produce a real client, not null", () => {
  const client = createMapsServiceRoleClient({
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
  });
  assert.notEqual(client, null);
  assert.equal(typeof client!.from, "function");
});

test("an invalid URL is rejected as null rather than throwing out of this factory", () => {
  assert.equal(
    createMapsServiceRoleClient({ NEXT_PUBLIC_SUPABASE_URL: "not a url", SUPABASE_SERVICE_ROLE_KEY: "secret" }),
    null,
  );
});
