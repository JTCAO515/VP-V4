import { createHash } from "node:crypto";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeFetch } from "../identity/native-fetch.ts";
import type { FailureCode } from "../contracts/errors/index.ts";
import type { OfflineNativeActor } from "./offline-native-authority.ts";
import type { OfflineTextCommand } from "./offline-text-command.ts";
import type { OfflineProvenance } from "./offline-production.ts";
import { isOfflinePayload, offlineCanonical, offlineDigest, qualifiedSubsetMatches, type OfflineBasis } from "./offline-read.ts";

type ErrorCode = FailureCode | "OFFLINE_DATE_EXISTS";
type Result<T> = { data: T } | { error: ErrorCode };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const hash = (v: unknown) => createHash("sha256").update(offlineCanonical(v), "utf8").digest("hex");
export const offlineFieldDigest = (field: "days.date" | "days.items.title", dayId: string, itemId: string | null, value: string) => hash([field, dayId, itemId, value]);
export function offlineTextError(message: string): ErrorCode {
  if (/\b(UNAUTHENTICATED|SESSION_REPLACED)\b/.test(message)) return "UNAUTHENTICATED";
  for (const code of ["INVALID_INPUT", "FORBIDDEN", "STALE_TRIP_VERSION", "OFFLINE_DATE_EXISTS", "PROPOSAL_NOT_CONFIRMABLE", "IDEMPOTENCY_KEY_REUSE"] as const) if (new RegExp(`\\b${code}\\b`).test(message)) return code;
  return "PROVIDER_UNAVAILABLE"; // Missing RPC / denied EXECUTE cannot masquerade as permission or empty data.
}
export function parseOfflineProvenance(value: unknown, basis: OfflineBasis): OfflineProvenance | null {
  if (!record(value) || !exact(value, ["kind", "sourceSemantics", "subject", "sessionEpoch", "tripId", "headVersion", "purpose", "generation", "qualifiedPayload", "qualifiedPayloadDigest", "fields", "coverage"])
    || value.kind !== "offline_text_provenance/1" || value.sourceSemantics !== "controlled_user_text_submission" || value.purpose !== "offline_cache"
    || value.subject !== basis.subject || value.sessionEpoch !== basis.sessionEpoch || value.tripId !== basis.tripId || value.headVersion !== basis.headVersion
    || !integer(value.generation) || !isOfflinePayload(value.qualifiedPayload) || value.qualifiedPayloadDigest !== offlineDigest(value.qualifiedPayload)
    || !record(value.coverage) || !exact(value.coverage, ["kind", "excludedDays", "excludedItems"])
    || !integer(value.coverage.excludedDays) || !integer(value.coverage.excludedItems)
    || !["partial", "full"].includes(String(value.coverage.kind))
    || (value.coverage.kind === "full" ? value.coverage.excludedDays !== 0 || value.coverage.excludedItems !== 0 : value.coverage.excludedDays + value.coverage.excludedItems === 0)
    || !qualifiedSubsetMatches(basis.payload, value.qualifiedPayload, value.coverage.kind as "partial" | "full") || !Array.isArray(value.fields)) return null;
  const payload = value.qualifiedPayload;
  const expected = new Map<string, string>();
  for (const day of payload.days) {
    expected.set(offlineCanonical(["days.date", day.id, null]), offlineFieldDigest("days.date", day.id, null, day.date));
    for (const item of day.items) expected.set(offlineCanonical(["days.items.title", day.id, item.id]), offlineFieldDigest("days.items.title", day.id, item.id, item.title));
  }
  if (value.fields.length !== expected.size) return null;
  const seen = new Set<string>(), receiptIds = new Set<string>();
  for (const f of value.fields) {
    if (!record(f) || !exact(f, ["field", "dayId", "itemId", "sourceReceiptId", "valueDigest"]) || !uuid(f.sourceReceiptId)) return null;
    const key = offlineCanonical([f.field, f.dayId, f.itemId]);
    if (seen.has(key) || receiptIds.has(f.sourceReceiptId) || expected.get(key) !== f.valueDigest) return null;
    seen.add(key); receiptIds.add(f.sourceReceiptId);
  }
  // Coverage counts are checked against the complete current basis, but never exposed in the signed package.
  const excludedDays = basis.payload.days.length - payload.days.length;
  const excludedItems = basis.payload.days.reduce((n, d) => n + d.items.length, 0) - payload.days.reduce((n, d) => n + d.items.length, 0);
  if (value.coverage.excludedDays !== excludedDays || value.coverage.excludedItems !== excludedItems) return null;
  return structuredClone(value) as OfflineProvenance;
}
export async function createOfflineTextRepository(request: Pick<Request, "headers">, config: { url: string; publishableKey: string }, transport: typeof fetch = nativeFetch, onUnavailable?: () => void) {
  const credentials = await verifyNativeCredentials(request, config, transport, onUnavailable);
  if (!credentials) return null;
  const matches = (actor: OfflineNativeActor) => credentials.subject === actor.subject && credentials.sessionId === actor.sessionId;
  return {
    async submit(tripId: string, command: OfflineTextCommand, actor: OfflineNativeActor): Promise<Result<{ proposalId: string; revision: number; baseTripVersion: number; reused: boolean }>> {
      if (!matches(actor)) return { error: "UNAUTHENTICATED" };
      const result = await credentials.client.rpc("submit_offline_trip_text_proposal_v1", { p_trip_id: tripId, p_operation_id: command.operationId,
        p_expected_head_version: command.expectedHeadVersion, p_date: command.date, p_title: command.title, p_save_offline: true });
      if (result.error) return { error: offlineTextError(result.error.message) };
      const v = result.data;
      const suffix = command.operationId.replaceAll("-", "");
      if (!record(v) || !exact(v, ["kind", "operationId", "proposalId", "proposalRevision", "baseTripVersion", "sessionEpoch", "dayId", "itemId", "provenanceState", "reused"])
        || v.kind !== "offline_text_proposal/1" || v.operationId !== command.operationId || !uuid(v.proposalId) || !integer(v.proposalRevision, 1)
        || v.baseTripVersion !== command.expectedHeadVersion || v.sessionEpoch !== actor.sessionEpoch || v.dayId !== `ofd_${suffix}` || v.itemId !== `ofi_${suffix}`
        || v.provenanceState !== "candidate" || typeof v.reused !== "boolean") return { error: "PROVIDER_UNAVAILABLE" };
      return { data: { proposalId: v.proposalId, revision: v.proposalRevision, baseTripVersion: command.expectedHeadVersion, reused: v.reused } };
    },
    async read(basis: OfflineBasis): Promise<Result<OfflineProvenance | null>> {
      if (basis.subject !== credentials.subject || !integer(basis.sessionEpoch, 1)) return { error: "UNAUTHENTICATED" };
      const result = await credentials.client.rpc("read_offline_trip_text_provenance_v1", { p_trip_id: basis.tripId, p_expected_head_version: basis.headVersion, p_expected_epoch: basis.sessionEpoch });
      if (result.error) return { error: offlineTextError(result.error.message) };
      if (record(result.data) && exact(result.data, ["kind", "reason"]) && result.data.kind === "unavailable" && result.data.reason === "NO_PROVENANCE") return { data: null };
      const provenance = parseOfflineProvenance(result.data, basis);
      return provenance ? { data: provenance } : { error: "PROVIDER_UNAVAILABLE" };
    },
    async revoke(tripId: string, operationId: string, actor: OfflineNativeActor): Promise<Result<{ kind: "offline_text_revoked/1"; tripId: string; sessionEpoch: number; generation: number; operationId: string; reused: boolean }>> {
      if (!matches(actor)) return { error: "UNAUTHENTICATED" };
      const result = await credentials.client.rpc("revoke_offline_trip_text_provenance_v1", { p_trip_id: tripId, p_expected_epoch: actor.sessionEpoch, p_operation_id: operationId });
      if (result.error) return { error: offlineTextError(result.error.message) };
      const v = result.data;
      if (!record(v) || !exact(v, ["kind", "tripId", "sessionEpoch", "generation", "operationId", "reused"])
        || v.kind !== "offline_text_revoked/1" || v.tripId !== tripId || v.sessionEpoch !== actor.sessionEpoch || v.operationId !== operationId
        || !integer(v.generation) || typeof v.reused !== "boolean") return { error: "PROVIDER_UNAVAILABLE" };
      return { data: { kind: "offline_text_revoked/1", tripId, sessionEpoch: actor.sessionEpoch, generation: v.generation, operationId, reused: v.reused } };
    },
  };
}
