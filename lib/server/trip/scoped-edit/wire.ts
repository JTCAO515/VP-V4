import { parseReservationCurrent, type ReservationCurrent } from "../../reservations/contract.ts";
import type { TripSnapshot, TripItem } from "../patch/contract.ts";
import { type EditScope, type ScopedEditRequest, record, exact, integer, ids, identifier, uuid, digest, validScope, parseScopedEditRequest } from "./contract.ts";
import { assertTripSnapshot } from "../patch/contract.ts";
export type SourceBasis = Readonly<{
  profileUpdatedAt: string | null; memoryBasisDigest: string; reservationBasisDigest: string; sourceDigest: string; lockRevision: number;
  fixedBindings: readonly Readonly<{ itemId: string; sourceKind: "user_confirmed_reservation"; referenceId: string; referenceRevision: number }>[];
}>;
export type ScopedEditContext = Readonly<{
  kind: "scoped_edit_context/1"; contextId: string; contextDigest: string; tripId: string; baseVersion: number; scope: EditScope; snapshot: TripSnapshot;
  orderedItemIdsByDay: readonly Readonly<{ dayId: string; itemIds: readonly string[] }>[]; lockedItemIds: readonly string[]; fixedItemIds: readonly string[]; sourceBasis: SourceBasis; expiresAt: string;
}>;
export type ScopedEditDiff = Readonly<{
  changes: readonly Readonly<{ kind: "added" | "removed" | "moved" | "changed" | "reordered"; itemId: string; before: TripItem | null; after: TripItem | null }>[];
  preservedItemIds: readonly string[]; transferImpact: "pending"; walkingImprovement: "unverified"; externalOrderEffect: "none";
}>;
export type ScopedProposalReceipt = Readonly<{
  kind: "scoped_edit_proposal/1"; operationId: string; tripId: string; contextId: string; contextDigest: string; proposalId: string; proposalRevision: number;
  proposalDigest: string; baseVersion: number; expiresAt: string; returnScope: EditScope; diff: ScopedEditDiff; reused: boolean;
}>;
export type ScopedLockReceipt = Readonly<{ kind: "scoped_edit_lock/1"; operationId: string; tripId: string; baseVersion: number; lockRevision: number; itemId: string; locked: boolean; reused: boolean }>;
export type ScopedPendingReceipt = Readonly<{ kind: "scoped_edit_pending/1"; operationId: string; tripId: string; contextId: string; contextDigest: string; baseVersion: number; reason: "provider_unavailable" | "queued"; reused: boolean }>;
export type ScopedReceipt = ScopedProposalReceipt | ScopedLockReceipt | ScopedPendingReceipt;
export type ScopedOperation = Readonly<{
  kind: "scoped_edit_operation/1"; operationId: string; tripId: string; mutation: ScopedEditRequest | null; receipt: ScopedReceipt | null;
  state: "pending" | "applied" | "rejected" | "cancelled" | "expired" | "stale" | "unknown"; resultingVersion: number | null;
}>;
export type ScopedUnavailable = Readonly<{ kind: "unavailable"; reason: "stale_basis" | "invalid_scope" | "protected_item" | "cancelled" | "unsupported" | "provider_unavailable" }>;
export type ScopedAbandonReceipt = Readonly<{ kind: "scoped_edit_abandon/1"; operationId: string; tripId: string; state: "cancelled" | "committed"; receipt: ScopedReceipt | null }>;
export type ScopedBindingRequired = Readonly<{ kind: "scoped_edit_binding_required/1"; tripId: string; baseVersion: number; scope: EditScope; reservations: readonly ReservationCurrent[] }>;
export type ScopedReply = ScopedBindingRequired | ScopedEditContext | ScopedReceipt | ScopedOperation | ScopedUnavailable | ScopedAbandonReceipt;
export const proposalDigest = (v: unknown): v is string => typeof v === "string" && /^trip-v2:[a-f0-9]{64}$/.test(v);
export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a, sorted) === JSON.stringify(b, sorted);
function sorted(_key: string, v: unknown) { return record(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v; }
const time = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
export function parseScopedContext(v: unknown, tripId: string, now: number): ScopedEditContext | null {
  if (!record(v) || !exact(v, ["kind", "contextId", "contextDigest", "tripId", "baseVersion", "scope", "snapshot", "orderedItemIdsByDay", "lockedItemIds", "fixedItemIds", "sourceBasis", "expiresAt"]) || v.kind !== "scoped_edit_context/1" || !uuid(v.contextId) || !digest(v.contextDigest) || v.tripId !== tripId || !integer(v.baseVersion) || !validScope(v.scope) || !ids(v.lockedItemIds, 0, 500) || !ids(v.fixedItemIds, 0, 500) || !time(v.expiresAt) || Date.parse(v.expiresAt) <= now || Date.parse(v.expiresAt) > now + 600000 || !record(v.sourceBasis)) return null;
  try { assertTripSnapshot(v.snapshot); } catch { return null; }
  const snapshot = v.snapshot;
  if (snapshot.version !== v.baseVersion || snapshot.days.length > 366 || snapshot.days.reduce((n, d) => n + (d.items?.length ?? 0), 0) > 500) return null;
  const items = snapshot.days.flatMap(d => d.items ?? []), source = v.sourceBasis;
  if ([...v.lockedItemIds, ...v.fixedItemIds].some(id => !items.some(i => i.id === id)) || !exact(source, ["profileUpdatedAt", "memoryBasisDigest", "reservationBasisDigest", "sourceDigest", "lockRevision", "fixedBindings"]) || !(source.profileUpdatedAt === null || time(source.profileUpdatedAt)) || ![source.memoryBasisDigest, source.reservationBasisDigest, source.sourceDigest].every(digest) || !integer(source.lockRevision) || !Array.isArray(source.fixedBindings) || source.fixedBindings.length > 500) return null;
  if (source.fixedBindings.some(b => !record(b) || !exact(b, ["itemId", "sourceKind", "referenceId", "referenceRevision"]) || !identifier(b.itemId) || b.sourceKind !== "user_confirmed_reservation" || !uuid(b.referenceId) || !integer(b.referenceRevision, 1))) return null;
  if (!sameValue([...new Set(source.fixedBindings.map(b => (b as Record<string, unknown>).itemId))].sort(), [...v.fixedItemIds].sort())) return null;
  if (!Array.isArray(v.orderedItemIdsByDay) || v.orderedItemIdsByDay.length !== snapshot.days.length || v.orderedItemIdsByDay.some((o, index) => !record(o) || !exact(o, ["dayId", "itemIds"]) || o.dayId !== snapshot.days[index].id || !sameValue(o.itemIds, (snapshot.days[index].items ?? []).map(i => i.id)))) return null;
  return v as ScopedEditContext;
}
function validDiff(v: unknown): v is ScopedEditDiff {
  if (!record(v) || !exact(v, ["changes", "preservedItemIds", "transferImpact", "walkingImprovement", "externalOrderEffect"]) || !Array.isArray(v.changes) || v.changes.length > 500 || !ids(v.preservedItemIds, 0, 500) || v.transferImpact !== "pending" || v.walkingImprovement !== "unverified" || v.externalOrderEffect !== "none") return false;
  return v.changes.every(c => record(c) && exact(c, ["kind", "itemId", "before", "after"]) && ["added", "removed", "moved", "changed", "reordered"].includes(String(c.kind)) && identifier(c.itemId) && [c.before, c.after].every(i => i === null || validItem(i, c.itemId as string)));
}
function validItem(v: unknown, id: string): boolean {
  if (!record(v) || v.id !== id || !identifier(v.dayId)) return false;
  try { assertTripSnapshot({ version: 0, title: "validation", days: [{ id: v.dayId, date: "2026-01-01", items: [v] }] }); return true; } catch { return false; }
}
export function parseScopedReceipt(v: unknown, tripId: string, operationId: string): ScopedReceipt | null {
  if (!record(v) || v.tripId !== tripId || v.operationId !== operationId || typeof v.reused !== "boolean" || !integer(v.baseVersion)) return null;
  if (v.kind === "scoped_edit_lock/1") return exact(v, ["kind", "operationId", "tripId", "baseVersion", "lockRevision", "itemId", "locked", "reused"]) && integer(v.lockRevision) && identifier(v.itemId) && typeof v.locked === "boolean" ? v as ScopedLockReceipt : null;
  if (!uuid(v.contextId) || !digest(v.contextDigest)) return null;
  if (v.kind === "scoped_edit_pending/1") return exact(v, ["kind", "operationId", "tripId", "contextId", "contextDigest", "baseVersion", "reason", "reused"]) && ["provider_unavailable", "queued"].includes(String(v.reason)) ? v as ScopedPendingReceipt : null;
  return v.kind === "scoped_edit_proposal/1" && exact(v, ["kind", "operationId", "tripId", "contextId", "contextDigest", "proposalId", "proposalRevision", "proposalDigest", "baseVersion", "expiresAt", "returnScope", "diff", "reused"]) && uuid(v.proposalId) && integer(v.proposalRevision, 1) && proposalDigest(v.proposalDigest) && time(v.expiresAt) && validScope(v.returnScope) && validDiff(v.diff) ? v as ScopedProposalReceipt : null;
}
export function parseScopedOperation(v: unknown, tripId: string, operationId: string): ScopedOperation | null {
  if (!record(v) || !exact(v, ["kind", "operationId", "tripId", "mutation", "receipt", "state", "resultingVersion"]) || v.kind !== "scoped_edit_operation/1" || v.tripId !== tripId || v.operationId !== operationId || !["pending", "applied", "rejected", "cancelled", "expired", "stale", "unknown"].includes(String(v.state)) || !(v.resultingVersion === null || integer(v.resultingVersion, 1))) return null;
  const mutation = v.mutation === null ? null : parseScopedEditRequest(v.mutation), receipt = v.receipt === null ? null : parseScopedReceipt(v.receipt, tripId, operationId);
  if (v.mutation !== null && (!mutation || !["manual", "ask", "lock"].includes(mutation.action) || !("operationId" in mutation) || mutation.operationId !== operationId) || v.receipt !== null && !receipt || (v.state === "applied") !== (v.resultingVersion !== null) || v.state === "unknown" && (mutation !== null || receipt !== null) || v.state === "pending" && !receipt) return null;
  return v as ScopedOperation;
}

export function parseScopedBindingRequired(v: unknown, tripId: string): ScopedBindingRequired | null {
  if (!record(v) || !exact(v, ["kind", "tripId", "baseVersion", "scope", "reservations"]) || v.kind !== "scoped_edit_binding_required/1" || v.tripId !== tripId || !integer(v.baseVersion) || !validScope(v.scope) || !Array.isArray(v.reservations) || v.reservations.length < 1 || v.reservations.length > 100 || v.reservations.some(r => !parseReservationCurrent(r) || r.tripId !== tripId || r.tripVersion !== v.baseVersion || !["reserved", "amended"].includes(r.fields.status))) return null;
  return v as ScopedBindingRequired;
}
