import assert from "node:assert/strict";
import test from "node:test";
import {
  ContentRetentionError,
  transitionContentRetention,
} from "../../../lib/server/turn/message-contract.ts";

test("LAUNCH-05 retention lifecycle cannot transition from an unapproved capture to persistence", () => {
  const captured = transitionContentRetention({ state: "decision_required", event: "capture_attempted" });
  assert.equal(captured.state, "not_persisted");
  assert.equal(captured.contentPersistence, false);
  assert.throws(
    () => transitionContentRetention({ state: "not_persisted", event: "capture_attempted" }),
    ContentRetentionError,
  );
});
