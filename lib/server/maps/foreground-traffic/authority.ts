import { createMapsServiceRoleClient } from "../service-role-client.ts";
import { randomUUID } from "node:crypto";
import { createPolicyRegistry, evaluatePolicyDecision } from "../../policy/receipts.ts";
import { record, uuid, type TrafficBinding } from "./contract.ts";
import type { FieldRights } from "./service.ts";

export type TrafficScope = Pick<TrafficBinding, "tripId" | "dayId" | "itemId" | "originPlaceReferenceId" | "destinationPlaceReferenceId" | "mode" | "departure"> & { expectedHeadVersion: number };
export type VerifiedTrafficActor = { subject: string; sessionId: string; mobileEpoch: number | null };
export type TrafficRPC = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export type TrafficPolicy = { policyId: string; policyRevision: number; sourceVersion: string; accountScope: string; stopEpoch: number; stopped: boolean; allowedEndpointModes: ("walking" | "transit" | "driving")[]; endpoints: Record<string, unknown>; rights: FieldRights };
const canonical = (v: unknown): string => JSON.stringify(v, (key, value) => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Dedicated server-only producer transport. Reuses existing secure credentials;
 * role capability and SQL EXECUTE remain independently revoked by default.
 * Never use this RPC for ordinary owner reads or forward a public body to it. */
export function createTrafficProducerRPC(env: Readonly<Record<string, string | undefined>>, signal: AbortSignal, fetcher: typeof fetch): TrafficRPC | null {
  if (env.VISEPANDA_FOREGROUND_TRAFFIC_ENABLED !== "true") return null;
  const client = createMapsServiceRoleClient(env, fetcher);
  if (!client) return null;
  const allowed = new Set(["foreground_traffic_policy_v1", "foreground_traffic_producer_v1"]);
  return async (name, params) => {
    if (!allowed.has(name) || signal.aborted) return { data: null, error: "TRAFFIC_AUTHORITY_UNAVAILABLE" };
    const result = await client.rpc(name, params).abortSignal(signal);
    return { data: result.data, error: result.error };
  };
}
/** Current SQL authority is the source; the evaluator only applies its closed field semantics. */
export function decodeTrafficPolicy(v: unknown, mode: TrafficBinding["mode"]): TrafficPolicy | null {
  if (!record(v) || v.kind !== "policy" || !uuid(v.policyId) || !integer(v.policyRevision) || v.policyRevision < 1
    || typeof v.sourceVersion !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v.sourceVersion) || typeof v.accountScope !== "string" || !v.accountScope || v.accountScope.length > 128
    || !Array.isArray(v.allowedEndpointModes) || !v.allowedEndpointModes.length || v.allowedEndpointModes.length > 3
    || !v.allowedEndpointModes.every(m => ["walking", "transit", "driving"].includes(m)) || new Set(v.allowedEndpointModes).size !== v.allowedEndpointModes.length || !v.allowedEndpointModes.includes(mode)
    || !integer(v.stopEpoch) || typeof v.stopped !== "boolean" || !record(v.endpoints) || !record(v.policy)) return null;
  const policy = v.policy;
  try {
    const registry = createPolicyRegistry({ policies: [policy] });
    const granted = (field: string) => ([ ["display", "explore"], ["cache", "explore"], ["persist", "trip_planning"] ] as const)
      .every(([action, purpose]) => evaluatePolicyDecision(registry, { now: new Date().toISOString(), requestId: "foreground", policyId: policy.policyId, action, purpose, field, region: "cn" }).kind === "allowed");
    if (!["duration", "distance", "derived_change", "receipt_metadata"].every(granted) || policy.derivative !== "allowed" || policy.retention !== "durable") return null;
    const deadlines = [policy.expiresAt, policy.termsRecheckAt, ...(policy.trialEndsAt === null ? [] : [policy.trialEndsAt])];
    if (!deadlines.every(d => typeof d === "string" && Date.parse(d) > Date.now()) || typeof policy.policyId !== "string" || typeof policy.sourceId !== "string" || typeof policy.licenceVersion !== "string") return null;
    for (const name of ["origin", "destination"]) {
      const endpoint = v.endpoints[name];
      if (!record(endpoint) || !uuid(endpoint.referenceId) || !uuid(endpoint.canonicalPoiId) || !uuid(endpoint.mappingId)
        || typeof endpoint.providerPoiId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(endpoint.providerPoiId)
        || typeof endpoint.canonicalFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(endpoint.canonicalFingerprint)
        || typeof endpoint.mappingFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(endpoint.mappingFingerprint)) return null;
    }
    return { policyId: v.policyId, policyRevision: v.policyRevision, sourceVersion: v.sourceVersion, accountScope: v.accountScope,
      stopEpoch: v.stopEpoch, stopped: v.stopped, allowedEndpointModes: v.allowedEndpointModes, endpoints: structuredClone(v.endpoints), rights: { policyId: v.policyId, version: v.policyRevision,
        sourceId: policy.sourceId, licenceVersion: policy.licenceVersion, expiresAt: new Date(Math.min(...deadlines.map(d => Date.parse(d as string)))).toISOString(),
        tmcAllowed: v.allowedEndpointModes.includes("driving") && granted("tmc"), allowedEndpointModes: v.allowedEndpointModes } };
  } catch { return null; }
}

