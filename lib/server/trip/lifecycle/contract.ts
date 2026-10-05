import { isUuid } from "../../identity/request-guards.ts";

export const LIFECYCLE_VERSION = "trip-lifecycle/1";
export const LIFECYCLE_STATES = ["legacy", "draft", "active", "retained", "archived"] as const;
export type LifecycleState = typeof LIFECYCLE_STATES[number];
export type MemoryReference = Readonly<{ memoryId: string; revision: number; sourceReceiptId: string; consentId: string }>;
export type PreferenceChoice = Readonly<{ action: "skip" }> | Readonly<{
  action: "keep"; memoryRefs: readonly MemoryReference[];
}>;
type Mutation = Readonly<{
  operationId: string; expectedRevision: number; expectedActiveTripId: string | null;
  expectedSessionId: string; confirmed: true;
}>;
type ExistingTrip = Readonly<{ tripId: string; expectedHeadVersion: number }>;
export type LifecycleCommand = Mutation & (
  { action: "create"; tripId: string; title: string }
  | (ExistingTrip & { action: "activate" })
  | (ExistingTrip & { action: "reconcile"; state: "draft" | "retained" })
  | (ExistingTrip & { action: "archive"; preference: PreferenceChoice })
);
export type LifecycleTrip = Readonly<{
  tripId: string; title: string; headVersion: number; state: LifecycleState;
  archivedVersion: number | null; archivedAt: string | null;
}>;
export type LifecycleCapacity = Readonly<{
  draftCount: number; draftLimit: 3; activeTripId: string | null;
  activeLimit: 1; legacyCount: number;
}>;
export type LifecycleSnapshot = Readonly<{
  version: typeof LIFECYCLE_VERSION; ownerId: string; sessionId: string; revision: number;
  capacity: LifecycleCapacity; trips: readonly LifecycleTrip[]; nextTripId: string | null;
  serviceStatus: "unavailable";
}>;
/** An immutable operation receipt. It does not grant current Memory/Trip eligibility. */
export type LifecycleAppliedReceipt = Readonly<{
  status: "applied";
  version: typeof LIFECYCLE_VERSION; ownerId: string; sessionId: string;
  operationId: string; requestDigest: string; action: LifecycleCommand["action"]; revision: number;
  tripId: string; state: Exclude<LifecycleState, "legacy">; capacity: LifecycleCapacity;
  archivedVersion: number | null; archivedAt: string | null;
  preference: "skipped" | "kept" | "not_requested";
  memoryRefs: readonly MemoryReference[];
}>;
export const LIFECYCLE_DECLINES = ["LIFECYCLE_CONFLICT", "TRIP_CAPACITY", "LEGACY_RECONCILIATION_REQUIRED",
  "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE", "MEMORY_CONFLICT", "IDEMPOTENCY_KEY_REUSE", "USER_ABANDONED"] as const;
export type LifecycleDeclinedReceipt = Readonly<{
  version: typeof LIFECYCLE_VERSION; ownerId: string; sessionId: string; operationId: string;
  requestDigest: string; action: LifecycleCommand["action"]; tripId: string;
  status: "declined"; reason: typeof LIFECYCLE_DECLINES[number]; revision: number;
}>;
export type LifecycleReceipt = LifecycleAppliedReceipt | LifecycleDeclinedReceipt;
export type LifecycleRecovery = Readonly<{
  version: typeof LIFECYCLE_VERSION; ownerId: string; sessionId: string;
  operationId: string; receipt: LifecycleReceipt | null;
}>;
export const LIFECYCLE_ERRORS = ["INVALID_INPUT", "UNAUTHENTICATED", "SESSION_REPLACED", "FORBIDDEN",
  "LIFECYCLE_CONFLICT", "LIFECYCLE_OPERATION_REUSE", "TRIP_CAPACITY", "LEGACY_RECONCILIATION_REQUIRED",
  "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE",
  "IDEMPOTENCY_KEY_REUSE", "MEMORY_CONFLICT", "UNAVAILABLE"] as const;
