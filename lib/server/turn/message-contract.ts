import { createHash } from "node:crypto";

import { assertTripProposal, type TripProposal } from "../contracts/index.ts";

export const USER_MESSAGE_SCHEMA_VERSION = "user-message-v1";
export const ASSISTANT_OUTPUT_SCHEMA_VERSION = "assistant-output-v1";
export const MESSAGE_LOCALES = ["zh", "en", "es", "ru", "ar"] as const;

const USER_MESSAGE_MAX_LENGTH = 4000;
const ASSISTANT_MESSAGE_MAX_LENGTH = 8000;
const ASSISTANT_OUTPUT_MAX_CARDS = 12;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/;
export type MessageLocale = (typeof MESSAGE_LOCALES)[number];
export type UserMessageInput = Readonly<{
  schemaVersion: typeof USER_MESSAGE_SCHEMA_VERSION;
  messageId: string;
  threadId: string;
  locale: MessageLocale;
  text: string;
  idempotencyKey: string;
}>;

export type ContentFreeTelemetryReceipt = Readonly<{
  schemaVersion: typeof USER_MESSAGE_SCHEMA_VERSION;
  contentClass: "c2_trip_sensitive";
  persistence: "not_persisted";
  telemetry: "content_free";
}>;

export type AssistantOutputCard = Readonly<{
  cardId: string;
  kind: "summary" | "warning" | "unavailable";
  text: string;
}>;

export type ValidatedAssistantOutput = Readonly<{
  schemaVersion: typeof ASSISTANT_OUTPUT_SCHEMA_VERSION;
  turnId: string;
  message: Readonly<{ kind: "answer" | "clarification" | "unavailable"; text: string }>;
  cards: readonly AssistantOutputCard[];
  proposal: Readonly<TripProposal> | null;
}>;

export type ContentRetentionState = "decision_required" | "not_persisted" | "deleted";
export type ContentRetentionEvent = "capture_attempted" | "delete_requested";
export type ContentRetentionReceipt = Readonly<{
  state: ContentRetentionState;
  contentPersistence: false;
  telemetry: "content_free";
}>;

export class ContentRetentionError extends Error {}

export function normalizeUserMessageInput(value: unknown): UserMessageInput | null {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "messageId", "threadId", "locale", "text", "idempotencyKey"])) return null;
  if (value.schemaVersion !== USER_MESSAGE_SCHEMA_VERSION) return null;
  if (!isIdentifier(value.messageId) || !isIdentifier(value.threadId) || !isIdentifier(value.idempotencyKey)) return null;
  if (!isMessageLocale(value.locale) || !isBoundedText(value.text, USER_MESSAGE_MAX_LENGTH)) return null;
  return Object.freeze({
    schemaVersion: USER_MESSAGE_SCHEMA_VERSION,
    messageId: value.messageId,
    threadId: value.threadId,
    locale: value.locale,
    text: value.text,
    idempotencyKey: value.idempotencyKey,
  });
}

/**
 * This digest is only for the caller's in-process idempotency comparison. It is
 * deliberately absent from telemetry and persistence receipts because a digest of
 * a short prompt can still be sensitive metadata.
 */
export function messageRequestDigest(message: UserMessageInput): string {
  return createHash("sha256")
    .update(JSON.stringify({ threadId: message.threadId, locale: message.locale, text: message.text }))
    .digest("hex");
}

export function createContentFreeTelemetryReceipt(message: UserMessageInput): ContentFreeTelemetryReceipt {
  return Object.freeze({
    schemaVersion: USER_MESSAGE_SCHEMA_VERSION,
    contentClass: "c2_trip_sensitive",
    persistence: "not_persisted",
    telemetry: "content_free",
  });
}

export function normalizeValidatedAssistantOutput(value: unknown): ValidatedAssistantOutput | null {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "turnId", "message", "cards", "proposal"])) return null;
  if (value.schemaVersion !== ASSISTANT_OUTPUT_SCHEMA_VERSION || !isIdentifier(value.turnId)) return null;
  const message = normalizeAssistantMessage(value.message);
  const cards = normalizeAssistantCards(value.cards);
  const proposal = normalizeProposal(value.proposal);
  if (!message || !cards || proposal === undefined) return null;
  if (message.kind === "unavailable" && (cards.length > 0 || proposal !== null)) return null;
  return Object.freeze({
    schemaVersion: ASSISTANT_OUTPUT_SCHEMA_VERSION,
    turnId: value.turnId,
    message,
    cards: Object.freeze(cards),
    proposal,
  });
}

export function transitionContentRetention(input: Readonly<{ state: ContentRetentionState; event: ContentRetentionEvent }>): ContentRetentionReceipt {
  if (input.state === "decision_required" && input.event === "capture_attempted") {
    return Object.freeze({ state: "not_persisted", contentPersistence: false, telemetry: "content_free" });
  }
  if (input.state === "not_persisted" && input.event === "delete_requested") {
    return Object.freeze({ state: "deleted", contentPersistence: false, telemetry: "content_free" });
  }
  throw new ContentRetentionError("content retention transition is not allowed without an operator-approved policy");
}

function normalizeAssistantMessage(value: unknown): ValidatedAssistantOutput["message"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["kind", "text"])) return null;
  if ((value.kind !== "answer" && value.kind !== "clarification" && value.kind !== "unavailable") || !isBoundedText(value.text, ASSISTANT_MESSAGE_MAX_LENGTH)) {
    return null;
  }
  return Object.freeze({ kind: value.kind, text: value.text });
}

