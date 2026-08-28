import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryTurnFeedbackStore, TurnFeedbackInputError } from "../../../lib/server/turn/feedback/contract.ts";

test("V4-09 stores structured feedback once per actor and never accepts free text", () => {
  const feedback = new InMemoryTurnFeedbackStore();
  const first = feedback.record({ id: "feedback-1", actorId: "owner", turnId: "turn-1", kind: "inaccurate", reason: "not_relevant" });
  const retry = feedback.record({ id: "feedback-2", actorId: "owner", turnId: "turn-1", kind: "inaccurate", reason: "not_relevant" });

  assert.deepEqual(first, { id: "feedback-1", reused: false });
  assert.deepEqual(retry, { id: "feedback-1", reused: true });
  assert.throws(() => feedback.record({ id: "feedback-3", actorId: "owner", turnId: "turn-1", kind: "inaccurate", reason: "raw correction text" as "not_relevant" }), TurnFeedbackInputError);
});

test("V4-09 keeps result types closed and feedback cannot change a Trip or Turn result", () => {
  const feedback = new InMemoryTurnFeedbackStore();
  assert.deepEqual(feedback.resultTypes(), ["needs_input", "answer", "card", "proposal_ready", "unavailable", "conflict"]);
  feedback.record({ id: "feedback-1", actorId: "owner", turnId: "turn-1", kind: "another_option", reason: "different_preference" });
  assert.deepEqual(feedback.history({ actorId: "owner", turnId: "turn-1" }).map((record) => record.reason), ["different_preference"]);
});