export type LifecycleError = typeof LIFECYCLE_ERRORS[number];

export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 9007199254740990;
const head = (value: unknown): value is number => revision(value) && value <= 2147483647;
export const uuid = (value: unknown): value is string => typeof value === "string" && isUuid(value) && value === value.toLowerCase();
const nullableUuid = (value: unknown) => value === null || uuid(value);
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export function isMemoryReference(value: unknown): value is MemoryReference {
  return record(value) && exact(value, ["memoryId", "revision", "sourceReceiptId", "consentId"])
    && uuid(value.memoryId) && uuid(value.sourceReceiptId) && uuid(value.consentId) && revision(value.revision) && value.revision > 0;
}
export function isMemoryReferences(value: unknown): value is readonly MemoryReference[] {
  return Array.isArray(value) && value.length <= 100 && value.every(isMemoryReference)
    && new Set(value.map(item => item.memoryId)).size === value.length;
}
export function isPreferenceChoice(value: unknown): value is PreferenceChoice {
  if (!record(value)) return false;
  if (value.action === "skip") return exact(value, ["action"]);
  return exact(value, ["action", "memoryRefs"]) && value.action === "keep"
    && isMemoryReferences(value.memoryRefs) && value.memoryRefs.length > 0;
}

export function isLifecycleCommand(value: unknown): value is LifecycleCommand {
  if (!record(value) || !uuid(value.operationId) || !revision(value.expectedRevision)
    || !nullableUuid(value.expectedActiveTripId) || !uuid(value.expectedSessionId) || value.confirmed !== true || !uuid(value.tripId)) return false;
  const common = ["action", "operationId", "expectedRevision", "expectedActiveTripId", "expectedSessionId", "confirmed", "tripId"];
  if (value.action === "create") return exact(value, [...common, "title"])
    && typeof value.title === "string" && value.title === value.title.trim() && value.title.length >= 1 && value.title.length <= 160;
  if (!head(value.expectedHeadVersion)) return false;
  if (value.action === "activate") return exact(value, [...common, "expectedHeadVersion"]);
  if (value.action === "reconcile") return exact(value, [...common, "expectedHeadVersion", "state"])
    && ["draft", "retained"].includes(String(value.state));
  return value.action === "archive" && exact(value, [...common, "expectedHeadVersion", "preference"])
    && value.expectedHeadVersion > 0 && isPreferenceChoice(value.preference);
}

