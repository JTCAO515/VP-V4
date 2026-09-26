import { nativeRequestScope } from "../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import type { NextRequest } from "next/server";
import { createNativeTripDataAdapter } from "../identity/user-data-adapter.ts";
import { isUuid, isTripCreateInput, parseTripListInput, isTripProposalInput, isTripProposalRevisionInput, isProposalRejectInput, isConfirmInput } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { withTripCapabilityState } from "./capability-state.ts";
import { isArchiveInput } from "./archive/contract.ts";

type Action = "list" | "create" | "read" | "proposal_read" | "proposal_create" | "revise" | "reject" | "confirm" | "archive" | "archive_read";
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
export async function nativeTripHTTP(request: NextRequest, action: Action, tripId?: string) {
  const config = getNativeRuntimeConfig(request, "trip", "trip");
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  if (request.headers.has("cookie") || request.headers.has("origin")) return failure("INVALID_INPUT");
  if (tripId !== undefined && !isUuid(tripId)) return failure("INVALID_INPUT");
  tripId = tripId?.toLowerCase();
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
    const adapter = await createNativeTripDataAdapter(request, config, scope.fetch, scope.unavailable);
    scope.check();
    if (!adapter) return failure("UNAUTHENTICATED");
    const actor = await adapter.authenticated();
    if ("error" in actor) return failure(actor.error);
    const params = request.nextUrl.searchParams;
    let result;
    if (action === "list") {
      const input = parseTripListInput(params);
      if (!input) return failure("INVALID_INPUT");
      result = await adapter.listTrips(input.limit);
      if (!("error" in result)) return response({ version: 2, trips: result.data, currentTripId: result.data[0]?.id ?? null });
    } else if (action === "archive_read" && tripId) {
      if ([...params].length) return failure("INVALID_INPUT");
      result = await adapter.readArchive(tripId);
      if (!("error" in result)) return response({ version: 1, archive: result.data });
    } else if (action === "read" && tripId) {
      if ([...params].length) return failure("INVALID_INPUT");
      result = await adapter.getTrip(tripId);
      if (!("error" in result)) return response(withTripCapabilityState({ version: 2, trip: result.data.trip, content: result.data.content, confirmationState: result.data.confirmationState }));
    } else if (action === "proposal_read" && tripId) {
      const id = params.get("proposalId");
      if ([...params].some(([key]) => key !== "proposalId") || params.getAll("proposalId").length > 1 || (id !== null && !isUuid(id))) return failure("INVALID_INPUT");
      result = await adapter.getPendingProposal(tripId, id ?? undefined);
      if (!("error" in result)) return response({ version: 2, ...result.data });
    } else {
      if ([...params].length) return failure("INVALID_INPUT");
      const raw = await scope.body(request, 192_000);
      if (raw === null || raw.length > 64000) return failure("INVALID_INPUT");
      let input: unknown;
      try { input = JSON.parse(raw); } catch { return failure("INVALID_INPUT"); }
      if (action === "archive" && tripId && isArchiveInput(input)) {
        result = await adapter.archiveTrip(tripId, input);
        if (!("error" in result)) return response({ version: 1, ...result.data });
      } else if (action === "create" && isTripCreateInput(input)) {
        result = await adapter.createTrip(input);
        if (!("error" in result)) return response({ version: 2, ...result.data }, result.data.reused ? 200 : 201);
      } else if (action === "proposal_create" && tripId && isTripProposalInput(input)) {
        result = await adapter.createPendingProposal(tripId, input);
        if (!("error" in result)) return response({ version: 2, ...result.data }, 201);
      } else if (action === "revise" && tripId && isTripProposalRevisionInput(input)) {
        result = await adapter.revisePendingProposalPatch(tripId, input);
        if (!("error" in result)) return response({ version: 2, ...result.data }, 201);
      } else if (action === "reject" && tripId && isProposalRejectInput(input) && Object.keys(input).length === 1) {
        result = await adapter.rejectPendingProposal(tripId, input);
        if (!("error" in result)) return response({ version: 2, ...result.data });
      } else if (action === "confirm" && tripId && isConfirmInput(input) && Object.keys(input).length === 3 && isUuid(input.idempotencyKey)) {
        result = await adapter.confirm(tripId, input);
        if (!("error" in result)) return response({ version: 2, ...result.data });
      } else return failure("INVALID_INPUT");
    }
    // A concurrent phone replacement can happen after the first gate. Keep its failure distinct.
    const stillActive = await adapter.authenticated();
    return failure("error" in stillActive ? stillActive.error : result.error);
    });
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