export function createTrafficAuthority(scope: TrafficScope, actor: VerifiedTrafficActor, producer: TrafficRPC | null, owner: TrafficRPC) {
  let policy: TrafficPolicy | null = null, dispatchId: string | null = null, requestIndex = 0;
  let requestTail: Promise<boolean> = Promise.resolve(true);
  const trusted = async (action: string, input: Record<string, unknown>) => producer
    ? producer("foreground_traffic_producer_v1", { p_action: action, p_input: input, p_actor: actor }) : { data: null, error: "TRAFFIC_AUTHORITY_UNAVAILABLE" };
  return {
    async policy() {
      if (!producer) return null;
      const result = await producer("foreground_traffic_policy_v1", { p_scope: scope, p_actor: actor });
      const current = result.error ? null : decodeTrafficPolicy(result.data, scope.mode);
      // Preserve exact first authority for before-each-request requalification.
      if (!policy && current) policy = current;
      if (policy && current && (canonical(policy.endpoints) !== canonical(current.endpoints) || policy.sourceVersion !== current.sourceVersion
        || policy.policyId !== current.policyId || policy.policyRevision !== current.policyRevision || policy.stopEpoch !== current.stopEpoch)) return null;
      return current;
    },
    async begin(operation: "check" | "refresh") {
      if (!policy || !producer) return false;
      const result = await trusted("begin", { operationId: randomUUID(), scope, policyId: policy.policyId, policyRevision: policy.policyRevision,
        stopEpoch: policy.stopEpoch, operation, endpoints: policy.endpoints });
      if (result.error || !record(result.data) || result.data.kind !== "dispatch" || !uuid(result.data.dispatchId) || result.data.stopEpoch !== policy.stopEpoch) return false;
      dispatchId = result.data.dispatchId; requestIndex = 0; return true;
    },
    request(endpointKind: "detail" | "walking" | "transit" | "driving") {
      const next = requestTail.then(async allowed => {
        if (!allowed || !dispatchId || requestIndex >= 5) return false;
        const index = ++requestIndex;
        const result = await trusted("request", { dispatchId, requestIndex: index, endpointKind });
        return !result.error && record(result.data) && result.data.kind === "request" && result.data.dispatchId === dispatchId && result.data.requestIndex === index;
      });
      requestTail = next.catch(() => false); return requestTail;
    },
    async complete(fetchedAt: string, selected: unknown, alternatives: unknown[], previousReceiptId: string | null) {
      if (!dispatchId) return null;
      const result = await trusted("complete", { dispatchId, fetchedAt, selected, alternatives, previousReceiptId });
      const receipt = result.error || !record(result.data) || result.data.kind !== "receipt" ? null : decodeTrafficReceipt(result.data.receipt, scope);
      if (!receipt || receipt.dispatchId !== dispatchId || Date.parse(receipt.fetchedAt as string) !== Date.parse(fetchedAt) || receipt.previousReceiptId !== previousReceiptId
        || canonical(receipt.selected) !== canonical(selected) || canonical(receipt.alternatives) !== canonical(alternatives)) return null;
      // Producer cannot invoke the owner-only ItemSupport source chain. A separate
      // ordinary JWT read may qualify R2; missing source never upgrades producer ACK.
      const current = await readCurrentForegroundTrafficReceipt(owner, receipt.receiptId as string, scope);
      if (!current) return receipt;
      if (canonical({ ...receipt, r2Qualified: false }) !== canonical({ ...current, r2Qualified: false })) return null;
      return current;
    },
    async unknown() { if (dispatchId) await trusted("unknown", { dispatchId }); },
    async stop(expectedStopEpoch: number | null) {
      let epoch = expectedStopEpoch;
      if (epoch === null) {
        const current = await owner("read_foreground_traffic_scope_v1", { p_scope: scope });
        if (current.error || !record(current.data) || current.data.kind !== "scope" || Object.keys(current.data).length !== 3
          || !integer(current.data.stopEpoch) || typeof current.data.stopped !== "boolean") return false;
        epoch = current.data.stopEpoch;
      }
      const result = await owner("stop_foreground_traffic_v1", { p_scope: scope, p_expected_stop_epoch: epoch });
      return !result.error && record(result.data) && result.data.kind === "stopped";
    },
    async read(receiptId: string) { return readCurrentForegroundTrafficReceipt(owner, receiptId, scope); },
  };
}
export function decodeTrafficReceipt(v: unknown, scope: TrafficScope): Record<string, unknown> | null {
  if (!record(v) || !uuid(v.receiptId) || !uuid(v.dispatchId) || !record(v.scope) || !Object.keys(scope).every(k => v.scope && record(v.scope) && v.scope[k] === scope[k as keyof TrafficScope]) || Object.keys(v.scope).length !== Object.keys(scope).length
    || !uuid(v.policyId) || !integer(v.policyRevision) || v.policyRevision < 1 || typeof v.sourceVersion !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v.sourceVersion)
    || !integer(v.stopEpoch) || typeof v.fetchedAt !== "string" || !Number.isFinite(Date.parse(v.fetchedAt)) || Date.parse(v.fetchedAt) > Date.now()
    || typeof v.expiresAt !== "string" || !Number.isFinite(Date.parse(v.expiresAt)) || Date.parse(v.expiresAt) <= Date.now()
    || Date.parse(v.expiresAt) - Date.parse(v.fetchedAt) > 300000 || v.providerObservedAt !== null || typeof v.r2Qualified !== "boolean"
    || !["route_estimate_changed", "route_condition_changed", "unchanged", "first_observation"].includes(v.changeKind as string)
    || !summary(v.selected) || v.selected.mode !== scope.mode
    || !Array.isArray(v.alternatives) || v.alternatives.length > 2 || !v.alternatives.every(summary)
    || v.alternatives.some(a => a.mode === scope.mode) || new Set(v.alternatives.map(a => a.mode)).size !== v.alternatives.length
    || v.routeChangeCaveat !== true || (v.previousReceiptId !== null && !uuid(v.previousReceiptId))
    || (v.durationDeltaSeconds !== null && (typeof v.durationDeltaSeconds !== "number" || !Number.isSafeInteger(v.durationDeltaSeconds) || Math.abs(v.durationDeltaSeconds) > 604800))) return null;
  const keys = ["receiptId", "dispatchId", "scope", "stopEpoch", "policyId", "policyRevision", "sourceVersion", "fetchedAt", "providerObservedAt", "expiresAt", "selected", "alternatives", "previousReceiptId", "changeKind", "durationDeltaSeconds", "routeChangeCaveat", "r2Qualified"];
  if (Object.keys(v).length !== keys.length || !keys.every(k => Object.hasOwn(v, k))) return null;
  return structuredClone(v);
}
function summary(v: unknown): v is { mode: string; durationSeconds: number; distanceMeters: number; tmc: unknown } {
  if (!record(v) || Object.keys(v).length !== 4 || !["walking", "transit", "driving"].includes(v.mode as string)
    || !integer(v.durationSeconds) || v.durationSeconds > 604800 || !integer(v.distanceMeters) || v.distanceMeters > 100000000) return false;
  if (v.tmc === null) return true;
  const categories = ["unknown", "smooth", "slow", "congested", "severely_congested"];
  if (v.mode !== "driving" || !record(v.tmc) || Object.keys(v.tmc).length !== 5 || !categories.every(k => typeof (v.tmc as Record<string, unknown>)[k] === "number" && Number.isFinite((v.tmc as Record<string, number>)[k]) && (v.tmc as Record<string, number>)[k] >= 0)) return false;
  return Object.values(v.tmc).reduce<number>((sum, value) => sum + (value as number), 0) <= 100000000;
}
export async function readCurrentForegroundTrafficReceipt(owner: TrafficRPC, receiptId: string, scope: TrafficScope): Promise<Record<string, unknown> | null> {
  if (!uuid(receiptId)) return null;
  try {
    const result = await owner("read_foreground_traffic_v1", { p_receipt: receiptId, p_scope: scope });
    const receipt = !result.error && record(result.data) && result.data.kind === "receipt" ? decodeTrafficReceipt(result.data.receipt, scope) : null;
    return receipt?.receiptId === receiptId ? receipt : null;
  } catch { return null; }
}
/** Ordinary exact owner reader for #220. No Maps traffic and no local receipt fallback.
 * The private SQL confirmation seam must requalify again inside original confirm. */
export async function readQualifiedForegroundTrafficReceipt(owner: TrafficRPC, receiptId: string, scope: TrafficScope) {
  if (!uuid(receiptId)) return { kind: "unavailable" as const };
  const receipt = await readCurrentForegroundTrafficReceipt(owner, receiptId, scope);
  return receipt?.r2Qualified === true && ["route_estimate_changed", "route_condition_changed"].includes(receipt.changeKind as string)
    ? { kind: "qualified" as const, receipt } : { kind: "unavailable" as const };
}