export function isCapacity(value: unknown): value is LifecycleCapacity {
  return record(value) && exact(value, ["draftCount", "draftLimit", "activeTripId", "activeLimit", "legacyCount"])
    && revision(value.draftCount) && value.draftCount <= 3 && value.draftLimit === 3
    && nullableUuid(value.activeTripId) && value.activeLimit === 1 && revision(value.legacyCount);
}
function isTrip(value: unknown): value is LifecycleTrip {
  if (!record(value) || !exact(value, ["tripId", "title", "headVersion", "state", "archivedVersion", "archivedAt"])
    || !uuid(value.tripId) || typeof value.title !== "string" || value.title.length < 1 || value.title.length > 160
    || !head(value.headVersion) || !LIFECYCLE_STATES.includes(value.state as LifecycleState)) return false;
  return value.state === "archived" ? head(value.archivedVersion) && value.archivedVersion > 0
    && value.archivedVersion === value.headVersion && date(value.archivedAt)
    : value.archivedVersion === null && value.archivedAt === null;
}
export function isLifecycleSnapshot(value: unknown): value is LifecycleSnapshot {
  if (!record(value) || !exact(value, ["version", "ownerId", "sessionId", "revision", "capacity", "trips", "nextTripId", "serviceStatus"])
    || value.version !== LIFECYCLE_VERSION || !uuid(value.ownerId) || !uuid(value.sessionId) || !revision(value.revision)
    || !isCapacity(value.capacity) || !Array.isArray(value.trips) || value.trips.length > 50 || !value.trips.every(isTrip)
    || new Set(value.trips.map(trip => trip.tripId)).size !== value.trips.length || !nullableUuid(value.nextTripId)
    || value.serviceStatus !== "unavailable") return false;
  const { trips, capacity } = value;
  return trips.every((trip, i) => (i === 0 || trips[i - 1].tripId < trip.tripId)
      && (trip.state === "active" ? trip.tripId === capacity.activeTripId && trip.headVersion > 0 : trip.tripId !== capacity.activeTripId))
    && trips.filter(trip => trip.state === "draft").length <= capacity.draftCount
    && trips.filter(trip => trip.state === "legacy").length <= capacity.legacyCount
    && (value.nextTripId === null || trips.length === 50 && value.nextTripId === trips.at(-1)?.tripId);
}
function isAppliedReceipt(value: unknown): value is LifecycleAppliedReceipt {
  if (!record(value) || !exact(value, ["status", "version", "ownerId", "sessionId", "operationId", "requestDigest", "action", "revision", "tripId", "state", "capacity", "archivedVersion", "archivedAt", "preference", "memoryRefs"])
    || value.status !== "applied" || value.version !== LIFECYCLE_VERSION || !uuid(value.ownerId) || !uuid(value.sessionId) || !uuid(value.operationId)
    || typeof value.requestDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.requestDigest)
    || !["create", "activate", "reconcile", "archive"].includes(String(value.action)) || !revision(value.revision) || value.revision < 1
    || !uuid(value.tripId) || !isCapacity(value.capacity) || !["draft", "active", "retained", "archived"].includes(String(value.state))) return false;
  if (value.action === "archive") {
    if (value.state !== "archived" || !head(value.archivedVersion) || value.archivedVersion < 1 || !date(value.archivedAt)) return false;
    return value.preference === "kept" ? isMemoryReferences(value.memoryRefs) && value.memoryRefs.length > 0
      : value.preference === "skipped" && isMemoryReferences(value.memoryRefs) && value.memoryRefs.length === 0;
  }
  return value.archivedVersion === null && value.archivedAt === null && value.preference === "not_requested"
    && isMemoryReferences(value.memoryRefs) && value.memoryRefs.length === 0
    && (value.action !== "create" || value.state === "draft") && (value.action !== "activate" || value.state === "active")
    && (value.action !== "reconcile" || ["draft", "retained"].includes(String(value.state)));
}
export function isLifecycleReceipt(value: unknown): value is LifecycleReceipt {
  if (isAppliedReceipt(value)) return true;
  return record(value) && exact(value, ["version", "ownerId", "sessionId", "operationId", "requestDigest", "action", "tripId", "status", "reason", "revision"])
    && value.version === LIFECYCLE_VERSION && uuid(value.ownerId) && uuid(value.sessionId) && uuid(value.operationId)
    && typeof value.requestDigest === "string" && /^[a-f0-9]{64}$/.test(value.requestDigest)
    && ["create", "activate", "reconcile", "archive"].includes(String(value.action)) && uuid(value.tripId)
    && value.status === "declined" && LIFECYCLE_DECLINES.includes(value.reason as typeof LIFECYCLE_DECLINES[number]) && revision(value.revision);
}
export function isLifecycleRecovery(value: unknown): value is LifecycleRecovery {
  return record(value) && exact(value, ["version", "ownerId", "sessionId", "operationId", "receipt"])
    && value.version === LIFECYCLE_VERSION && uuid(value.ownerId) && uuid(value.sessionId) && uuid(value.operationId)
    && (value.receipt === null || isLifecycleReceipt(value.receipt) && value.receipt.ownerId === value.ownerId
      && value.receipt.sessionId === value.sessionId && value.receipt.operationId === value.operationId);
}
