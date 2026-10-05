import { createHash } from "node:crypto";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { nativeFetch } from "../../identity/native-fetch.ts";
import type { FailureCode } from "../../contracts/errors/index.ts";
import type { OfflineNativeActor } from "../../today/offline-native-authority.ts";
import { exact, object, instant, integer, uuid, sha256, pdfDigest, type PdfCommand, type PdfPreview, type PdfProposal, type PdfOperation } from "./contract.ts";

type Result<T> = { data: T } | { error: FailureCode };
export const pdfRequestDigest = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");
export function pdfError(message: string): FailureCode {
  if (/\b(UNAUTHENTICATED|SESSION_REPLACED)\b/.test(message)) return "UNAUTHENTICATED";
  if (/\bPDF_PREVIEW_MISMATCH\b/.test(message)) return "PROPOSAL_NOT_CONFIRMABLE";
  for (const code of ["INVALID_INPUT", "FORBIDDEN", "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE", "IDEMPOTENCY_KEY_REUSE", "DATA_EXPIRED", "CANCELLED"] as const)
    if (new RegExp(`\\b${code}\\b`).test(message)) return code;
  return "PROVIDER_UNAVAILABLE";
}
export function parsePdfOperation(v: unknown, tripId: string, operationId: string, sessionEpoch: number): PdfOperation | null {
  if (!object(v) || !exact(v, ["kind", "operationId", "tripId", "sessionEpoch", "state", "requestDigest", "commandDigest", "previewDigest", "expiresAt", "proposalId", "proposalRevision", "baseTripVersion", "confirmationEventId", "resultingVersion"])
    || v.kind !== "pdf_intake_operation/1" || v.tripId !== tripId || v.operationId !== operationId || v.sessionEpoch !== sessionEpoch
    || !["absent", "pending", "confirmed", "rejected", "cancelled", "expired"].includes(v.state as string)
    || ![v.requestDigest, v.commandDigest, v.previewDigest].every(h => h === null || sha256(h))
    || !(v.expiresAt === null || instant(v.expiresAt)) || !(v.proposalId === null || uuid(v.proposalId))
    || !(v.proposalRevision === null || integer(v.proposalRevision, 1)) || !(v.baseTripVersion === null || integer(v.baseTripVersion))
    || !(v.confirmationEventId === null || uuid(v.confirmationEventId)) || !(v.resultingVersion === null || integer(v.resultingVersion, 1))) return null;
  const binding = [v.proposalId, v.proposalRevision, v.baseTripVersion];
  if (binding.some(x => x === null) && !binding.every(x => x === null)) return null;
  const materialBinding = [v.requestDigest, v.commandDigest, v.previewDigest, v.expiresAt, ...binding];
  if (v.state === "absent" && materialBinding.some(x => x !== null)) return null;
  const emptyCancel = v.state === "cancelled" && materialBinding.every(x => x === null);
  if (["pending", "confirmed", "rejected", "expired", "cancelled"].includes(v.state as string) && !emptyCancel
    && (binding.some(x => x === null) || ![v.requestDigest, v.commandDigest, v.previewDigest].every(sha256) || !instant(v.expiresAt))) return null;
  if (v.state === "confirmed" ? !uuid(v.confirmationEventId) || v.resultingVersion !== Number(v.baseTripVersion) + 1
    : v.confirmationEventId !== null || v.resultingVersion !== null) return null;
  return structuredClone(v) as PdfOperation;
}
export function parsePdfProposal(v: unknown, tripId: string, command: PdfCommand, previewDigest: string, raw: string, sessionEpoch: number): PdfProposal | null {
  if (!object(v) || !exact(v, ["kind", "operationId", "tripId", "sessionEpoch", "requestDigest", "commandDigest", "previewDigest", "proposalId", "proposalRevision", "baseTripVersion", "reused"])
    || v.kind !== "pdf_intake_proposal/1" || v.tripId !== tripId || v.operationId !== command.operationId || v.sessionEpoch !== sessionEpoch
    || v.requestDigest !== pdfRequestDigest(raw) || v.commandDigest !== pdfDigest(command) || v.previewDigest !== previewDigest
    || !uuid(v.proposalId) || !integer(v.proposalRevision, 1) || v.baseTripVersion !== command.expectedHeadVersion || typeof v.reused !== "boolean") return null;
  return structuredClone(v) as PdfProposal;
}
export async function createPdfRepository(request: Pick<Request, "headers">, config: { url: string; publishableKey: string },
  transport: typeof fetch = nativeFetch, onUnavailable?: () => void) {
  const credentials = await verifyNativeCredentials(request, config, transport, onUnavailable);
  if (!credentials) return null;
  async function call(action: string, tripId: string, raw: string, actor: OfflineNativeActor): Promise<Result<unknown>> {
    if (actor.subject !== credentials!.subject || actor.sessionId !== credentials!.sessionId) return { error: "UNAUTHENTICATED" };
    const result = await credentials!.client.rpc("pdf_intake_v1", { p_action: action, p_trip_id: tripId, p_input_bytes: raw, p_expected_epoch: actor.sessionEpoch });
    return result.error ? { error: pdfError(result.error.message) } : { data: result.data };
  }
  return {
    async preview(tripId: string, raw: string, expected: PdfPreview, actor: OfflineNativeActor): Promise<Result<PdfPreview>> {
      const result = await call("preview", tripId, raw, actor);
      if ("error" in result) return result;
      // The actual SQL snapshot and its additive patch must match the independently checked current snapshot.
      return pdfDigest(result.data) === pdfDigest(expected) ? { data: expected } : { error: "PROVIDER_UNAVAILABLE" };
    },
    async propose(tripId: string, raw: string, command: PdfCommand, previewDigest: string, actor: OfflineNativeActor): Promise<Result<PdfProposal>> {
      const result = await call("proposal", tripId, raw, actor);
      if ("error" in result) return result;
      const parsed = parsePdfProposal(result.data, tripId, command, previewDigest, raw, actor.sessionEpoch);
      return parsed ? { data: parsed } : { error: "PROVIDER_UNAVAILABLE" };
    },
    async operation(action: "operation" | "cancel", tripId: string, raw: string, operationId: string, actor: OfflineNativeActor): Promise<Result<PdfOperation>> {
      const result = await call(action, tripId, raw, actor);
      if ("error" in result) return result;
      const parsed = parsePdfOperation(result.data, tripId, operationId, actor.sessionEpoch);
      return parsed && (action !== "cancel" || ["cancelled", "confirmed", "rejected", "expired"].includes(parsed.state)) ? { data: parsed } : { error: "PROVIDER_UNAVAILABLE" };
    },
  };
}
