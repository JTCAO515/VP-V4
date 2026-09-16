import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROUTES = [
  "app/api/places/search/route.ts",
  "app/api/places/nearby/route.ts",
];

test("#363: app/api/places/** now exists and consumes the real canonical-mapping lookup", () => {
  for (const path of ROUTES) {
    const source = readFileSync(path, "utf8");
    // The real composition, not a hand-written mock -- see
    // lib/server/maps/place-consumer.ts, which is the module that actually
    // calls loadCanonicalMappingLookup.
    assert.match(source, /from "@\/lib\/server\/maps\/place-consumer"/, path);
    assert.match(source, /WithCanonicalMapping\(/, path);
    // The service-role client is only ever obtained through the dedicated
    // factory -- never constructed inline in a route file.
    assert.match(source, /from "@\/lib\/server\/maps\/service-role-client"/, path);
    assert.match(source, /createMapsServiceRoleClient\(/, path);
    // No route file embeds or reads the service-role secret itself.
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE/, path);
    // Every route requires a real session before any provider/DB call.
    assert.match(source, /requireAuthenticatedActor\(/, path);
    assert.match(source, /from "@\/lib\/server\/maps\/web-auth"/, path);
  }
});

test("web-auth.ts never references a service credential (session check only)", () => {
  const source = readFileSync("lib/server/maps/web-auth.ts", "utf8");
  assert.doesNotMatch(source, /SERVICE_ROLE|SUPABASE_SECRET|SUPABASE_SERVICE/i);
  assert.match(source, /getClaims\(/);
});

test("the service-role client factory is the only place reading SUPABASE_SERVICE_ROLE_KEY under lib/server/maps", () => {
  const files = [
    "lib/server/maps/place-consumer.ts",
    "lib/server/maps/web-auth.ts",
    "lib/server/maps/canonical-mapping-repository.ts",
  ];
  for (const path of files) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /SUPABASE_SERVICE_ROLE_KEY/, path);
  }
  assert.match(readFileSync("lib/server/maps/service-role-client.ts", "utf8"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("the identity no-service-credential guard's file list is untouched by this slice", () => {
  // lib/server/maps/service-role-client.ts is a deliberately separate
  // module from everything tests/security/identity/no-service-credential.test.mjs
  // enumerates -- see that file and service-role-client.ts's own doc.
  const guarded = readFileSync("tests/security/identity/no-service-credential.test.mjs", "utf8");
  assert.doesNotMatch(guarded, /places|service-role-client/i);
});
