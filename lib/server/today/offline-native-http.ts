import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { createNativeTripDataAdapter } from "../identity/user-data-adapter.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { issueOfflineRead, type OfflineBasis } from "./offline-read.ts";

const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);

export async function nativeOfflineReadHTTP(request: NextRequest, tripId: string) {
  const params = request.nextUrl.searchParams;
  const head = params.get("expectedHeadVersion");
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin") || !isUuid(tripId)
    || [...params].some(([key]) => key !== "expectedHeadVersion") || params.getAll("expectedHeadVersion").length !== 1
    || head === null || !/^[1-9][0-9]*$/.test(head) || !Number.isSafeInteger(Number(head))) return failure("INVALID_INPUT");
  const config = getNativeRuntimeConfig(request, "trip", "trip");
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const adapter = await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!adapter) return failure("UNAUTHENTICATED");
      let readError: FailureCode | null = null;
      const readCurrent = async (): Promise<OfflineBasis | null> => {
        const actor = await adapter.authenticated();
        if ("error" in actor) { readError = actor.error; return null; }
        const saved = await adapter.getTrip(tripId.toLowerCase());
        if ("error" in saved) { readError = saved.error; return null; }
        const archive = await adapter.readArchive(tripId.toLowerCase());
        if ("error" in archive) { readError = archive.error; return null; }
        const currentActor = await adapter.authenticated();
        scope.check();
        if ("error" in currentActor) { readError = currentActor.error; return null; }
        if (currentActor.data !== actor.data) { readError = "UNAUTHENTICATED"; return null; }
        return {
          subject: actor.data,
          // The existing adapter gates active session but exposes no signed epoch binding.
          // No placeholder epoch is eligible for a package; missing authorities stay closed.
          sessionEpoch: null, tripId: saved.data.trip.id, headVersion: saved.data.trip.headVersion,
          confirmed: saved.data.confirmationState === "confirmed", active: archive.data === null,
          payload: { days: saved.data.content.days.map(day => ({ id: day.id, date: day.date,
            items: day.items.map(item => ({ id: item.id, title: item.title })) })) },
        };
      };
      const result = await issueOfflineRead(tripId.toLowerCase(), Number(head), { readCurrent });
      if (readError) return failure(readError);
      // Also recheck the closed production response before publishing it.
      const final = await readCurrent();
      if (readError) return failure(readError);
      if (!final || !final.active || final.headVersion !== Number(head)) return response({ kind: "unavailable", reason: "STALE_BASIS" });
      scope.check();
      return response(result);
    });
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
