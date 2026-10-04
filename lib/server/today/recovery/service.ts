import { record, timestamp } from "../../readiness/contract.ts";
import { exact, uuid, hash, integer, parseRecoveryInput, parseRecoverySelection, type RecoveryInput, type RecoverySelection } from "./contract.ts";
import type { RecoveryContext, ReservationBasis } from "./preview.ts";

export type RecoveryRPC = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export class RecoveryServiceError extends Error {}
export function canonicalRecovery(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalRecovery).join(",")}]`;
  if (record(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalRecovery(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
export const sameRecoveryValue = (a: unknown, b: unknown) => canonicalRecovery(a) === canonicalRecovery(b);
function isReservationBasis(v: unknown): v is ReservationBasis {
  return record(v) && exact(v, ["referenceId", "revision", "contentDigest", "status", "evidenceTier"]) && uuid(v.referenceId) && integer(v.revision, 1)
    && hash(v.contentDigest) && ["reserved", "amended", "cancelled", "unknown"].includes(v.status as string)
    && ["user_reported", "artifact_confirmed", "provider_verified"].includes(v.evidenceTier as string);
}
function denial(v: unknown) {
  if (!record(v)) return;
  if (exact(v, ["kind", "reason"]) && v.kind === "pending" && typeof v.reason === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(v.reason)) throw new RecoveryServiceError(v.reason);
  if (exact(v, ["kind"]) && ["conflict", "stale", "unavailable"].includes(v.kind as string)) throw new RecoveryServiceError(v.kind === "conflict" ? "RECOVERY_CONFLICT" : v.kind === "stale" ? "RECOVERY_STALE" : "RECOVERY_UNAVAILABLE");
}
function rpcError(error: unknown, uncertain: boolean): never {
  const message = record(error) && typeof error.message === "string" ? error.message : "";
  if (/\b(UNAUTHENTICATED|SESSION_REPLACED)\b/.test(message)) throw new RecoveryServiceError("UNAUTHENTICATED");
  if (/\bFORBIDDEN\b/.test(message)) throw new RecoveryServiceError("FORBIDDEN");
  if (/\bINVALID_INPUT\b/.test(message)) throw new RecoveryServiceError("INVALID_INPUT");
  throw new RecoveryServiceError(uncertain ? "RECOVERY_RECEIPT_UNKNOWN" : "RECOVERY_UNAVAILABLE");
}
export async function prepareLocalRecovery(tripId: string, input: RecoveryInput, rpc: RecoveryRPC): Promise<RecoveryContext> {
  const r = await rpc("prepare_local_recovery_v1", { p_trip_id: tripId, p_input: input });
  if (r.error) rpcError(r.error, false); denial(r.data);
  const v = r.data;
  if (!record(v) || !exact(v, ["kind", "contextId", "contextDigest", "tripId", "baseVersion", "expiresAt", "profileBasis", "reservationBasis", "input"])
    || v.kind !== "local_recovery_context/1" || !uuid(v.contextId) || !hash(v.contextDigest) || v.tripId !== tripId || v.baseVersion !== input.expectedHeadVersion
    || timestamp(v.expiresAt) === null || !record(v.profileBasis) || !exact(v.profileBasis, ["travelPace", "updatedAt"])
    || !(v.profileBasis.travelPace === null || ["relaxed", "balanced", "packed"].includes(v.profileBasis.travelPace as string))
    || !(v.profileBasis.updatedAt === null || timestamp(v.profileBasis.updatedAt) !== null)
    || !Array.isArray(v.reservationBasis) || v.reservationBasis.length > 100 || !v.reservationBasis.every(isReservationBasis)
    || new Set(v.reservationBasis.map(b => b.referenceId)).size !== v.reservationBasis.length
    || !parseRecoveryInput(v.input) || !sameRecoveryValue(v.input, input)) throw new RecoveryServiceError("RECOVERY_UNAVAILABLE");
  return structuredClone(v) as RecoveryContext;
}
export type RecoveryProposalReceipt = {
  kind: "local_recovery_proposal/1"; operationId: string; contextId: string; contextDigest: string; candidateId: RecoverySelection["candidateId"];
  proposalId: string; proposalRevision: number; baseVersion: number; expiresAt: string; reused: boolean;
};
function parseReceipt(v: unknown, input: RecoverySelection): RecoveryProposalReceipt | null {
  return record(v) && exact(v, ["kind", "operationId", "contextId", "contextDigest", "candidateId", "proposalId", "proposalRevision", "baseVersion", "expiresAt", "reused"])
    && v.kind === "local_recovery_proposal/1" && v.operationId === input.operationId && v.contextId === input.contextId && v.contextDigest === input.contextDigest && v.candidateId === input.candidateId
    && uuid(v.proposalId) && integer(v.proposalRevision, 1) && integer(v.baseVersion) && timestamp(v.expiresAt) !== null && typeof v.reused === "boolean" ? structuredClone(v) as RecoveryProposalReceipt : null;
}
export async function submitLocalRecovery(tripId: string, input: RecoverySelection, rpc: RecoveryRPC) {
  const r = await rpc("submit_local_recovery_v1", { p_trip_id: tripId, p_input: input });
  if (r.error) rpcError(r.error, true); denial(r.data);
  const receipt = parseReceipt(r.data, input); if (!receipt) throw new RecoveryServiceError("RECOVERY_RECEIPT_UNKNOWN"); return receipt;
}
export type RecoveryOperationReceipt = {
  kind: "local_recovery_operation/1"; operationId: string; tripId: string; input: RecoverySelection; receipt: RecoveryProposalReceipt;
  state: "pending" | "applied" | "rejected" | "expired" | "stale"; resultingVersion: number | null;
};
export async function readLocalRecoveryOperation(tripId: string, operationId: string, rpc: RecoveryRPC): Promise<RecoveryOperationReceipt> {
  const r = await rpc("read_local_recovery_operation_v1", { p_trip_id: tripId, p_operation_id: operationId });
  if (r.error) rpcError(r.error, true); denial(r.data);
  const v = r.data;
  const input = record(v) ? parseRecoverySelection(v.input) : null;
  if (!record(v) || !exact(v, ["kind", "operationId", "tripId", "input", "receipt", "state", "resultingVersion"])
    || v.kind !== "local_recovery_operation/1" || v.operationId !== operationId || v.tripId !== tripId
    || !input || input.operationId !== operationId || !parseReceipt(v.receipt, input)
    || !["pending", "applied", "rejected", "expired", "stale"].includes(v.state as string)
    || (v.state === "applied" ? !integer(v.resultingVersion, 1) || v.resultingVersion !== (v.receipt as RecoveryProposalReceipt).baseVersion + 1 : v.resultingVersion !== null)) throw new RecoveryServiceError("RECOVERY_RECEIPT_UNKNOWN");
  return structuredClone(v) as RecoveryOperationReceipt;
}
