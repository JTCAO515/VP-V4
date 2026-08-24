/**
 * AI-03 domain contract baseline.
 *
 * These types intentionally have no dependency on a provider SDK, database client,
 * HTTP framework, or UI component. Later owning modules adapt this contract at their
 * boundary rather than allowing transport or persistence shapes to define it.
 */

export const CONTRACT_SCHEMA_VERSION = "2026-08-24.1";

export const CONTRACT_CONSUMERS = {
  TurnCoordinator: ["AssistantTurn", "ContextRef", "GroundedClaim"],
  TripWorkspace: ["TripProposal", "ProposalChange", "EvidenceReceipt"],
  KnowledgeSystem: ["EvidenceReceipt", "GroundedClaim"],
  ExternalEvidenceResolver: ["ContextRef", "EvidenceReceipt"],
  ChatUI: ["AssistantTurn"],
  TripCanvas: ["TripProposal"],
  Explore: ["TripProposal", "ContextRef"],
} as const;

export type EvidenceReceipt = FactEvidenceReceipt | ObservationEvidenceReceipt | UserArtifactEvidenceReceipt;

export type FactEvidenceReceipt = {
  readonly kind: "fact";
  readonly factId: string;
  readonly version: number;
  readonly reviewedAt: string;
  readonly expiresAt: string;
};

export type ObservationEvidenceReceipt = {
  readonly kind: "observation";
  readonly observationId: string;
  readonly provider: string;
  readonly policyId: string;
  readonly expiresAt: string;
};

export type UserArtifactEvidenceReceipt = {
  readonly kind: "user_artifact";
  readonly artifactId: string;
  readonly version: number;
  readonly confirmedAt: string;
};

export type ExternalEntityRef = {
  readonly kind: "external_entity";
  readonly provider: string;
  readonly entityId: string;
  readonly entityType: string;
};

export type ContextRef = EvidenceReceipt | ExternalEntityRef;

export type GroundedClaim =
  | GroundedAddressClaim
  | GroundedTimeWindowClaim
  | GroundedMoneyClaim
  | GroundedPaymentMethodClaim
  | GroundedAdmissionClaim
  | GroundedTransportStatusClaim
  | GroundedSafePhraseClaim;

type GroundedClaimBase<TType extends string, TValue> = {
  readonly claimType: TType;
  readonly subjectId: string;
  readonly value: Readonly<TValue>;
  readonly asOf: string;
  readonly evidence: readonly EvidenceReceipt[];
};

export type GroundedAddressClaim = GroundedClaimBase<
  "address",
  { lines: readonly string[]; locality?: string; countryCode: string }
>;
export type GroundedTimeWindowClaim = GroundedClaimBase<
  "time_window",
  { startsAt: string; endsAt?: string; timeZone: string }
>;
export type GroundedMoneyClaim = GroundedClaimBase<
  "money",
  { amountMinor: number; currency: string }
>;
export type GroundedPaymentMethodClaim = GroundedClaimBase<
  "payment_method",
  { method: "cash" | "card" | "wallet" | "bank_transfer"; qualifier?: string }
>;
export type GroundedAdmissionClaim = GroundedClaimBase<
  "admission",
  { action: "reserve" | "queue" | "walk_in" | "check_official"; audience?: string }
>;
export type GroundedTransportStatusClaim = GroundedClaimBase<
  "transport_status",
  { status: "scheduled" | "delayed" | "cancelled" | "unknown"; serviceId: string }
>;
export type GroundedSafePhraseClaim = GroundedClaimBase<
  "safe_phrase",
  { locale: string; text: string; purpose: string }
>;

export type Assumption = {
  readonly field: string;
  readonly value: string | number | boolean | null;
  readonly source: "stated" | "inferred" | "defaulted";
  readonly evidence?: readonly EvidenceReceipt[];
};

type ProposalChangeBase<TKind extends string> = {
  readonly changeId: string;
  readonly kind: TKind;
  readonly dependsOn: readonly string[];
  readonly evidence: readonly EvidenceReceipt[];
  readonly assumptions: readonly Assumption[];
};

export type ProposalChange =
  | (ProposalChangeBase<"create_trip"> & { readonly tripId: string; readonly title: string })
  | (ProposalChangeBase<"update_trip_title"> & { readonly tripId: string; readonly title: string })
  | (ProposalChangeBase<"upsert_day"> & { readonly tripId: string; readonly dayId: string; readonly date: string })
  | (ProposalChangeBase<"delete_day"> & { readonly tripId: string; readonly dayId: string })
  | (ProposalChangeBase<"upsert_block"> & {
      readonly tripId: string;
      readonly dayId: string;
      readonly blockId: string;
      readonly label: string;
    })
  | (ProposalChangeBase<"delete_block"> & { readonly tripId: string; readonly dayId: string; readonly blockId: string });

