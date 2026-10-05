import { NextResponse, type NextRequest } from "next/server.js";
import { createNativeTripDataAdapter, createUserDataAdapter } from "../../identity/user-data-adapter.ts";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { createOfflineNativeAuthority } from "../../today/offline-native-authority.ts";
import { opsRuntimeConfig } from "../../knowledge/review/local-workspace.ts";
import { hasSameOrigin, isUuid } from "../../identity/request-guards.ts";
import { parseScopedEditRequest } from "./contract.ts";
import { sameValue } from "./wire.ts";
import { runScopedEdit, operationProposal, assertOriginalScopedProposal, ScopedEditServiceError, type ScopedEditRPC } from "./service.ts";

/** Ordinary caller-bound actor/RLS transport. No API request dispatches a model or
 * confirms a Proposal; worker publication and the existing confirm own those effects. */
export async function scopedTripEditHTTP(request: NextRequest, tripId: string, native: boolean) {
  let dispatchedOperation: string | null = null;
  const reply = (v: unknown, status = 200) => NextResponse.json(v, { status, headers: { "Cache-Control": "private, no-store", Vary: native ? "Authorization" : "Cookie" } });
  const failure = (code: string, status = 503) => reply({ error: { code }, ...(dispatchedOperation ? { operationId: dispatchedOperation, acknowledgement: "unknown", recoveryAction: "read_original_operation" } : {}) }, status);
  if (request.method !== "POST" || !isUuid(tripId) || request.nextUrl.searchParams.size || (native ? request.headers.has("cookie") || request.headers.has("origin") : request.headers.has("authorization") || !hasSameOrigin(request.headers.get("origin"), request.nextUrl))) return failure("INVALID_INPUT", 400);
  const config = native ? getNativeRuntimeConfig(request, "trip", "trip") : opsRuntimeConfig(request, { ...process.env, OPS_LOCAL_REVIEW: process.env.KNOWLEDGE_LOCAL_READ, OPS_STAGING_REVIEW: process.env.KNOWLEDGE_STAGING_READ });
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal, 15000);
  try { return await scope.run(async () => {
    const raw = await scope.body(request, 24576); let parsed: unknown;
    try { parsed = JSON.parse(raw ?? "null"); } catch { return failure("INVALID_INPUT", 400); }
    const input = parseScopedEditRequest(parsed); if (!input) return failure("INVALID_INPUT", 400);
    tripId = tripId.toLowerCase();
    const web = native ? null : createUserDataAdapter(request, config, scope.fetch);
    const adapter = native ? await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable) : web;
    if (!adapter) return failure("UNAUTHENTICATED", 401);
    const actor = await adapter.authenticated(); scope.check();
    if ("error" in actor) return failure(actor.error, actor.error === "UNAUTHENTICATED" ? 401 : 503);
    const credentials = native ? await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable) : null;
    const authority = native ? await createOfflineNativeAuthority(request, config, scope.fetch, scope.unavailable) : null;
    const initial = authority ? await authority.read() : null; scope.check();
    if (native && (!credentials || !initial)) return failure("UNAUTHENTICATED", 401);
    if (initial && "error" in initial) return failure(initial.error, initial.error === "UNAUTHENTICATED" ? 401 : 503);
    const rpc: ScopedEditRPC = async (name, params) => {
      if (credentials) { const r = await credentials.client.rpc(name, params).abortSignal(scope.signal); scope.check(); return { data: r.data as unknown, error: r.error }; }
      if (!web) throw new ScopedEditServiceError("UNAUTHENTICATED");
      const r = await web.runGroundedAiAssist(call => call(name, params)); scope.check();
      if ("error" in r) throw new ScopedEditServiceError(r.error);
      return r.data;
    };
    const before = await adapter.getTrip(tripId); scope.check();
    if ("error" in before) return failure(before.error, before.error === "FORBIDDEN" ? 403 : 503);
    const snapshot = { version: before.data.trip.headVersion, title: before.data.trip.title, days: before.data.content.days };
    if ("operationId" in input) dispatchedOperation = input.operationId;
    const data = await runScopedEdit(tripId, input, rpc, snapshot, Date.now()); scope.check();
    const receipt = operationProposal(data);
    if (receipt) {
      const original = await adapter.getPendingProposal(tripId, receipt.proposalId); scope.check();
      if ("error" in original) throw new ScopedEditServiceError("SCOPED_EDIT_RECEIPT_UNKNOWN");
      assertOriginalScopedProposal(receipt, original.data.proposal, Date.now());
    }
    const fresh = await adapter.getTrip(tripId), current = await adapter.authenticated(); scope.check();
    if ("error" in current || current.data !== actor.data) return failure("UNAUTHENTICATED", 401);
    if ("error" in fresh || !sameValue(before.data.trip, fresh.data.trip) || !sameValue(before.data.content, fresh.data.content)) return failure(dispatchedOperation ? "SCOPED_EDIT_RECEIPT_UNKNOWN" : "STALE_TRIP_VERSION", dispatchedOperation ? 503 : 409);
    if (authority && initial && !("error" in initial)) {
      const final = await authority.read(); scope.check();
      if ("error" in final) return failure(final.error, final.error === "UNAUTHENTICATED" ? 401 : 503);
      if (!sameValue(final.data, initial.data)) return failure("UNAUTHENTICATED", 401);
    }
    const response = reply({ data }); return web ? web.applyCookies(response) : response;
  }); } catch (error) {
    const code = error instanceof ScopedEditServiceError ? error.message : "PROVIDER_UNAVAILABLE";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INVALID_INPUT" ? 400 : ["STALE_TRIP_VERSION", "IDEMPOTENCY_KEY_REUSE"].includes(code) ? 409 : 503;
    return failure(code, status);
  } finally { scope.dispose(); }
}
