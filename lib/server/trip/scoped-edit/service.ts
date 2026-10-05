import type { TripPatch, TripSnapshot } from "../patch/contract.ts";
import { type ScopedEditRequest, record } from "./contract.ts";
import { parseScopedBindingRequired, parseScopedContext, parseScopedReceipt, parseScopedOperation, sameValue, type ScopedReply, type ScopedProposalReceipt, type ScopedOperation, type ScopedCandidatesReceipt } from "./wire.ts";
import { candidateScopedEditsPatch, previewScopedPatch, selectedItems } from "./candidate-guard.ts";
import { scopedEditDiff } from "./diff.ts";
export type ScopedEditRPC = (name: string, params: Readonly<Record<string, unknown>>) => Promise<{ data: unknown; error: { message: string } | null }>;
export class ScopedEditServiceError extends Error {}
const fail = (code: string): never => { throw new ScopedEditServiceError(code); };
const unavailable = (v: unknown): v is Extract<ScopedReply, { kind: "unavailable" }> => record(v) && Object.keys(v).length === 2 && v.kind === "unavailable" && ["stale_basis", "invalid_scope", "protected_item", "cancelled", "unsupported", "provider_unavailable"].includes(String(v.reason));
async function call(rpc: ScopedEditRPC, name: string, params: Readonly<Record<string, unknown>>) {
  const r = await rpc(name, params);
  if (r.error) fail(mappedError(r.error.message));
  return r.data;
}
export function mappedError(message: string): string {
  return /UNAUTHENTICATED|SESSION_REPLACED/.test(message) ? "UNAUTHENTICATED" : /FORBIDDEN|CONSENT_REQUIRED|DATA_POLICY_BLOCKED/.test(message) ? "FORBIDDEN" : /IDEMPOTENCY_KEY_REUSE/.test(message) ? "IDEMPOTENCY_KEY_REUSE" : /STALE_TRIP_VERSION|STALE_BASIS/.test(message) ? "STALE_TRIP_VERSION" : /INVALID_INPUT|INVALID_PATCH|INVALID_SCOPE/.test(message) ? "INVALID_INPUT" : "PROVIDER_UNAVAILABLE";
}
/** Stored procedure owns actor, CAS, locks, lifecycle and the sole Proposal producer.
 * Missing ACKs remain unknown; no transport failure authorizes replacement work. */