export type ProposalOrigin = "chat" | "explore" | "user_edit" | "system_recheck";
export type ProposalStatus = "pending" | "applied" | "rejected" | "expired" | "conflicted" | "superseded";

export type ProposalDraft = {
  readonly kind: "proposal_draft";
  readonly origin: ProposalOrigin;
  readonly tripId: string | null;
  readonly baseTripVersion: number | null;
  readonly changes: readonly ProposalChange[];
  readonly promptVersion: string;
  readonly modelRunId?: string;
};

export type TripProposal = {
  readonly kind: "trip_proposal";
  readonly id: string;
  readonly revision: number;
  readonly origin: ProposalOrigin;
  readonly status: ProposalStatus;
  readonly tripId: string | null;
  readonly baseTripVersion: number | null;
  readonly changes: readonly ProposalChange[];
  readonly evidence: readonly EvidenceReceipt[];
  readonly promptVersion: string;
  readonly modelRunId?: string;
  readonly createdAt: string;
  readonly supersedesProposalId?: string;
};

export type ExecutionCard = {
  readonly cardId: string;
  readonly kind: "summary" | "execution" | "warning" | "unavailable";
  readonly claims: readonly GroundedClaim[];
  readonly evidence: readonly EvidenceReceipt[];
};

export type AssistantTurn = {
  readonly id: string;
  readonly threadId: string;
  readonly locale: string;
  readonly availability: "answered" | "clarification" | "unavailable";
  readonly body: string;
  readonly context: readonly ContextRef[];
  readonly cards: readonly ExecutionCard[];
  readonly proposal: Readonly<TripProposal> | null;
  readonly createdAt: string;
  readonly schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
};

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

export function createPendingProposal(input: {
  id: string;
  revision: number;
  draft: ProposalDraft;
  createdAt: string;
  supersedesProposalId?: string;
}): Readonly<TripProposal> {
  assertNonEmpty(input.id, "proposal id");
  assertPositiveInteger(input.revision, "proposal revision");
  assertIsoTimestamp(input.createdAt, "proposal createdAt");
  assertProposalDraft(input.draft);

  const proposal: TripProposal = {
    kind: "trip_proposal",
    id: input.id,
    revision: input.revision,
    origin: input.draft.origin,
    status: "pending",
    tripId: input.draft.tripId,
    baseTripVersion: input.draft.baseTripVersion,
    changes: input.draft.changes,
    evidence: uniqueEvidence(input.draft.changes.flatMap((change) => [...change.evidence])),
    promptVersion: input.draft.promptVersion,
    ...(input.draft.modelRunId ? { modelRunId: input.draft.modelRunId } : {}),
    createdAt: input.createdAt,
    ...(input.supersedesProposalId ? { supersedesProposalId: input.supersedesProposalId } : {}),
  };

  assertTripProposal(proposal);
  return deepFreeze(proposal);
}

export function deriveProposalRevision(input: {
  id: string;
  parent: Readonly<TripProposal>;
  selectedChangeIds: readonly string[];
  origin?: ProposalOrigin;
  createdAt: string;
  promptVersion?: string;
}): Readonly<TripProposal> {
  assertTripProposal(input.parent);
  if (input.parent.status !== "pending") {
    throw new ContractValidationError("Only a pending proposal can produce a revision.");
  }

  const selected = new Set(input.selectedChangeIds);
  if (selected.size === 0) throw new ContractValidationError("A proposal revision must select at least one change.");

  const changes = input.parent.changes.filter((change) => selected.has(change.changeId));
  if (changes.length !== selected.size) throw new ContractValidationError("A selected change does not belong to the parent proposal.");

  for (const change of changes) {
    for (const dependency of change.dependsOn) {
      if (!selected.has(dependency)) {
        throw new ContractValidationError(`Selected change ${change.changeId} is missing dependency ${dependency}.`);
      }
    }
  }

  return createPendingProposal({
    id: input.id,
    revision: input.parent.revision + 1,
    draft: {
      kind: "proposal_draft",
      origin: input.origin ?? "user_edit",
      tripId: input.parent.tripId,
      baseTripVersion: input.parent.baseTripVersion,
      changes,
      promptVersion: input.promptVersion ?? input.parent.promptVersion,
      ...(input.parent.modelRunId ? { modelRunId: input.parent.modelRunId } : {}),
    },
    createdAt: input.createdAt,
    supersedesProposalId: input.parent.id,
  });
}

