import { parseExportJob, exportRecord, exportExact } from "./export-contract.ts";
import { collectCoreExport, type ExportLease } from "./export-dispatcher.ts";
import { encryptExportArtifact, type ExportKey } from "./export-artifact.ts";
import { existingExportHandlers, type ExportRPC } from "./export-modules.ts";
import { parseExportPolicy, type ExportPolicy } from "./export-policy.ts";
export type ExportDomainRPC = (action: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export function parseExportLease(value: unknown, requestId: string): ExportLease | null {
  if (!record(value) || Object.keys(value).sort().join() !== "expiresAt,generation,kind,leaseId,ownerId,requestId,reused" || value.kind !== "privacy_export_lease/1"
    || value.requestId !== requestId || !uuid(value.ownerId) || !uuid(value.leaseId) || typeof value.generation !== "number" || !Number.isSafeInteger(value.generation) || value.generation < 1
    || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) || new Date(value.expiresAt).toISOString() !== value.expiresAt || typeof value.reused !== "boolean") return null;
  return { requestId, ownerId: value.ownerId as string, leaseId: value.leaseId as string, generation: value.generation, expiresAt: value.expiresAt };
}

/** One claimed durable job. Missing policy/key does zero RPC; no unbounded retry or publish. */
export async function runCoreExportJob(requestId: string, operationId: string, policy: ExportPolicy | null, key: ExportKey | null,
  domain: ExportDomainRPC, modules: ExportRPC, signal: AbortSignal): Promise<unknown> {
  if (!policy || !parseExportPolicy(JSON.stringify(policy), policy.environment) || !key || key.key.length !== 32 || !/^[A-Za-z0-9_.:-]{1,128}$/.test(key.keyId) || !uuid(requestId) || !uuid(operationId) || signal.aborted) return { kind: "unavailable" };
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(policy.maxRunMs)]);
  const lease = parseExportLease(await domain("claim", { requestId, operationId, maxRunMs: policy.maxRunMs, expectedEnvironment: policy.environment, expectedKeyId: key.keyId }, bounded), requestId);
  if (!lease) return { kind: "unavailable" };
  const binding = { requestId, leaseId: lease.leaseId, generation: lease.generation };
  const valid = async () => {
    const v = await domain("validate", binding, bounded);
    return record(v) && Object.keys(v).sort().join() === "current,kind" && v.kind === "privacy_export_lease_state/1" && v.current === true;
  };
  const handlers = existingExportHandlers(lease, modules);
  const trip = { sections: ["trips"], consistency: "live_bounded" as const, page: async (_section: string, cursor: unknown, limit: number, pageSignal: AbortSignal) => {
    if (cursor !== null && !uuid(cursor)) throw Error("Trip export cursor invalid");
    const v = await domain("trip_page", { ...binding, afterTripId: cursor, limit }, pageSignal);
    if (!record(v) || Object.keys(v).sort().join() !== "hasMore,items,nextCursor,schemaVersion,section,sectionComplete" || v.schemaVersion !== "trip-core-export/1" || v.section !== "trips" || !Array.isArray(v.items)
      || typeof v.hasMore !== "boolean" || v.sectionComplete !== !v.hasMore || (v.hasMore ? !uuid(v.nextCursor) : v.nextCursor !== null)) throw Error("Trip export unavailable");
    return { items: v.items, hasMore: v.hasMore, nextCursor: v.nextCursor, sectionComplete: !v.hasMore };
  } };
  const bundle = await collectCoreExport(lease, { ...handlers, trip }, policy, valid, bounded);
  if (!bundle) return { kind: "unavailable" }; // Unknown/expired lease cannot be failed or completed by this caller.
  const artifact = encryptExportArtifact(bundle, lease, key, new Date(Date.now() + policy.artifactTtlMs).toISOString());
  if (!artifact || !await valid()) return { kind: "unavailable" };
  const input = { ...binding, artifact, modules: bundle.modules, coverage: bundle.coverage };
  const committed = (value: unknown) => {
    const receipt = parseExportJob(value, requestId);
    return receipt && receipt.generation === lease.generation && receipt.artifactDigest === artifact.plaintextDigest
      && receipt.artifactBytes === artifact.plaintextBytes && receipt.artifactExpiresAt !== null
      && Date.parse(receipt.artifactExpiresAt) <= Date.parse(artifact.expiresAt) && Date.parse(receipt.artifactExpiresAt) > Date.now()
      && receipt.state === (bundle.coverage === "partial" ? "ready_partial" : "ready_complete") ? receipt : null;
  };
  try {
    const receipt = committed(await domain("commit", input, bounded));
    if (!receipt) throw Error("Unknown export commit");
    return receipt;
  }
  catch {
    // Dedicated service recovery, no user JWT, no re-export or lease renewal. Never claim unknown committed.
    if (bounded.aborted) return { kind: "unknown" };
    const recovery = await domain("execution_receipt", { ...binding, expectedArtifactDigest: artifact.plaintextDigest }, bounded);
    return exportRecord(recovery) && exportExact(recovery, ["kind", "outcome", "receipt"])
      && recovery.kind === "privacy_export_execution_receipt/1" && recovery.outcome === "terminal"
      && committed(recovery.receipt) ? committed(recovery.receipt) : { kind: "unknown" };
  }
}
