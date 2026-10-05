import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { createNativeTripDataAdapter } from "../../identity/user-data-adapter.ts";
import { createOfflineNativeAuthority } from "../../today/offline-native-authority.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../../contracts/errors/index.ts";
import { exact, object, uuid, sha256, parsePdfCommand, pdfDigest, type PdfCommand } from "./contract.ts";
import { buildPdfPreview } from "./preview.ts";
import { createPdfRepository } from "./repository.ts";

export type PdfAction = "preview" | "proposal" | "operation" | "cancel";
const response = (v: unknown, status = 200) => Response.json(v, { status,
  headers: { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
export async function nativePdfIntakeHTTP(request: NextRequest, tripId: string, action: PdfAction) {
  if (request.method !== (action === "operation" ? "GET" : "POST") || request.headers.has("cookie") || request.headers.has("origin") || !uuid(tripId.toLowerCase())) return failure("INVALID_INPUT");
  tripId = tripId.toLowerCase();
  const config = getNativeRuntimeConfig(request, "trip", "trip");
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      let raw: string;
      const params = request.nextUrl.searchParams;
      if (action === "operation") {
        if ([...params].length !== 1 || !uuid(params.get("operationId")) || request.body !== null) return failure("INVALID_INPUT");
        raw = JSON.stringify({ operationId: params.get("operationId") });
      } else {
        if ([...params].length) return failure("INVALID_INPUT");
        const body = await scope.body(request, 8192);
        if (body === null) return failure("INVALID_INPUT");
        raw = body;
      }
      let input: unknown;
      try { input = JSON.parse(raw); } catch { return failure("INVALID_INPUT"); }
      let command: PdfCommand | null = null, operationId = "", reviewedPreviewDigest = "";
      if (action === "preview") command = parsePdfCommand(input);
      else if (action === "proposal") {
        if (!object(input) || !exact(input, ["command", "reviewedPreviewDigest"]) || !sha256(input.reviewedPreviewDigest)) return failure("INVALID_INPUT");
        command = parsePdfCommand(input.command); reviewedPreviewDigest = input.reviewedPreviewDigest;
      } else {
        if (!object(input) || !exact(input, ["operationId"]) || !uuid(input.operationId)) return failure("INVALID_INPUT");
        operationId = input.operationId;
      }
      if ((action === "preview" || action === "proposal") && !command) return failure("INVALID_INPUT");
      const authority = await createOfflineNativeAuthority(request, config, scope.fetch, scope.unavailable);
      const repository = await createPdfRepository(request, config, scope.fetch, scope.unavailable);
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
      const snapshot = { version: saved.data.trip.headVersion, title: saved.data.trip.title, days: saved.data.content.days };
      let result;
      if (action === "preview" && command) {
        if (command.expectedHeadVersion !== snapshot.version) return failure("STALE_TRIP_VERSION");
        const expected = buildPdfPreview(tripId, snapshot, command);
        result = await repository.preview(tripId, raw, expected, actor.data);
      } else if (action === "proposal" && command) {
        // The SQL operation lookup precedes current-head/expiry checks so a lost ACK can recover its original receipt.
        result = await repository.propose(tripId, raw, command, reviewedPreviewDigest, actor.data);
        if (!("error" in result) && !result.data.reused) {
          const expected = buildPdfPreview(tripId, snapshot, command);
          if (expected.previewDigest !== reviewedPreviewDigest || expected.patch === null) return failure("PROVIDER_UNAVAILABLE");
          const pending = await adapter.getPendingProposal(tripId, result.data.proposalId);
          if ("error" in pending) return failure(pending.error);
          if (pending.data.proposal.stale !== false || pending.data.proposal.id !== result.data.proposalId
            || pending.data.proposal.revision !== result.data.proposalRevision || pending.data.proposal.baseTripVersion !== command.expectedHeadVersion
            || pdfDigest(pending.data.proposal.patch) !== pdfDigest(expected.patch)) return failure("PROVIDER_UNAVAILABLE");
        }
      } else result = await repository.operation(action as "operation" | "cancel", tripId, raw, operationId, actor.data);
      scope.check();
      if ("error" in result) return failure(result.error);
      const finalTrip = await adapter.getTrip(tripId);
      if ("error" in finalTrip) return failure(finalTrip.error);
      const finalArchive = await adapter.readArchive(tripId);
      if ("error" in finalArchive) return failure(finalArchive.error);
      if (finalArchive.data) return failure("FORBIDDEN");
      if (action === "preview" && command && finalTrip.data.trip.headVersion !== command.expectedHeadVersion) return failure("STALE_TRIP_VERSION");
      const settled = await authority.read();
      scope.check();
      if ("error" in settled) return failure(settled.error);
      if (settled.data.subject !== actor.data.subject || settled.data.sessionId !== actor.data.sessionId || settled.data.sessionEpoch !== actor.data.sessionEpoch) return failure("UNAUTHENTICATED");
      return response(result.data, action === "proposal" && "reused" in result.data && !result.data.reused ? 201 : 200);
    });
  } catch (error) {
    return failure(error instanceof Error && ["INVALID_INPUT", "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE"].includes(error.message)
      ? error.message as FailureCode : "PROVIDER_UNAVAILABLE");
  } finally { scope.dispose(); }
}