export function createAssistantTurn(input: Omit<AssistantTurn, "schemaVersion">): Readonly<AssistantTurn> {
  assertNonEmpty(input.id, "turn id");
  assertNonEmpty(input.threadId, "thread id");
  assertNonEmpty(input.locale, "turn locale");
  assertNonEmpty(input.body, "turn body");
  assertIsoTimestamp(input.createdAt, "turn createdAt");
  assertContextRefs(input.context);

  for (const card of input.cards) assertExecutionCard(card);
  if (input.proposal) assertTripProposal(input.proposal);
  if (input.availability === "unavailable" && (input.cards.some((card) => card.claims.length > 0) || input.proposal)) {
    throw new ContractValidationError("An unavailable turn cannot carry executable claims or a proposal.");
  }

  return deepFreeze({ ...input, schemaVersion: CONTRACT_SCHEMA_VERSION });
}

export function assertTripProposal(proposal: Readonly<TripProposal>): void {
  if (proposal.kind !== "trip_proposal") throw new ContractValidationError("A published proposal must have kind trip_proposal.");
  if (!PROPOSAL_STATUSES.has(proposal.status)) throw new ContractValidationError("A proposal must use a known closed status.");
  assertNonEmpty(proposal.id, "proposal id");
  assertPositiveInteger(proposal.revision, "proposal revision");
  assertIsoTimestamp(proposal.createdAt, "proposal createdAt");
  assertProposalChanges(proposal.changes);

  const requiredEvidence = uniqueEvidence(proposal.changes.flatMap((change) => [...change.evidence]));
  if (evidenceKeys(requiredEvidence).join("|") !== evidenceKeys(uniqueEvidence(proposal.evidence)).join("|")) {
    throw new ContractValidationError("Proposal-level evidence must be the exact deduplicated index of change evidence.");
  }
}

export function assertGroundedClaim(claim: GroundedClaim): void {
  assertNonEmpty(claim.subjectId, "claim subjectId");
  assertIsoTimestamp(claim.asOf, "claim asOf");
  assertEvidenceReceipts(claim.evidence, "claim evidence");
  if (claim.evidence.length === 0) throw new ContractValidationError("A grounded claim requires evidence receipts.");

  switch (claim.claimType) {
    case "address":
      if (claim.value.lines.length === 0 || !claim.value.countryCode) throw new ContractValidationError("An address claim requires lines and countryCode.");
      return;
    case "time_window":
      assertIsoTimestamp(claim.value.startsAt, "time window startsAt");
      if (claim.value.endsAt) assertIsoTimestamp(claim.value.endsAt, "time window endsAt");
      assertNonEmpty(claim.value.timeZone, "time window timeZone");
      return;
    case "money":
      if (!Number.isSafeInteger(claim.value.amountMinor)) throw new ContractValidationError("Money must use integer minor units.");
      assertNonEmpty(claim.value.currency, "money currency");
      return;
    case "payment_method":
      return;
    case "admission":
      return;
    case "transport_status":
      assertNonEmpty(claim.value.serviceId, "transport serviceId");
      return;
    case "safe_phrase":
      assertNonEmpty(claim.value.locale, "safe phrase locale");
      assertNonEmpty(claim.value.text, "safe phrase text");
      assertNonEmpty(claim.value.purpose, "safe phrase purpose");
      return;
    default:
      throw new ContractValidationError("A claim must use a known typed claimType.");
  }
}

function assertProposalDraft(draft: ProposalDraft): void {
  if (draft.kind !== "proposal_draft") throw new ContractValidationError("Only a proposal_draft can be published as pending.");
  assertNonEmpty(draft.promptVersion, "promptVersion");
  if (!Array.isArray(draft.changes) || draft.changes.length === 0) {
    throw new ContractValidationError("A proposal draft requires at least one closed proposal change.");
  }
  assertProposalChanges(draft.changes);
}

function assertProposalChanges(changes: readonly ProposalChange[]): void {
  const changeIds = new Set<string>();
  for (const change of changes) {
    assertNonEmpty(change.changeId, "changeId");
    if (changeIds.has(change.changeId)) throw new ContractValidationError(`Duplicate changeId ${change.changeId}.`);
    changeIds.add(change.changeId);
    assertProposalChangeShape(change);
    assertEvidenceReceipts(change.evidence, `evidence for ${change.changeId}`);
    if (change.evidence.length === 0) throw new ContractValidationError(`Change ${change.changeId} requires evidence receipts.`);
    for (const assumption of change.assumptions) assertAssumption(assumption);
  }
  for (const change of changes) {
    for (const dependency of change.dependsOn) {
      if (!changeIds.has(dependency) || dependency === change.changeId) {
        throw new ContractValidationError(`Change ${change.changeId} has an invalid dependency.`);
      }
    }
  }
}

const PROPOSAL_STATUSES = new Set<ProposalStatus>([
  "pending",
  "applied",
  "rejected",
  "expired",
  "conflicted",
  "superseded",
]);

