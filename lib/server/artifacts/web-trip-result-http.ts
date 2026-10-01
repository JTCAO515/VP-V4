import { NextRequest, NextResponse } from "next/server.js";
import { createWebRpc } from "../identity/web-rpc.ts";
import { getSupabasePublicConfig } from "../identity/user-data-adapter.ts";
import { isSameOriginMutation, isUuid } from "../identity/request-guards.ts";
import { requestLifetime } from "../knowledge/review/request-lifetime.ts";
import { parseResultArtifactRead } from "./result-contract.ts";

type Rpc = Pick<ReturnType<typeof createWebRpc>, "authenticate" | "call">;
const failed = (code: string, status: number) => ({ status, body: { error: { code } } });
const rpcFailure = (message: string) => /UNAUTHENTICATED|SESSION_REPLACED/.test(message)
  ? failed("UNAUTHENTICATED", 401) : failed("RESULT_UNAVAILABLE", 503);

/** Ordinary Web cookie actor; both reads retain text_owner/session/epoch and basis checks. */
export async function readWebTripComparison(tripId: string, rpc: Rpc) {
  const actor = await rpc.authenticate();
  if (!actor) return failed("UNAUTHENTICATED", 401);
  const reference = await rpc.call("read_trip_result_reference_v1", { p_trip_id: tripId });
  if (reference.error) return rpcFailure(reference.error.message);
  const ref = reference.data;
  if (ref?.kind === "empty" || ref?.kind === "unavailable")
    return { status: 200, body: { version: 1, data: { kind: ref.kind } } };
  if (!ref || typeof ref !== "object" || Array.isArray(ref) || Object.keys(ref).length !== 4
    || ref.kind !== "result_reference" || ref.tripId !== tripId || !isUuid(ref.artifactId)
    || !Number.isSafeInteger(ref.revision) || ref.revision < 1 || ref.revision > 1000) return failed("RESULT_UNAVAILABLE", 503);
  const exact = await rpc.call("read_result_artifacts_v1", { p_artifact_id: ref.artifactId, p_revision: ref.revision });
  if (exact.error) return rpcFailure(exact.error.message);
  const result = parseResultArtifactRead(exact.data);
  if (!result || !result.current || result.lifecycle !== "active" || result.source.tripId !== tripId
    || result.artifactId !== ref.artifactId || result.revision !== ref.revision) return failed("RESULT_UNAVAILABLE", 503);
  if (await rpc.authenticate() !== actor) return failed("UNAUTHENTICATED", 401);
  return { status: 200, body: { version: 1, data: result } };
}

export async function webTripResultHTTP(request: NextRequest, tripId: string) {
  const response = (body: unknown, status: number) => NextResponse.json(body, { status,
    headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
  if (request.headers.has("authorization")) return response({ error: { code: "UNAUTHENTICATED" } }, 401);
  if (request.method !== "GET" || !isUuid(tripId) || request.nextUrl.searchParams.size
    || (request.headers.has("origin") && !isSameOriginMutation(request))
    || ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? ""))
    return response({ error: { code: "INVALID_INPUT" } }, 400);
  const config = getSupabasePublicConfig();
  if (!config) return response({ error: { code: "RESULT_UNAVAILABLE" } }, 503);
  const lifetime = requestLifetime(request.signal);
  const rpc = createWebRpc(request, config, lifetime);
  try {
    const result = await readWebTripComparison(tripId, rpc);
    lifetime.check();
    return rpc.applyCookies(response(result.body, result.status));
  } catch { return response({ error: { code: "RESULT_UNAVAILABLE" } }, 503); }
  finally { lifetime.dispose(); }
}
