import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server.js";
import { createNativeTripDataAdapter, createUserDataAdapter, getSupabasePublicConfig } from "../identity/user-data-adapter.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { createOfflineNativeAuthority } from "../today/offline-native-authority.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { isSameOriginMutation } from "../identity/request-guards.ts";
import { consumePlaceQuota } from "../maps/place-quota.ts";
import { parsePlaceAction, uuid } from "./place-action-contract.ts";
import { runPlaceAction, PlaceActionError, type PlaceRPC, type ProposalReview } from "./place-action-service.ts";
import { evaluatePlaceAdd } from "./place-action-evaluation.ts";
import { decodePlaceContext, samePlaceContext } from "./place-action-context.ts";

/** Both product surfaces use ordinary owner credentials. No service-role writer,
 * request-supplied target, automatic retry, provider acquisition or Confirm route. */
export async function placeActionHTTP(request: NextRequest, tripId: string, native: boolean) {
  const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: native ? "Authorization" : "Cookie" } });
  const fail = (code: string, status = 503) => reply({ error: { code } }, status);
  if (request.method !== "POST" || !uuid(tripId) || request.nextUrl.searchParams.size || (native ? request.headers.has("cookie") || request.headers.has("origin")
    : request.headers.has("authorization") || !isSameOriginMutation(request))) return fail("INVALID_INPUT", 400);
  const config = native ? getNativeRuntimeConfig(request, "trip", "trip") : getSupabasePublicConfig();
  if (!config) return fail("PLACE_ACTION_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal, 30000);
  try { return await scope.run(async () => {
    const body = await scope.body(request, 24000); let value: unknown;
    try { value = JSON.parse(body ?? "null"); } catch { return fail("INVALID_INPUT", 400); }
    const input = parsePlaceAction(value); if (!input) return fail("INVALID_INPUT", 400);
    const web = native ? null : createUserDataAdapter(request, config, scope.fetch);
    const adapter = native ? await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable) : web;
    if (!adapter) return fail("UNAUTHENTICATED", 401);
    const actor = await adapter.authenticated(); scope.check(); if ("error" in actor) return fail(actor.error, actor.error === "UNAUTHENTICATED" ? 401 : 503);
    const credentials = native ? await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable) : null;
    const authority = native ? await createOfflineNativeAuthority(request, config, scope.fetch, scope.unavailable) : null;
    const initial = authority ? await authority.read() : null;
    if (native && (!credentials || !initial || "error" in initial || initial.data.subject !== actor.data)) return fail("UNAUTHENTICATED", 401);
    const client = credentials?.client ?? createServerClient(config.url, config.publishableKey, { global: { fetch: scope.fetch },
      cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } });
    const webSession = async () => {
      const c = await client.auth.getClaims(); scope.check();
      return !c.error && c.data?.claims.sub === actor.data && typeof c.data.claims.session_id === "string" ? c.data.claims.session_id : null;
    };
    const session = native ? initial && !("error" in initial) ? initial.data.sessionId : null : await webSession();
    if (!session) return fail("UNAUTHENTICATED", 401);
    const currentActor = async () => {
      scope.check(); const a = await adapter.authenticated(); scope.check();
      if ("error" in a || a.data !== actor.data) return false;
      if (authority && initial && !("error" in initial)) { const now = await authority.read(); scope.check(); return !("error" in now) && JSON.stringify(now.data) === JSON.stringify(initial.data); }
      return await webSession() === session;
    };
    const rpc: PlaceRPC = async (name, params) => { const r = await client.rpc(name, params).abortSignal(scope.signal); scope.check(); return { data: r.data, error: r.error }; };
    const proposal = async (id: string): Promise<ProposalReview | null> => {
      const p = await adapter.getPendingProposal(tripId, id); scope.check();
      if ("error" in p || p.data.proposal.stale || !p.data.proposal.digest || !p.data.proposal.after) return null;
      const result = p.data.proposal;
      return { id: result.id, revision: result.revision, digest: result.digest!, baseVersion: result.baseTripVersion, after: result.after! };
    };
    const result = await runPlaceAction(tripId, input, { rpc, current: currentActor, enabled: () => process.env.VISEPANDA_PLACE_ACTIONS_ENABLED === "true", now: Date.now, proposal,
      evaluate: async (context, command, selected, plan) => {
        const live = async () => {
          if (process.env.VISEPANDA_PLACE_ACTIONS_ENABLED !== "true" || !await currentActor()) return false;
          const p = await proposal(selected.id); if (!p || p.digest !== selected.digest || p.revision !== selected.revision) return false;
          const read = await rpc("read_place_action_context_v1", { p_trip: tripId, p_input: { action: "context", expectedTripVersion: command.expectedTripVersion, selection: command.selection, locale: command.locale } });
          const fresh = !read.error ? decodePlaceContext(read.data, tripId, command) : null;
          return fresh !== null && samePlaceContext(context, fresh);
        };
        if (!await live()) throw new PlaceActionError("MAPPING_CHANGED");
        return evaluatePlaceAdd(context, command, selected, plan, { rpc, current: live,
          quota: async () => (await consumePlaceQuota(client, "places", scope.signal)).kind === "allowed", signal: scope.signal, fetcher: scope.fetch, env: process.env });
      } });
    scope.check(); const response = reply(result); return web ? web.applyCookies(response) : response;
  }); } catch (e) {
    const code = e instanceof PlaceActionError ? e.code : "PLACE_ACTION_UNAVAILABLE";
    return fail(code, code === "INVALID_INPUT" ? 400 : code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403
      : ["STALE_TRIP_VERSION", "MAPPING_CHANGED", "CAS_CONFLICT", "IDEMPOTENCY_KEY_REUSE", "PROPOSAL_NOT_CONFIRMABLE"].includes(code) ? 409 : 503);
  } finally { scope.dispose(); }
}
