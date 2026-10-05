import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isLifecycleCommand, isLifecycleSnapshot, isLifecycleReceipt, isLifecycleRecovery,
  LIFECYCLE_ERRORS, type LifecycleCommand, type LifecycleError, type LifecycleReceipt,
  type LifecycleRecovery, type LifecycleSnapshot,
} from "./contract.ts";

export type LifecycleResult<T> = Readonly<{ data: T }> | Readonly<{ error: LifecycleError }>;
export type LifecycleActor = Readonly<{ ownerId: string; sessionId?: string }>;
export type LifecycleRPC = (action: "read" | "execute" | "recover" | "abandon", input: Record<string, unknown>, bytes: string | null) => Promise<LifecycleResult<unknown>>;
export const lifecycleDigest = (bytes: string) => createHash("sha256").update(bytes, "utf8").digest("hex");
export const lifecycleError = (message: string): LifecycleError => LIFECYCLE_ERRORS.find(code => code === message) ?? "UNAVAILABLE";

export function receiptMatches(value: LifecycleReceipt, actor: LifecycleActor, input: LifecycleCommand, bytes: string): boolean {
  if (value.ownerId !== actor.ownerId || value.sessionId !== input.expectedSessionId || actor.sessionId && value.sessionId !== actor.sessionId
    || value.operationId !== input.operationId || value.tripId !== input.tripId || value.action !== input.action || value.requestDigest !== lifecycleDigest(bytes)) return false;
  if (value.status === "declined") return true;
  if (value.revision <= input.expectedRevision) return false;
  if (input.action === "activate") return value.state === "active" && value.capacity.activeTripId === input.tripId;
  if (input.action === "reconcile") return value.state === input.state;
  if (input.action === "archive") return value.archivedVersion === input.expectedHeadVersion && value.capacity.activeTripId !== input.tripId
    && (input.preference.action === "skip" ? value.preference === "skipped" && value.memoryRefs.length === 0
      : value.preference === "kept" && value.memoryRefs.length === input.preference.memoryRefs.length
        && value.memoryRefs.every((ref, i) => {
          const selected = input.preference.action === "keep" ? input.preference.memoryRefs[i] : null;
          return selected && ref.memoryId === selected.memoryId && ref.revision === selected.revision
            && ref.sourceReceiptId === selected.sourceReceiptId && ref.consentId === selected.consentId;
        }));
  return value.state === "draft" && value.capacity.activeTripId === input.expectedActiveTripId;
}

/** No synthetic state or second content writer. SQL owns transitions and replay. */
export function lifecycleOperations(rpc: LifecycleRPC, authenticated: () => Promise<LifecycleResult<LifecycleActor>>) {
  const bound = (value: { ownerId: string; sessionId: string }, actor: LifecycleActor) => value.ownerId === actor.ownerId
    && (!actor.sessionId || value.sessionId === actor.sessionId);
  return {
    async readLifecycle(input: Record<string, unknown> = {}): Promise<LifecycleResult<LifecycleSnapshot>> {
      const actor = await authenticated(); if ("error" in actor) return actor;
      const result = await rpc("read", input, null); if ("error" in result) return result;
      const current = await authenticated(); if ("error" in current) return current;
      return isLifecycleSnapshot(result.data) && bound(result.data, actor.data) && bound(result.data, current.data)
        && (input.expectedRevision === undefined || result.data.revision === input.expectedRevision)
        && (input.afterTripId === undefined || result.data.trips.every(trip => trip.tripId > String(input.afterTripId)))
        ? { data: result.data } : { error: "UNAVAILABLE" };
    },
    async mutateLifecycle(input: LifecycleCommand, bytes: string, abandon = false): Promise<LifecycleResult<LifecycleReceipt>> {
      if (!isLifecycleCommand(input) || Buffer.byteLength(bytes, "utf8") > 32768) return { error: "INVALID_INPUT" };
      // Never quietly replace the caller's bytes with a JSON.stringify rendering.
      try { if (JSON.stringify(JSON.parse(bytes)) !== JSON.stringify(input)) return { error: "INVALID_INPUT" }; }
      catch { return { error: "INVALID_INPUT" }; }
      const actor = await authenticated(); if ("error" in actor) return actor;
      if (actor.data.sessionId && actor.data.sessionId !== input.expectedSessionId) return { error: "SESSION_REPLACED" };
      const result = await rpc(abandon ? "abandon" : "execute", input, bytes); if ("error" in result) return result;
      const current = await authenticated(); if ("error" in current) return current;
      return isLifecycleReceipt(result.data) && receiptMatches(result.data, actor.data, input, bytes)
        && bound(result.data, current.data) ? { data: result.data } : { error: "UNAVAILABLE" };
    },
    async recoverLifecycle(operationId: string): Promise<LifecycleResult<LifecycleRecovery>> {
      const actor = await authenticated(); if ("error" in actor) return actor;
      const result = await rpc("recover", { operationId }, null); if ("error" in result) return result;
      const current = await authenticated(); if ("error" in current) return current;
      return isLifecycleRecovery(result.data) && result.data.operationId === operationId && bound(result.data, actor.data) && bound(result.data, current.data)
        ? { data: result.data } : { error: "UNAVAILABLE" };
    },
  };
}

export function tripLifecycleOperations(client: SupabaseClient, authenticated: () => Promise<Readonly<{ data: string }> | Readonly<{ error: string }>>, signal?: AbortSignal) {
  const rpc: LifecycleRPC = async (action, input, bytes) => {
    const request = client.rpc("trip_lifecycle_v1", { p_action: action, p_input: input, p_request_bytes: bytes });
    const result = await (signal ? request.abortSignal(signal) : request);
    return result.error ? { error: lifecycleError(result.error.message) } : { data: result.data };
  };
  // Web cookie adapter already verified claims. SQL revalidates actual auth/session;
  // a second SQL read fences revocation after a write/recovery before emitting it.
  const actor = async (): Promise<LifecycleResult<LifecycleActor>> => {
    const verified = await authenticated();
    if ("error" in verified) return { error: lifecycleError(verified.error) };
    const state = await rpc("read", {}, null);
    if ("error" in state) return state;
    return isLifecycleSnapshot(state.data) && state.data.ownerId === verified.data
      ? { data: { ownerId: verified.data, sessionId: state.data.sessionId } } : { error: "UNAVAILABLE" };
  };
  return lifecycleOperations(rpc, actor);
}
