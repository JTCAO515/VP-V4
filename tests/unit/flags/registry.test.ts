import assert from "node:assert/strict";
import test from "node:test";
import {
  FLAGS,
  decideFlag,
  defaultFlags,
  invalidFlags,
  invalidRegistry,
} from "../../../lib/flags/registry.ts";

test("the registry contains only flags required by the R1 release slice", () => {
  assert.deepEqual(Object.keys(FLAGS), ["TRIP_PERSISTENCE_ENABLED", "CHAT_RUNTIME_ENABLED"]);
  assert.deepEqual(invalidRegistry(), []);
});

test("chat runtime requires Trip persistence", () => {
  assert.deepEqual(invalidFlags({ ...defaultFlags, CHAT_RUNTIME_ENABLED: true }), [
    "CHAT_RUNTIME_ENABLED requires TRIP_PERSISTENCE_ENABLED",
  ]);
  assert.deepEqual(
    invalidFlags({
      ...defaultFlags,
      TRIP_PERSISTENCE_ENABLED: true,
      CHAT_RUNTIME_ENABLED: true,
    }),
    [],
  );
});

test("flags default off and only return capability availability", () => {
  assert.deepEqual(decideFlag(defaultFlags, "TRIP_PERSISTENCE_ENABLED"), {
    available: false,
    reason: "flag_disabled",
  });
  assert.deepEqual(decideFlag(defaultFlags, "CHAT_RUNTIME_ENABLED"), {
    available: false,
    reason: "flag_disabled",
  });

  for (const definition of Object.values(FLAGS)) {
    assert.equal("authorization" in definition, false);
    assert.equal("role" in definition, false);
  }
});
