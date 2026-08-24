import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_CONSUMERS,
  CONTRACT_SCHEMA_VERSION,
  ContractValidationError,
  assertGroundedClaim,
  createAssistantTurn,
  createPendingProposal,
  deriveProposalRevision,
  type EvidenceReceipt,
  type ProposalChange,
  type ProposalDraft,
} from "../../../lib/server/contracts/index.ts";

const now = "2026-08-24T00:00:00.000Z";
const future = "2099-01-01T00:00:00.000Z";

const factReceipt: EvidenceReceipt = {
  kind: "fact",
  factId: "fact:beijing:forbidden-city:entry",
  version: 3,
  reviewedAt: now,
  expiresAt: future,
};

const observationReceipt: EvidenceReceipt = {
  kind: "observation",
  observationId: "observation:weather:beijing:2026-08-24",
  provider: "fixture-provider",
  policyId: "policy:C1:fixture",
  expiresAt: future,
};

function change(changeId: string, dependsOn: readonly string[] = []): ProposalChange {
  return {
    changeId,
    kind: "upsert_day",
    tripId: "trip:1",
    dayId: `day:${changeId}`,
    date: "2026-10-01",
    dependsOn,
    evidence: [factReceipt],
    assumptions: [{ field: "arrival_time", value: "10:00", source: "stated" }],
  };
}

function draft(changes: readonly ProposalChange[]): ProposalDraft {
  return {
    kind: "proposal_draft",
    origin: "chat",
    tripId: "trip:1",
    baseTripVersion: 4,
    changes,
    promptVersion: "trip-v1",
  };
}

test("freezes only validated immutable pending proposal revisions", () => {
  const proposal = createPendingProposal({ id: "proposal:1", revision: 1, draft: draft([change("arrival")]), createdAt: now });

  assert.equal(proposal.status, "pending");
  assert.equal(Object.isFrozen(proposal), true);
  assert.equal(Object.isFrozen(proposal.changes), true);
  assert.equal(Object.isFrozen(proposal.changes[0]), true);
  assert.deepEqual(proposal.evidence, [factReceipt]);
  assert.throws(() => {
    (proposal.changes as ProposalChange[]).push(change("forbidden-mutation"));
  }, TypeError);
});

test("partial selection creates a child revision and preserves the parent", () => {
  const parent = createPendingProposal({
    id: "proposal:parent",
    revision: 7,
    draft: draft([change("arrival"), change("museum", ["arrival"])]),
    createdAt: now,
  });

  const child = deriveProposalRevision({
    id: "proposal:child",
    parent,
    selectedChangeIds: ["arrival"],
    createdAt: "2026-08-25T00:00:00.000Z",
  });

  assert.equal(child.revision, 8);
  assert.equal(child.supersedesProposalId, parent.id);
  assert.deepEqual(child.changes.map((item) => item.changeId), ["arrival"]);
  assert.deepEqual(parent.changes.map((item) => item.changeId), ["arrival", "museum"]);
  assert.throws(
    () => deriveProposalRevision({ id: "proposal:bad", parent, selectedChangeIds: ["museum"], createdAt: future }),
    ContractValidationError,
  );
});

test("rejects arbitrary JSON Patch-like changes before a proposal can become pending", () => {
  const arbitraryChange = {
    changeId: "escape-hatch",
    kind: "json_patch",
    path: "/trip/title",
    dependsOn: [],
    evidence: [factReceipt],
    assumptions: [],
  } as unknown as ProposalChange;

  assert.throws(
    () => createPendingProposal({ id: "proposal:invalid", revision: 1, draft: draft([arbitraryChange]), createdAt: now }),
    ContractValidationError,
  );
});

test("rejects absent, expired, or non-receipt grounded evidence", () => {
  const baseClaim = {
    claimType: "money" as const,
    subjectId: "poi:forbidden-city",
    value: { amountMinor: 6000, currency: "CNY" },
    asOf: now,
    evidence: [factReceipt],
  };
  assert.doesNotThrow(() => assertGroundedClaim(baseClaim));
  assert.throws(() => assertGroundedClaim({ ...baseClaim, evidence: [] }), ContractValidationError);
  assert.throws(
    () => assertGroundedClaim({ ...baseClaim, evidence: [{ ...observationReceipt, expiresAt: "2020-01-01T00:00:00.000Z" }] }),
    ContractValidationError,
  );
  assert.throws(
    () => assertGroundedClaim({
      ...baseClaim,
      evidence: [{ kind: "external_entity", provider: "fixture", entityId: "123", entityType: "poi" } as unknown as EvidenceReceipt],
    }),
    ContractValidationError,
  );
});

test("requires typed execution values and propagates claim evidence into cards", () => {
  const claim = {
    claimType: "time_window" as const,
    subjectId: "poi:forbidden-city",
    value: { startsAt: "2026-10-01T08:30:00.000Z", timeZone: "Asia/Shanghai" },
    asOf: now,
    evidence: [observationReceipt],
  };

  const turn = createAssistantTurn({
    id: "turn:1",
    threadId: "thread:1",
    locale: "zh",
    availability: "answered",
    body: "Here is the reviewed planning evidence.",
    context: [factReceipt, { kind: "external_entity", provider: "fixture-provider", entityId: "poi:1", entityType: "poi" }],
    cards: [{ cardId: "card:1", kind: "execution", claims: [claim], evidence: [observationReceipt] }],
    proposal: null,
    createdAt: now,
  });

  assert.equal(turn.schemaVersion, CONTRACT_SCHEMA_VERSION);
  assert.equal(Object.isFrozen(turn.cards[0].claims[0]), true);
  assert.throws(
    () => createAssistantTurn({ ...turn, cards: [{ ...turn.cards[0], evidence: [] }], schemaVersion: undefined } as never),
    ContractValidationError,
  );
});

test("records the fixed consumer boundary without provider-owned types", () => {
  assert.deepEqual(CONTRACT_CONSUMERS.TripWorkspace, ["TripProposal", "ProposalChange", "EvidenceReceipt"]);
  assert.deepEqual(CONTRACT_CONSUMERS.TurnCoordinator, ["AssistantTurn", "ContextRef", "GroundedClaim"]);
});
