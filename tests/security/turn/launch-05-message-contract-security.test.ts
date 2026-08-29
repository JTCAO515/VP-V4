import assert from "node:assert/strict";
import test from "node:test";
import {
  createContentFreeTelemetryReceipt,
  normalizeUserMessageInput,
  normalizeValidatedAssistantOutput,
} from "../../../lib/server/turn/message-contract.ts";
import { createPendingProposal } from "../../../lib/server/contracts/index.ts";

test("LAUNCH-05 does not accept provider reasoning or expose message text in its telemetry receipt", () => {
  const message = normalizeUserMessageInput({
    schemaVersion: "user-message-v1",
    messageId: "message-1",
    threadId: "thread-1",
    locale: "en",
    text: "passport number 123456789",
    idempotencyKey: "request-1",
  });
  assert.ok(message);
  assert.deepEqual(createContentFreeTelemetryReceipt(message), {
    schemaVersion: "user-message-v1",
    contentClass: "c2_trip_sensitive",
    persistence: "not_persisted",
    telemetry: "content_free",
  });
  assert.equal(
    normalizeValidatedAssistantOutput({
      schemaVersion: "assistant-output-v1",
      turnId: "turn-1",
      message: { kind: "answer", text: "I can help." },
      cards: [],
      proposal: null,
      reasoning: "private chain of thought",
    }),
    null,
  );
});

test("LAUNCH-05 rejects provider data hidden inside an otherwise valid immutable Proposal", () => {
  const proposal = createPendingProposal({
    id: "proposal-1",
    revision: 1,
    createdAt: "2026-08-24T00:00:00.000Z",
    draft: {
      kind: "proposal_draft",
      origin: "chat",
      tripId: "trip-1",
      baseTripVersion: 0,
      promptVersion: "trip-v1",
      changes: [{
        changeId: "title-1",
        kind: "update_trip_title",
        tripId: "trip-1",
        title: "北京三日行程",
        dependsOn: [],
        assumptions: [],
        evidence: [{
          kind: "fact",
          factId: "fact-1",
          version: 1,
          reviewedAt: "2026-08-24T00:00:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }],
      }],
    },
  });
  assert.equal(
    normalizeValidatedAssistantOutput({
      schemaVersion: "assistant-output-v1",
      turnId: "turn-1",
      message: { kind: "answer", text: "已整理。" },
      cards: [],
      proposal: {
        ...proposal,
        changes: proposal.changes.map((change) => ({ ...change, reasoning: "private chain of thought" })),
      },
    }),
    null,
  );
});
