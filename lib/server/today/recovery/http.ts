import { NextResponse, type NextRequest } from "next/server.js";
import { createNativeTripDataAdapter, createUserDataAdapter } from "../../identity/user-data-adapter.ts";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { createOfflineNativeAuthority } from "../offline-native-authority.ts";
import { opsRuntimeConfig } from "../../knowledge/review/local-workspace.ts";
import { isUuid, hasSameOrigin } from "../../identity/request-guards.ts";
import { timestamp } from "../../readiness/contract.ts";
import { parseRecoveryHTTPInput } from "./contract.ts";
import { localRecoveryCandidates } from "./preview.ts";
import { prepareLocalRecovery, prepareTransportRecovery, submitLocalRecovery, readLocalRecoveryOperation, RecoveryServiceError, sameRecoveryValue, type RecoveryRPC } from "./service.ts";

/** Ordinary user APIs only. No model, Maps request, inferred scope, or second Trip writer. */
export async function localRecoveryHTTP(request: NextRequest, tripId: string, native: boolean) {
  const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: native ? "Authorization" : "Cookie" } });
  let dispatchedOperation: string | null = null;
  const fail = (code: string, status = 503) => response({ error: { code }, ...(dispatchedOperation ? { operationId: dispatchedOperation, acknowledgement: "unknown", recoveryAction: "read_original_operation" } : {}) }, status);
  if (request.method !== "POST" || !isUuid(tripId) || request.nextUrl.searchParams.size
    || (native ? request.headers.has("cookie") || request.headers.has("origin") : request.headers.has("authorization") || !hasSameOrigin(request.headers.get("origin"), request.nextUrl))) return fail("INVALID_INPUT", 400);
  const config = native ? getNativeRuntimeConfig(request, "trip", "trip") : opsRuntimeConfig(request, { ...process.env, OPS_LOCAL_REVIEW: process.env.KNOWLEDGE_LOCAL_READ, OPS_STAGING_REVIEW: process.env.KNOWLEDGE_STAGING_READ });
  if (!config) return fail("RECOVERY_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  try { return await scope.run(async () => {
    const raw = await scope.body(request, 24576); let value: unknown;
    try { value = JSON.parse(raw ?? "null"); } catch { return fail("INVALID_INPUT", 400); }
    const input = parseRecoveryHTTPInput(value); if (!input) return fail("INVALID_INPUT", 400);
    if (input.operation === "receipt") dispatchedOperation = input.operationId;
    tripId = tripId.toLowerCase();
    const web = native ? null : createUserDataAdapter(request, config, scope.fetch);
    const adapter = native ? await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable) : web;
    if (!adapter) return fail("UNAUTHENTICATED", 401);
    const actor = await adapter.authenticated(); scope.check();
    if ("error" in actor) return fail(actor.error, 401);
    const credentials = native ? await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable) : null;
    const authority = native ? await createOfflineNativeAuthority(request, config, scope.fetch, scope.unavailable) : null;
    const initial = authority ? await authority.read() : null; scope.check();
    if (native && (!credentials || !initial)) return fail("UNAUTHENTICATED", 401);
    if (initial && "error" in initial) return fail(initial.error, initial.error === "UNAUTHENTICATED" ? 401 : 503);
    const rpc: RecoveryRPC = async (name, params) => {
      if (credentials) { const r = await credentials.client.rpc(name, params).abortSignal(scope.signal); scope.check(); return { data: r.data as unknown, error: r.error }; }
      if (!web) throw new RecoveryServiceError("UNAUTHENTICATED");
      const r = await web.runGroundedAiAssist(call => call(name, params)); scope.check();
      if ("error" in r) throw new RecoveryServiceError(r.error); return r.data;
    };
    const before = await adapter.getTrip(tripId); scope.check();
    if ("error" in before) return fail(before.error, before.error === "FORBIDDEN" ? 403 : 503);
    const archive = "readArchive" in adapter ? await adapter.readArchive(tripId) : { data: null }; scope.check();
    if ("error" in archive || archive.data) return fail("FORBIDDEN", 403);
    const snapshot = { version: before.data.trip.headVersion, title: before.data.trip.title, days: before.data.content.days };
    let data: unknown;
    if (input.operation === "transport" && !("input" in input)) {
      if (input.expectedHeadVersion !== snapshot.version || !snapshot.days.some(d => d.id === input.dayId && d.items.some(i => i.id === input.itemId))) return fail("STALE_TRIP_VERSION", 409);
      data = { kind: "local_recovery/1", status: "pending", reason: "TRANSPORT_RECEIPT_READER_UNAVAILABLE", tripId, baseVersion: snapshot.version,
        receiptId: input.receiptId, candidates: [], tripMutation: "none", providerCalls: 0,
        navigation: { action: "open_existing_trip", tripId }, officialChannel: { status: "unavailable", reason: "NO_QUALIFIED_OFFICIAL_CHANNEL" } };
    } else if (input.operation === "preview" || input.operation === "transport") {
      if (input.input.expectedHeadVersion !== snapshot.version) return fail("STALE_TRIP_VERSION", 409);
      if (input.operation === "transport" && (input.input.scope.tripId !== tripId || !snapshot.days.some(d => d.id === input.input.scope.dayId && d.items.some(i => i.id === input.input.scope.itemId)))) return fail("INVALID_INPUT", 400);
      const profile = await adapter.getUserProfile(); scope.check();
      const prepare = () => input.operation === "preview" ? prepareLocalRecovery(tripId, input.input, rpc) : prepareTransportRecovery(tripId, input.input, rpc);
      try {
        const context = await prepare(); scope.check();
        data = localRecoveryCandidates(snapshot, input.input, { complete: true, reservations: context.reservationBasis }, profile, Date.now(), context);
        const fresh = await prepare(); scope.check();
        if (!sameRecoveryValue(context, fresh)) return fail("RECOVERY_STALE", 409);
      } catch (error) {
        if (error instanceof RecoveryServiceError && error.message !== "UNAUTHENTICATED" && error.message !== "FORBIDDEN" && error.message !== "INVALID_INPUT" && error.message !== "RECOVERY_CONFLICT") {
          data = { ...localRecoveryCandidates(snapshot, input.input, { complete: false, reservations: [] }, profile, Date.now(), null), tripId,
            reason: error.message, navigation: { action: "open_existing_trip", tripId } };
        } else throw error;
      }
      const currentProfile = await adapter.getUserProfile(); scope.check();
      if (!sameRecoveryValue(profile, currentProfile)) return fail("RECOVERY_STALE", 409);
    } else {
      let selected = null;
      if (input.operation === "select") {
        dispatchedOperation = input.input.operationId;
        selected = await submitLocalRecovery(tripId, input.input, rpc); scope.check();
      }
      const operationId = input.operation === "select" ? input.input.operationId : input.operationId;
      const operation = await readLocalRecoveryOperation(tripId, operationId, rpc); scope.check();
      if (selected && (!sameRecoveryValue({ ...selected, reused: true }, { ...operation.receipt, reused: true }) || !sameRecoveryValue(input.operation === "select" ? input.input : null, operation.input))) throw new RecoveryServiceError("RECOVERY_RECEIPT_UNKNOWN");
      if (operation.state === "pending") {
        const original = await adapter.getPendingProposal(tripId, operation.receipt.proposalId); scope.check();
        if ("error" in original) throw new RecoveryServiceError("RECOVERY_RECEIPT_UNKNOWN");
        const p = original.data.proposal, r = operation.receipt;
        if (p.id !== r.proposalId || p.revision !== r.proposalRevision || p.baseTripVersion !== r.baseVersion || p.stale || !p.digest || !p.patch
          || timestamp(p.expiresAt) !== timestamp(r.expiresAt) || timestamp(r.expiresAt)! <= Date.now()
          || p.patch.operations.some(o => o.kind !== "delete_item")) throw new RecoveryServiceError("RECOVERY_RECEIPT_UNKNOWN");
        data = { kind: "local_recovery_selected/1", operation, proposal: p, tripMutation: "none", nextAction: "review_original_proposal_and_confirm" };
      } else data = { kind: "local_recovery_recovered/1", operation, tripMutation: operation.state === "applied" ? "original_proposal_applied" : "none" };
    }
    const latest = await adapter.getTrip(tripId); scope.check();
    if ("error" in latest || !sameRecoveryValue(before.data.trip, latest.data.trip) || !sameRecoveryValue(before.data.content, latest.data.content)) return fail(dispatchedOperation ? "RECOVERY_RECEIPT_UNKNOWN" : "RECOVERY_STALE", dispatchedOperation ? 503 : 409);
    const finalArchive = "readArchive" in adapter ? await adapter.readArchive(tripId) : { data: null }; scope.check();
    if ("error" in finalArchive || finalArchive.data) return fail("FORBIDDEN", 403);
    const current = await adapter.authenticated(); scope.check();
    if ("error" in current || current.data !== actor.data) return fail("UNAUTHENTICATED", 401);
    if (authority && initial && !("error" in initial)) {
      const final = await authority.read(); scope.check();
      if ("error" in final || !sameRecoveryValue(final.data, initial.data)) return fail("UNAUTHENTICATED", 401);
    }
    const reply = response({ data }); return web ? web.applyCookies(reply) : reply;
  }); } catch (error) {
    const code = error instanceof Error ? error.message : "RECOVERY_UNAVAILABLE";
    if (code === "UNAUTHENTICATED" || code === "SESSION_REPLACED") return fail("UNAUTHENTICATED", 401);
    if (code === "FORBIDDEN") return fail(code, 403);
    if (code === "INVALID_INPUT") return fail(code, 400);
    if (code === "RECOVERY_CONFLICT" || code === "RECOVERY_STALE") return fail(code, 409);
    return fail(dispatchedOperation ? "RECOVERY_RECEIPT_UNKNOWN" : "RECOVERY_UNAVAILABLE");
  } finally { scope.dispose(); }
}
