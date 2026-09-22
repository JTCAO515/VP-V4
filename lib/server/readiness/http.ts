import { NextRequest, NextResponse } from "next/server";
import { createUserDataAdapter, createNativeTripDataAdapter } from "../identity/user-data-adapter.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { opsRuntimeConfig } from "../knowledge/review/local-workspace.ts";
import { isUuid, hasSameOrigin } from "../identity/request-guards.ts";
import { parseReadinessInput } from "./contract.ts";
import { readReadiness } from "./service.ts";

/** Read-only assessment; declarations are used for this request, never persisted or sent to a model. */
export async function readinessHTTP(request: NextRequest, tripId: string, native: boolean) {
  const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "Vary": native ? "Authorization" : "Cookie" } });
  const failure = (code: string, status: number) => response({ error: { code } }, status);
  if (!isUuid(tripId) || request.nextUrl.searchParams.size) return failure("INVALID_INPUT", 400);
  if (native ? request.headers.has("cookie") || request.headers.has("origin") : request.headers.has("authorization") || !hasSameOrigin(request.headers.get("origin"), request.nextUrl)) return failure("INVALID_INPUT", 400);
  const nativeConfig = native ? getNativeRuntimeConfig(request, "trip") : null;
  const config = native ? nativeConfig : opsRuntimeConfig(request, {
    ...process.env, OPS_LOCAL_REVIEW: process.env.KNOWLEDGE_LOCAL_READ, OPS_STAGING_REVIEW: process.env.KNOWLEDGE_STAGING_READ,
  });
  if (!config || (native && (nativeConfig?.environment === "staging" ? process.env.KNOWLEDGE_STAGING_READ : process.env.KNOWLEDGE_LOCAL_READ) !== "1")) return failure("READINESS_DISABLED", 503);
  const lifetime = nativeRequestScope(request.signal);
  try {
    return await lifetime.run(async () => {
      const raw = await lifetime.body(request, 4096);
      let parsed: unknown;
      try { parsed = raw === null ? null : JSON.parse(raw); } catch { return failure("INVALID_INPUT", 400); }
      const input = parseReadinessInput(parsed);
      if (!input) return failure("INVALID_INPUT", 400);
      const webAdapter = native ? null : createUserDataAdapter(request, config, lifetime.fetch);
      const nativeAdapter = native ? await createNativeTripDataAdapter(request, config, lifetime.fetch, lifetime.unavailable) : null;
      const adapter = nativeAdapter ?? webAdapter;
      if (!adapter) return failure("UNAUTHENTICATED", 401);
      const actor = await adapter.authenticated();
      if ("error" in actor) return failure(actor.error, 401);
      const value = await readReadiness(input, async () => {
        const trip = await adapter.getTrip(tripId.toLowerCase());
        lifetime.check();
        if ("error" in trip) throw new Error(trip.error);
        return { id: trip.data.trip.id, headVersion: trip.data.trip.headVersion, dates: trip.data.content.days.map(day => ({ date: day.date, timeZone: day.timeZone })) };
      }, async () => {
        const params = { p_input: { questionId: "connectivity_sim_documents", questionVersion: 1, city: input.city, locale: input.locale } };
        if (webAdapter) {
          const result = await webAdapter.runGroundedAiAssist(rpc => rpc("knowledge_answer_v1", params));
          if ("error" in result || result.data.error) throw new Error("READINESS_UNAVAILABLE");
          return result.data.data;
        }
        const credentials = await verifyNativeCredentials(request, config, lifetime.fetch, lifetime.unavailable);
        if (!credentials || credentials.subject !== actor.data) throw new Error("UNAUTHENTICATED");
        const result = await credentials.client.rpc("knowledge_answer_v1", params).abortSignal(lifetime.signal);
        lifetime.check();
        if (result.error) throw new Error("READINESS_UNAVAILABLE");
        return result.data;
      });
      lifetime.check();
      const active = await adapter.authenticated();
      if ("error" in active) throw new Error(active.error);
      const reply = response({ data: value });
      return webAdapter ? webAdapter.applyCookies(reply) : reply;
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return code === "STALE_TRIP_VERSION" ? failure(code, 409)
      : code === "FORBIDDEN" ? failure(code, 403)
        : ["UNAUTHENTICATED", "SESSION_REPLACED"].includes(code) ? failure(code, 401) : failure("READINESS_UNAVAILABLE", 503);
  } finally { lifetime.dispose(); }
}