function normalizeAssistantCards(value: unknown): AssistantOutputCard[] | null {
  if (!Array.isArray(value) || value.length > ASSISTANT_OUTPUT_MAX_CARDS) return null;
  const cardIds = new Set<string>();
  const cards: AssistantOutputCard[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ["cardId", "kind", "text"])) return null;
    if (!isIdentifier(candidate.cardId) || cardIds.has(candidate.cardId)) return null;
    if ((candidate.kind !== "summary" && candidate.kind !== "warning" && candidate.kind !== "unavailable") || !isBoundedText(candidate.text, ASSISTANT_MESSAGE_MAX_LENGTH)) {
      return null;
    }
    cardIds.add(candidate.cardId);
    cards.push(Object.freeze({ cardId: candidate.cardId, kind: candidate.kind, text: candidate.text }));
  }
  return cards;
}

function normalizeProposal(value: unknown): Readonly<TripProposal> | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (!isClosedPendingProposalShape(value)) return undefined;
  try {
    const proposal = structuredClone(value) as TripProposal;
    assertTripProposal(proposal);
    return freezeValue(proposal);
  } catch {
    return undefined;
  }
}

function isClosedPendingProposalShape(value: Record<string, unknown>): boolean {
  if (!hasKeys(value, ["kind", "id", "revision", "origin", "status", "tripId", "baseTripVersion", "changes", "evidence", "promptVersion", "createdAt"], ["modelRunId", "supersedesProposalId"])) return false;
  if (value.status !== "pending" || !isProposalOrigin(value.origin) || (value.tripId !== null && !isIdentifier(value.tripId))) return false;
  if (value.baseTripVersion !== null && (typeof value.baseTripVersion !== "number" || !Number.isInteger(value.baseTripVersion) || value.baseTripVersion < 0)) return false;
  if (typeof value.promptVersion !== "string" || typeof value.createdAt !== "string") return false;
  if (value.modelRunId !== undefined && !isIdentifier(value.modelRunId)) return false;
  if (value.supersedesProposalId !== undefined && !isIdentifier(value.supersedesProposalId)) return false;
  return Array.isArray(value.changes) && value.changes.every(isClosedProposalChange) && Array.isArray(value.evidence) && value.evidence.every(isClosedEvidenceReceipt);
}

function isClosedProposalChange(value: unknown): boolean {
  if (!isRecord(value) || !hasKeys(value, ["changeId", "kind", "dependsOn", "evidence", "assumptions", "tripId"], ["title", "dayId", "date", "blockId", "label"])) return false;
  if (!isIdentifier(value.changeId) || !isIdentifier(value.tripId) || !Array.isArray(value.dependsOn) || !value.dependsOn.every(isIdentifier)) return false;
  if (!Array.isArray(value.evidence) || !value.evidence.every(isClosedEvidenceReceipt) || !Array.isArray(value.assumptions) || !value.assumptions.every(isClosedAssumption)) return false;
  switch (value.kind) {
    case "create_trip":
    case "update_trip_title":
      return hasKeys(value, ["changeId", "kind", "dependsOn", "evidence", "assumptions", "tripId", "title"]) && isBoundedText(value.title, 160);
    case "upsert_day":
      return hasKeys(value, ["changeId", "kind", "dependsOn", "evidence", "assumptions", "tripId", "dayId", "date"]) && isIdentifier(value.dayId) && typeof value.date === "string";
    case "delete_day":
      return hasKeys(value, ["changeId", "kind", "dependsOn", "evidence", "assumptions", "tripId", "dayId"]) && isIdentifier(value.dayId);
    case "upsert_block":
      return hasKeys(value, ["changeId", "kind", "dependsOn", "evidence", "assumptions", "tripId", "dayId", "blockId", "label"]) && isIdentifier(value.dayId) && isIdentifier(value.blockId) && isBoundedText(value.label, 160);
    case "delete_block":
      return hasKeys(value, ["changeId", "kind", "dependsOn", "evidence", "assumptions", "tripId", "dayId", "blockId"]) && isIdentifier(value.dayId) && isIdentifier(value.blockId);
    default:
      return false;
  }
}

function isClosedAssumption(value: unknown): boolean {
  if (!isRecord(value) || !hasKeys(value, ["field", "value", "source"], ["evidence"])) return false;
  if (typeof value.field !== "string" || !isPrimitive(value.value) || (value.source !== "stated" && value.source !== "inferred" && value.source !== "defaulted")) return false;
  return value.evidence === undefined || (Array.isArray(value.evidence) && value.evidence.every(isClosedEvidenceReceipt));
}

function isClosedEvidenceReceipt(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "fact": return hasKeys(value, ["kind", "factId", "version", "reviewedAt", "expiresAt"]);
    case "observation": return hasKeys(value, ["kind", "observationId", "provider", "policyId", "expiresAt"]);
    case "user_artifact": return hasKeys(value, ["kind", "artifactId", "version", "confirmedAt"]);
    default: return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function hasKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function isMessageLocale(value: unknown): value is MessageLocale {
  return typeof value === "string" && (MESSAGE_LOCALES as readonly string[]).includes(value);
}

function isProposalOrigin(value: unknown): boolean {
  return value === "chat" || value === "explore" || value === "user_edit" || value === "system_recheck";
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function freezeValue<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) freezeValue(nested);
  }
  return value;
}
