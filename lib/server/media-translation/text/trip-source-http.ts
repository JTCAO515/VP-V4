import { NextRequest } from "next/server.js";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { createNativeTripDataAdapter } from "../../identity/user-data-adapter.ts";
import { isUuid } from "../../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../../contracts/errors/index.ts";
import { projectTripTranslationSource, type TripTranslationSource } from "./trip-source.ts";

const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
type Adapter = NonNullable<Awaited<ReturnType<typeof createNativeTripDataAdapter>>>;
export type TripSourceAdapterFactory = (request: NextRequest, scope: ReturnType<typeof nativeRequestScope>) => Promise<Adapter | null>;
const adapterFactory: TripSourceAdapterFactory = async (request, scope) => {
  const config = getNativeRuntimeConfig(request, "trip", "trip");
  if (!config) return null;
  return createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable);
};

/** Ordinary owner/session/RLS authority is reused, with no new SQL, grant or writer. */
export async function tripTranslationSourceHTTP(request: NextRequest, tripId?: string, factory: TripSourceAdapterFactory = adapterFactory) {
  if (process.env.VERCEL_ENV === "production") return failure("PROVIDER_UNAVAILABLE");
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length
    || (tripId !== undefined && !isUuid(tripId))) return failure("INVALID_INPUT");
  if (factory === adapterFactory && !getNativeRuntimeConfig(request, "trip", "trip")) return failure("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const adapter = await factory(request, scope);
      if (!adapter) return failure("UNAUTHENTICATED");
      const actor = await adapter.authenticated();
      if ("error" in actor) return failure(actor.error);
      if (!isUuid(actor.data)) return failure("PROVIDER_UNAVAILABLE");
      if (tripId !== undefined) {
        const result = await adapter.getTrip(tripId.toLowerCase());
        if ("error" in result) return failure(result.error);
        const source = projectTripTranslationSource(actor.data, result.data);
        if (!source || source.tripId !== tripId.toLowerCase()) return failure("PROPOSAL_NOT_CONFIRMABLE");
        const active = await adapter.authenticated();
        if ("error" in active || active.data !== actor.data) return failure("UNAUTHENTICATED");
        return response(source);
      }
      const result = await adapter.listTrips(20);
      if ("error" in result) return failure(result.error);
      if (result.data.length > 20 || result.data.some(trip => !isUuid(trip.id) || !Number.isSafeInteger(trip.headVersion)
        || trip.headVersion < 0 || typeof trip.title !== "string" || !trip.title.trim() || trip.title.length > 160)) return failure("PROVIDER_UNAVAILABLE");
      const trips = result.data.filter(trip => trip.headVersion > 0).map(trip => ({ tripId: trip.id, title: trip.title, headVersion: trip.headVersion }));
      const active = await adapter.authenticated();
      if ("error" in active || active.data !== actor.data) return failure("UNAUTHENTICATED");
      // Recency is not an active Trip selection; only the explicit native entry
      // supplies that selection. Do not label the first candidate as current.
      return response({ version: 1, kind: "trip_sources", ownerId: actor.data, currentTripId: null, trips });
    });
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}

export type TripTranslationSourceReader = (request: NextRequest, tripId: string) => Promise<Response>;
export const readTripTranslationSource: TripTranslationSourceReader = async (request, tripId) => {
  const url = new URL(`/api/translate/trip-sources/${tripId}`, request.url);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  return tripTranslationSourceHTTP(new NextRequest(url, { method: "GET", headers, signal: request.signal }), tripId);
};
export type { TripTranslationSource };