function assertProposalChangeShape(change: ProposalChange): void {
  switch (change.kind) {
    case "create_trip":
    case "update_trip_title":
      assertNonEmpty(change.tripId, `${change.kind} tripId`);
      assertNonEmpty(change.title, `${change.kind} title`);
      return;
    case "upsert_day":
      assertNonEmpty(change.tripId, "upsert_day tripId");
      assertNonEmpty(change.dayId, "upsert_day dayId");
      assertIsoTimestamp(change.date, "upsert_day date");
      return;
    case "delete_day":
      assertNonEmpty(change.tripId, "delete_day tripId");
      assertNonEmpty(change.dayId, "delete_day dayId");
      return;
    case "upsert_block":
      assertNonEmpty(change.tripId, "upsert_block tripId");
      assertNonEmpty(change.dayId, "upsert_block dayId");
      assertNonEmpty(change.blockId, "upsert_block blockId");
      assertNonEmpty(change.label, "upsert_block label");
      return;
    case "delete_block":
      assertNonEmpty(change.tripId, "delete_block tripId");
      assertNonEmpty(change.dayId, "delete_block dayId");
      assertNonEmpty(change.blockId, "delete_block blockId");
      return;
    default:
      throw new ContractValidationError("A proposal change must use a known closed kind.");
  }
}

function assertExecutionCard(card: ExecutionCard): void {
  assertNonEmpty(card.cardId, "cardId");
  assertEvidenceReceipts(card.evidence, `evidence for card ${card.cardId}`);
  for (const claim of card.claims) assertGroundedClaim(claim);
  const claimEvidence = uniqueEvidence(card.claims.flatMap((claim) => [...claim.evidence]));
  for (const receipt of claimEvidence) {
    if (!evidenceKeys(card.evidence).includes(evidenceKey(receipt))) {
      throw new ContractValidationError(`Card ${card.cardId} must include each claim evidence receipt.`);
    }
  }
}

function assertAssumption(assumption: Assumption): void {
  assertNonEmpty(assumption.field, "assumption field");
  if (assumption.evidence) assertEvidenceReceipts(assumption.evidence, `evidence for assumption ${assumption.field}`);
}

function assertContextRefs(context: readonly ContextRef[]): void {
  for (const ref of context) {
    if (ref.kind === "external_entity") {
      assertNonEmpty(ref.provider, "external entity provider");
      assertNonEmpty(ref.entityId, "external entity id");
      assertNonEmpty(ref.entityType, "external entity type");
      continue;
    }
    assertEvidenceReceipts([ref], "turn context");
  }
}

function assertEvidenceReceipts(receipts: readonly EvidenceReceipt[], label: string): void {
  for (const receipt of receipts) {
    switch (receipt.kind) {
      case "fact":
        assertNonEmpty(receipt.factId, `${label} factId`);
        assertPositiveInteger(receipt.version, `${label} fact version`);
        assertIsoTimestamp(receipt.reviewedAt, `${label} fact reviewedAt`);
        assertFutureOrPresent(receipt.expiresAt, `${label} fact expiresAt`);
        break;
      case "observation":
        assertNonEmpty(receipt.observationId, `${label} observationId`);
        assertNonEmpty(receipt.provider, `${label} observation provider`);
        assertNonEmpty(receipt.policyId, `${label} observation policyId`);
        assertFutureOrPresent(receipt.expiresAt, `${label} observation expiresAt`);
        break;
      case "user_artifact":
        assertNonEmpty(receipt.artifactId, `${label} artifactId`);
        assertPositiveInteger(receipt.version, `${label} artifact version`);
        assertIsoTimestamp(receipt.confirmedAt, `${label} artifact confirmedAt`);
        break;
      default:
        throw new ContractValidationError(`${label} contains an unsupported evidence receipt.`);
    }
  }
}

function uniqueEvidence(receipts: readonly EvidenceReceipt[]): EvidenceReceipt[] {
  const byKey = new Map<string, EvidenceReceipt>();
  for (const receipt of receipts) byKey.set(evidenceKey(receipt), receipt);
  return [...byKey.values()].sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)));
}

function evidenceKeys(receipts: readonly EvidenceReceipt[]): string[] {
  return receipts.map(evidenceKey).sort();
}

function evidenceKey(receipt: EvidenceReceipt): string {
  switch (receipt.kind) {
    case "fact":
      return `fact:${receipt.factId}:${receipt.version}`;
    case "observation":
      return `observation:${receipt.observationId}:${receipt.policyId}`;
    case "user_artifact":
      return `user_artifact:${receipt.artifactId}:${receipt.version}`;
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new ContractValidationError(`${label} must not be empty.`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new ContractValidationError(`${label} must be a positive integer.`);
}

function assertIsoTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw new ContractValidationError(`${label} must be an ISO timestamp.`);
}

function assertFutureOrPresent(value: string, label: string): void {
  assertIsoTimestamp(value, label);
  if (Date.parse(value) < Date.now()) throw new ContractValidationError(`${label} must not be expired.`);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
