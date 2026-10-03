import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { createNativeTripDataAdapter } from "../identity/user-data-adapter.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { createOfflineNativeAuthority, type OfflineNativeActor } from "./offline-native-authority.ts";
import { productionOfflinePorts } from "./offline-production.ts";
import { issueOfflineRead, type OfflineBasis } from "./offline-read.ts";

const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);

export async function nativeOfflineReadHTTP(request: NextRequest, tripId: string) {
  const params = request.nextUrl.searchParams;
  const head = params.get("expectedHeadVersion");
  const nonce = params.get("requestNonce");
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin") || !isUuid(tripId)
    || [...params].some(([key]) => !["expectedHeadVersion", "requestNonce"].includes(key)) || params.getAll("expectedHeadVersion").length !== 1
    || params.getAll("requestNonce").length !== 1 || nonce === null || !isUuid(nonce)
    || head === null || !/^[1-9][0-9]*$/.test(head) || !Number.isSafeInteger(Number(head))) return failure("INVALID_INPUT");
  const requestNonce = nonce.toLowerCase();
  const config = getNativeRuntimeConfig(request, "trip", "trip");
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const adapter = await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!adapter) return failure("UNAUTHENTICATED");
      const authority = await createOfflineNativeAuthority(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!authority) return failure("UNAUTHENTICATED");
      let pinnedActor: OfflineNativeActor | null = null;
      let readError: FailureCode | null = null;
      const readCurrent = async (): Promise<OfflineBasis | null> => {
        const authorized = await authority.read();
        scope.check();
        if ("error" in authorized) { readError = authorized.error; return null; }
        const actor = await adapter.authenticated();
        if ("error" in actor) { readError = actor.error; return null; }
        const saved = await adapter.getTrip(tripId.toLowerCase());
        if ("error" in saved) { readError = saved.error; return null; }
        const archive = await adapter.readArchive(tripId.toLowerCase());
        if ("error" in archive) { readError = archive.error; return null; }
        const currentActor = await adapter.authenticated();
        scope.check();
        if ("error" in currentActor) { readError = currentActor.error; return null; }
        const finalAuthority = await authority.read();
        scope.check();
        if ("error" in finalAuthority) { readError = finalAuthority.error; return null; }
        if (currentActor.data !== actor.data || actor.data !== authorized.data.subject
          || finalAuthority.data.subject !== authorized.data.subject || finalAuthority.data.sessionId !== authorized.data.sessionId
          || finalAuthority.data.sessionEpoch !== authorized.data.sessionEpoch
          || (pinnedActor && (pinnedActor.subject !== authorized.data.subject || pinnedActor.sessionId !== authorized.data.sessionId
            || pinnedActor.sessionEpoch !== authorized.data.sessionEpoch))) { readError = "UNAUTHENTICATED"; return null; }
        pinnedActor = authorized.data;
        return {
          subject: actor.data,
          sessionEpoch: authorized.data.sessionEpoch, tripId: saved.data.trip.id, headVersion: saved.data.trip.headVersion,
          confirmed: saved.data.confirmationState === "confirmed", active: archive.data === null,
          payload: { days: saved.data.content.days.map(day => ({ id: day.id, date: day.date,
            items: day.items.map(item => ({ id: item.id, title: item.title })) })) },
        };
      };
      const result = await issueOfflineRead(tripId.toLowerCase(), Number(head), requestNonce, productionOfflinePorts(readCurrent, config.environment ?? "local"));
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