export async function runScopedEdit(tripId: string, input: ScopedEditRequest, rpc: ScopedEditRPC, snapshot: TripSnapshot, now: number): Promise<ScopedReply> {
  if (input.action === "context") {
    if (input.expectedHeadVersion !== snapshot.version) fail("STALE_TRIP_VERSION");
    try { selectedItems(snapshot, input.scope); } catch { fail("INVALID_INPUT"); }
    const raw = await call(rpc, "prepare_scoped_trip_edit_v1", { p_trip_id: tripId, p_input: { expectedHeadVersion: input.expectedHeadVersion, scope: input.scope, locale: input.locale, reservationBindings: input.reservationBindings ?? [] } });
    if (unavailable(raw)) return raw;
    const required = parseScopedBindingRequired(raw, tripId);
    if (required) { if (required.baseVersion !== snapshot.version || !sameValue(required.scope, input.scope)) fail("PROVIDER_UNAVAILABLE"); return required; }
    const context = parseScopedContext(raw, tripId, now);
    if (!context || !sameValue(context.scope, input.scope) || !sameValue(context.snapshot, snapshot)) fail("PROVIDER_UNAVAILABLE");
    return context!;
  }
  if (input.action === "read_operation") {
    const raw = await call(rpc, "read_scoped_trip_edit_operation_v1", { p_trip_id: tripId, p_operation_id: input.operationId });
    if (unavailable(raw)) return raw;
    return parseScopedOperation(raw, tripId, input.operationId) ?? fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
  }
  if (input.action === "abandon") {
    const raw = await call(rpc, "abandon_scoped_trip_edit_operation_v1", { p_trip_id: tripId, p_input: input });
    if (unavailable(raw)) return raw;
    if (!record(raw)) return fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
    if (Object.keys(raw).length !== 5 || raw.kind !== "scoped_edit_abandon/1" || raw.operationId !== input.operationId || raw.tripId !== tripId || !["cancelled", "committed"].includes(String(raw.state))) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
    const receipt = raw.receipt === null ? null : parseScopedReceipt(raw.receipt, tripId, input.operationId);
    if (raw.state === "cancelled" ? raw.receipt !== null : !receipt) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
    return raw as Extract<ScopedReply, { kind: "scoped_edit_abandon/1" }>;
  }
  const raw = await call(rpc, "submit_scoped_trip_edit_v1", { p_trip_id: tripId, p_input: input });
  if (unavailable(raw)) return raw;
  const receipt = parseScopedReceipt(raw, tripId, input.operationId);
  if (!receipt || input.action === "select_candidate" && receipt.kind !== "scoped_edit_proposal/1" || input.action === "manual" && receipt.kind !== "scoped_edit_proposal/1" || input.action === "ask" && !["scoped_edit_pending/1", "scoped_edit_candidates/1", "scoped_edit_declined/1"].includes(receipt.kind) || receipt.baseVersion !== input.basis.baseVersion || (receipt.kind === "scoped_edit_lock/1" ? input.action !== "lock" || receipt.itemId !== input.itemId || receipt.locked !== input.locked : receipt.contextId !== input.basis.contextId || receipt.contextDigest !== input.basis.contextDigest)) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
  const operationRaw = await call(rpc, "read_scoped_trip_edit_operation_v1", { p_trip_id: tripId, p_operation_id: input.operationId });
  const operation = parseScopedOperation(operationRaw, tripId, input.operationId);
  if (!operation || !sameValue(operation.mutation, input) || !operation.receipt || !sameValue({ ...operation.receipt, reused: true }, { ...receipt!, reused: true })) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
  return receipt!;
}
export function operationProposal(reply: ScopedReply): ScopedProposalReceipt | null {
  if (reply.kind === "scoped_edit_proposal/1") return reply;
  return reply.kind === "scoped_edit_operation/1" && reply.state === "pending" && reply.receipt?.kind === "scoped_edit_proposal/1" ? reply.receipt : null;
}
export type OriginalProposalRead = Readonly<{ id: string; revision: number; baseTripVersion: number; digest?: string; expiresAt: string; stale?: boolean; before?: TripSnapshot; after?: TripSnapshot; patch?: TripPatch }>;
export function assertOriginalScopedProposal(receipt: ScopedProposalReceipt, original: OriginalProposalRead, now: number): void {
  if (original.id !== receipt.proposalId || original.revision !== receipt.proposalRevision || original.baseTripVersion !== receipt.baseVersion || original.digest !== receipt.proposalDigest || original.stale || Date.parse(receipt.expiresAt) <= now || Date.parse(receipt.expiresAt) !== Date.parse(original.expiresAt) || !original.before || !original.after || !original.patch) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
  try {
    const next = previewScopedPatch(original.before!, original.patch!, { scope: receipt.returnScope, lockedItemIds: [], fixedItemIds: [] });
    if (!sameValue(next, original.after) || !sameValue(scopedEditDiff(original.before!, next), receipt.diff)) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
  } catch { fail("SCOPED_EDIT_RECEIPT_UNKNOWN"); }
}
export function appliedOperation(v: ScopedReply): v is ScopedOperation { return v.kind === "scoped_edit_operation/1" && v.state === "applied"; }

export function operationCandidates(reply: ScopedReply): ScopedCandidatesReceipt | null {
  if (reply.kind === "scoped_edit_candidates/1") return reply;
  return reply.kind === "scoped_edit_operation/1" && reply.state === "pending" && reply.receipt?.kind === "scoped_edit_candidates/1" ? reply.receipt : null;
}
export function assertScopedCandidates(receipt: ScopedCandidatesReceipt, snapshot: TripSnapshot, now: number): void {
  if (receipt.baseVersion !== snapshot.version || Date.parse(receipt.expiresAt) <= now) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
  try {
    for (const candidate of receipt.candidates) {
      const constraints = { scope: receipt.returnScope, lockedItemIds: [], fixedItemIds: [] };
      const patch = candidateScopedEditsPatch(snapshot, candidate.edits, constraints, { contextId: receipt.contextId, askOperationId: receipt.operationId, candidateId: candidate.candidateId }), next = previewScopedPatch(snapshot, patch, constraints);
      if (!sameValue(scopedEditDiff(snapshot, next), candidate.diff)) fail("SCOPED_EDIT_RECEIPT_UNKNOWN");
    }
  } catch { fail("SCOPED_EDIT_RECEIPT_UNKNOWN"); }
}
