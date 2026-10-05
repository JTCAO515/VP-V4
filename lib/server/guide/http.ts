import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server.js";
import { createUserDataAdapter, getSupabasePublicConfig } from "../identity/user-data-adapter.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { isSameOriginMutation } from "../identity/request-guards.ts";
import { getNativeTextConfig } from "../turn/native-http.ts";
import { parseGuideCommand, record, uuid } from "./contract.ts";
import { GuideError, runGuide, type GuideRPC } from "./service.ts";

/** Ordinary owner identity. DB ACL/publication/use settings remain deployment
 * owned. No service-role client, source fetch, provider dispatch or retry here. */
export async function guideHTTP(request: NextRequest, tripId: string, native: boolean) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "Vary": native ? "Authorization" : "Cookie",
  } });
  const fail = (code: string, status = 503) => reply({ error: { code } }, status);
  if (request.method !== "POST" || !uuid(tripId) || request.nextUrl.searchParams.size
    || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json"
    || (native ? request.headers.has("cookie") || request.headers.has("origin")
      : request.headers.has("authorization") || !isSameOriginMutation(request) || request.headers.get("sec-fetch-site") === "cross-site")) return fail("INVALID_INPUT", 400);
  const config = native ? getNativeRuntimeConfig(request, "trip", "trip") : getSupabasePublicConfig();
  if (!config) return fail("GUIDE_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal, 30_000);
  const cookies: { apply: ((response: NextResponse) => NextResponse) | null } = { apply: null };
  try { return await scope.run(async () => {
    const body = await scope.body(request, 12_000); let input: unknown;
    try { input = JSON.parse(body ?? "null"); } catch { return fail("INVALID_INPUT", 400); }
    const command = parseGuideCommand(input); if (!command) return fail("INVALID_INPUT", 400);
    // Keep new work on the environment's existing grounded policy lane. A
    // policy UUID in a body cannot select another provider/cost permission.
    if (command.action === "follow_up") {
      const policy = getNativeTextConfig(request, "grounded");
      if (!policy || command.policyId !== policy.policyId) return fail("DATA_POLICY_BLOCKED");
    }
    if (native) {
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
      if (!credentials) return fail("UNAUTHENTICATED", 401);
      const current = async () => {
        const r = await credentials.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal); scope.check();
        return !r.error && record(r.data) && r.data.subject === credentials.subject && r.data.sessionId === credentials.sessionId;
      };
      const rpc: GuideRPC = async (name, params) => { const r = await credentials.client.rpc(name, params).abortSignal(scope.signal); scope.check(); return r; };
      return reply({ data: await runGuide(tripId, command, { rpc, current, now: Date.now }) });
    }
    const adapter = createUserDataAdapter(request, config, scope.fetch);
    if (!adapter) return fail("GUIDE_UNAVAILABLE");
    cookies.apply = adapter.applyCookies;
    const actor = await adapter.authenticated(); scope.check();
    if ("error" in actor) return adapter.applyCookies(fail("UNAUTHENTICATED", 401));
    const client = createServerClient(config.url, config.publishableKey, { global: { fetch: scope.fetch },
      cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } });
    const session = async () => {
      const r = await client.auth.getClaims(); scope.check();
      return !r.error && r.data?.claims.sub === actor.data && uuid(r.data.claims.session_id) ? r.data.claims.session_id : null;
    };
    const initial = await session(); if (!initial) return adapter.applyCookies(fail("UNAUTHENTICATED", 401));
    const current = async () => {
      const fresh = await adapter.authenticated(); scope.check();
      return !("error" in fresh) && fresh.data === actor.data && await session() === initial;
    };
    const rpc: GuideRPC = async (name, params) => { const r = await client.rpc(name, params).abortSignal(scope.signal); scope.check(); return r; };
    return adapter.applyCookies(reply({ data: await runGuide(tripId, command, { rpc, current, now: Date.now }) }));
  }); } catch (error) {
    const code = error instanceof GuideError ? error.code : "GUIDE_UNAVAILABLE";
    const status = code === "INVALID_INPUT" ? 400 : code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403
      : ["STALE_TRIP_VERSION", "IDEMPOTENCY_KEY_REUSE", "SERVICE_TASK_CONFLICT"].includes(code) ? 409 : 503;
    const response = fail(code, status); return cookies.apply ? cookies.apply(response) : response;
  } finally { scope.dispose(); }
}
