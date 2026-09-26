import assert from "node:assert/strict";
import test from "node:test";
import { isStoreKitSandboxTarget } from "../../../lib/server/entitlements/runtime-target.ts";

test("Sandbox grant routes reject Production even if its feature flag is enabled", () => {
  assert.equal(isStoreKitSandboxTarget({ url: "https://production.example", environment: "production" }, true), false);
  assert.equal(isStoreKitSandboxTarget({ url: "https://production.example" }, true), false);
  assert.equal(isStoreKitSandboxTarget({ url: "http://localhost:54321/" }, true), false);
  assert.equal(isStoreKitSandboxTarget(null, true), false);
  assert.equal(isStoreKitSandboxTarget({ url: "https://staging.go2china.space", environment: "staging" }, true), true);
  assert.equal(isStoreKitSandboxTarget({ url: "http://127.0.0.1/" }, false), true);
});
