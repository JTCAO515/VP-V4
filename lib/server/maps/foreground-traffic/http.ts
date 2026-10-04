import { NextResponse, type NextRequest } from "next/server.js";
import { createServerClient } from "@supabase/ssr";
import { tripArchiveOperations } from "../../trip/archive/operations.ts";
import { createNativeTripDataAdapter, createUserDataAdapter } from "../../identity/user-data-adapter.ts";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { createOfflineNativeAuthority } from "../../today/offline-native-authority.ts";
import { opsRuntimeConfig } from "../../knowledge/review/local-workspace.ts";
import { hasSameOrigin } from "../../identity/request-guards.ts";
import { createMapsServiceRoleClient } from "../service-role-client.ts";
import { resolveCanonicalRouteEndpoints } from "../canonical-mapping-repository.ts";
import { consumePlaceQuota } from "../place-quota.ts";
import { parseTrafficInput, uuid, type TrafficBinding } from "./contract.ts";
import { foregroundTrafficService, type FieldRights } from "./service.ts";

type RPC = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type Dependencies = {
  // Server wiring seams only; HTTP bodies/headers cannot supply them.
  rights?: (rpc: RPC) => Promise<FieldRights | null>;
  resolve?: (origin: string, destination: string) => Promise<{ originId: string; destinationId: string } | null>;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Ordinary owner foreground caller. Runtime rights remain absent until the separately
 * reviewed SQL source/policy contract is installed; absence denies before Maps traffic. */
export async function foregroundTrafficHTTP(request: NextRequest, tripId: string, native: boolean, deps: Dependencies = {}) {
  const reply = (v: unknown, status = 200) => NextResponse.json(v, { status, headers: { "Cache-Control": "private, no-store", Vary: native ? "Authorization" : "Cookie" } });
  const fail = (code: string, status = 503) => reply({ error: { code } }, status);
  if (request.method !== "POST" || !uuid(tripId) || request.nextUrl.searchParams.size
    || (native ? request.headers.has("cookie") || request.headers.has("origin") : request.headers.has("authorization") || !hasSameOrigin(request.headers.get("origin"), request.nextUrl))) return fail("INVALID_INPUT", 400);
  const config = native ? getNativeRuntimeConfig(request, "trip", "trip") : opsRuntimeConfig(request,
    { ...process.env, OPS_LOCAL_REVIEW: process.env.KNOWLEDGE_LOCAL_READ, OPS_STAGING_REVIEW: process.env.KNOWLEDGE_STAGING_READ });
  if (!config) return fail("FOREGROUND_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  let binding: TrafficBinding | null = null;
  try { return await scope.run(async () => {
    const raw = await scope.body(request, 4096); let value: unknown;
    try { value = JSON.parse(raw ?? "null"); } catch { return fail("INVALID_INPUT", 400); }
    const input = parseTrafficInput(value); if (!input) return fail("INVALID_INPUT", 400);
    const web = native ? null : createUserDataAdapter(request, config, scope.fetch);
    const adapter = native ? await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable) : web;
    if (!adapter) return fail("UNAUTHENTICATED", 401);
    const actor = await adapter.authenticated(); scope.check(); if ("error" in actor) return fail(actor.error, 401);
    const credentials = native ? await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable) : null;
    const authority = native ? await createOfflineNativeAuthority(request, config, scope.fetch, scope.unavailable) : null;
    const initial = authority ? await authority.read() : null; scope.check();
    if (native && (!credentials || !initial || "error" in initial)) return fail("UNAUTHENTICATED", 401);
    const rpc: RPC = async (name, params) => {
      if (credentials) { const r = await credentials.client.rpc(name, params).abortSignal(scope.signal); scope.check(); return { data: r.data, error: r.error }; }
      if (!web) throw new Error("Unavailable ordinary actor");
      const r = await web.runGroundedAiAssist(call => call(name, params)); scope.check();
      if ("error" in r) throw new Error("Unavailable ordinary RPC"); return r.data;
    };
    const dataClient = credentials?.client ?? createServerClient(config.url, config.publishableKey, {
      global: { fetch: scope.fetch }, cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
    });
    const webSession = async () => {
      const claims = await dataClient.auth.getClaims(); scope.check();
      return !claims.error && claims.data?.claims.sub === actor.data && typeof claims.data.claims.session_id === "string" ? claims.data.claims.session_id : null;
    };
    const session = native ? initial && !("error" in initial) ? `${initial.data.sessionId}:${initial.data.sessionEpoch}` : null : await webSession();
    if (!session) return fail("UNAUTHENTICATED", 401);
    const readPlaces = async () => {
      const result = await dataClient.from("trip_place_references").select("id,reference_kind,canonical_poi_id,freshness").eq("trip_id", tripId).limit(101).abortSignal(scope.signal);
      scope.check();
      if (result.error || !Array.isArray(result.data) || result.data.length > 100) return null;
      return result.data.filter(p => p.reference_kind === "canonical" && p.freshness === "current" && uuid(p.id) && uuid(p.canonical_poi_id))
        .map(p => ({ id: p.id as string, canonicalPoiId: p.canonical_poi_id as string })).sort((a, b) => a.id.localeCompare(b.id));
    };
    const archiveReader = tripArchiveOperations(dataClient, adapter.authenticated);
    const before = await adapter.getTrip(tripId); scope.check();
    if ("error" in before) return fail(before.error, before.error === "FORBIDDEN" ? 403 : 503);
    if (before.data.trip.headVersion !== input.expectedHeadVersion || !before.data.content.days.some(d => d.id === input.dayId && d.items.some(i => i.id === input.itemId))) return fail("STALE_TRIP_VERSION", 409);
    const places = await readPlaces(); if (!places) return fail("EXACT_ENDPOINTS_UNAVAILABLE");
    const origin = places.find(p => p.id === input.originPlaceReferenceId);
    const destination = places.find(p => p.id === input.destinationPlaceReferenceId);
    if (!origin || !destination || origin.canonicalPoiId === destination.canonicalPoiId) return fail("EXACT_ENDPOINTS_UNAVAILABLE");
    // Actual ordinary session scope; no session identifier comes from the request body.
    binding = { actor: actor.data, session: session,
      tripId, headVersion: input.expectedHeadVersion, dayId: input.dayId, itemId: input.itemId,
      originPlaceReferenceId: input.originPlaceReferenceId, destinationPlaceReferenceId: input.destinationPlaceReferenceId, mode: input.mode, departure: "now" };
    const current = async () => {
      scope.check(); const active = await adapter.authenticated(); scope.check();
      if ("error" in active || active.data !== actor.data) return false;
      if (authority && initial && !("error" in initial)) {
        const fresh = await authority.read(); scope.check(); if ("error" in fresh || !same(fresh.data, initial.data)) return false;
      }
      if (!native && await webSession() !== session) return false;
      const freshTrip = await adapter.getTrip(tripId), freshPlaces = await readPlaces(); scope.check();
      const archive = await archiveReader.readArchive(tripId); scope.check();
      return !("error" in freshTrip) && freshPlaces !== null && !("error" in archive) && !archive.data
        && same(before.data.trip, freshTrip.data.trip) && same(before.data.content, freshTrip.data.content) && same(places, freshPlaces);
    };
    const result = await foregroundTrafficService.run(binding, input, { env: process.env, signal: scope.signal, fetcher: scope.fetch,
      authorize: current,
      quota: async () => {
        if (credentials) return (await consumePlaceQuota(credentials.client, "places", scope.signal)).kind === "allowed";
        const result = await rpc("consume_place_quota_v1", { p_bucket: "places", p_minute_limit: 30, p_day_limit: 500 });
        return !result.error && !!result.data && typeof result.data === "object" && "allowed" in result.data && result.data.allowed === true;
      },
      rights: async () => deps.rights ? deps.rights(rpc) : null,
      resolve: async () => {
        if (deps.resolve) return deps.resolve(origin.canonicalPoiId, destination.canonicalPoiId);
        const client = createMapsServiceRoleClient(); return client ? resolveCanonicalRouteEndpoints(client, origin.canonicalPoiId, destination.canonicalPoiId) : null;
      } });
    if (!await current()) { foregroundTrafficService.forget(binding); return fail("CURRENT_SCOPE_UNAVAILABLE", 409); }
    const response = reply({ data: result }); return web ? web.applyCookies(response) : response;
  }); } catch { if (binding) foregroundTrafficService.forget(binding); return fail("FOREGROUND_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
