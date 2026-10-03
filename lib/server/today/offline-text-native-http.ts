import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { createNativeTripDataAdapter } from "../identity/user-data-adapter.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { createOfflineNativeAuthority } from "./offline-native-authority.ts";
import { parseOfflineTextCommand } from "./offline-text-command.ts";
import { createOfflineTextRepository } from "./offline-text-repository.ts";
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode | "OFFLINE_DATE_EXISTS") => response({ error: { code } }, code === "OFFLINE_DATE_EXISTS" ? 409 : FAILURE_TAXONOMY[code].httpStatus);
export async function nativeOfflineTextHTTP(request: NextRequest, tripId: string, action: "submit" | "revoke") {
  if (request.method !== "POST" || request.headers.has("cookie") || request.headers.has("origin") || !isUuid(tripId) || [...request.nextUrl.searchParams].length) return failure("INVALID_INPUT");
  tripId = tripId.toLowerCase();
  const config = getNativeRuntimeConfig(request, "trip", "trip");
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const raw = await scope.body(request, 8192);
      if (raw === null) return failure("INVALID_INPUT");
      let input: unknown;
      try { input = JSON.parse(raw); } catch { return failure("INVALID_INPUT"); }
      const command = action === "submit" ? parseOfflineTextCommand(input) : null;
      const revokeId = action === "revoke" && input && typeof input === "object" && !Array.isArray(input)
        && Object.keys(input).length === 1 && "operationId" in input && typeof input.operationId === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.operationId) ? input.operationId : null;
      if (action === "submit" ? !command : !revokeId) return failure("INVALID_INPUT");
      const authority = await createOfflineNativeAuthority(request, config, scope.fetch, scope.unavailable);
      const repository = await createOfflineTextRepository(request, config, scope.fetch, scope.unavailable);
      const adapter = await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!authority || !repository || !adapter) return failure("UNAUTHENTICATED");
      const actor = await authority.read();
      if ("error" in actor) return failure(actor.error);
      const saved = await adapter.getTrip(tripId);
      if ("error" in saved) return failure(saved.error);
      const archive = await adapter.readArchive(tripId);
      if ("error" in archive) return failure(archive.error);
      if (archive.data) return failure("FORBIDDEN");
      if (command && saved.data.trip.headVersion !== command.expectedHeadVersion) return failure("STALE_TRIP_VERSION");
      const result = command ? await repository.submit(tripId, command, actor.data) : await repository.revoke(tripId, revokeId ?? "", actor.data);
      scope.check();
      if ("error" in result) return failure(result.error);
      const finalActor = await authority.read();
      if ("error" in finalActor) return failure(finalActor.error);
      if (finalActor.data.subject !== actor.data.subject || finalActor.data.sessionId !== actor.data.sessionId || finalActor.data.sessionEpoch !== actor.data.sessionEpoch) return failure("UNAUTHENTICATED");
      const finalTrip = await adapter.getTrip(tripId);
      if ("error" in finalTrip) return failure(finalTrip.error);
      const finalArchive = await adapter.readArchive(tripId);
      if ("error" in finalArchive) return failure(finalArchive.error);
      if (finalArchive.data) return failure("FORBIDDEN");
      if (command && finalTrip.data.trip.headVersion !== command.expectedHeadVersion) return failure("STALE_TRIP_VERSION");
      const settledActor = await authority.read();
      scope.check();
      if ("error" in settledActor) return failure(settledActor.error);
      if (settledActor.data.subject !== actor.data.subject || settledActor.data.sessionId !== actor.data.sessionId || settledActor.data.sessionEpoch !== actor.data.sessionEpoch) return failure("UNAUTHENTICATED");
      // Writes remain inside the existing SQL proposal/confirmation domain; no direct Patch here.
      return command ? response({ version: 2, ...result.data }, result.data.reused ? 200 : 201) : response(result.data);
    });
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
