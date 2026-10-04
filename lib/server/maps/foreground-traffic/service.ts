import { randomUUID } from "node:crypto";
import { POLICY, enabled, scopeKey, type TrafficBinding, type TrafficInput } from "./contract.ts";
import { observeForegroundRoute, type TrafficCondition, type ForegroundProviderResult } from "./provider.ts";

export type FieldRights = { policyId: string; version: number; sourceId: string; licenceVersion: string; expiresAt: string };
export type Receipt = {
  receiptId: string; binding: TrafficBinding; originId: string; destinationId: string; fetchedAt: string; expiresAt: string;
  durationSeconds: number; distanceMeters: number; condition: TrafficCondition; policy: FieldRights;
};
type Window = { startsAt: number; lastAttemptAt: number; attempts: number; busy: boolean; stopped: boolean; costUnknown: boolean; receipt: Receipt | null; controller: AbortController | null };
type Dependencies = {
  env: Readonly<Record<string, string | undefined>>; signal: AbortSignal;
  authorize: () => Promise<boolean>; quota: () => Promise<boolean>; rights: () => Promise<FieldRights | null>;
  resolve: () => Promise<{ originId: string; destinationId: string } | null>; fetcher: typeof fetch;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rightsCurrent = (rights: FieldRights | null): rights is FieldRights => !!rights && Number.isSafeInteger(rights.version) && rights.version > 0
  && Date.parse(rights.expiresAt) > Date.now();
const unavailable = (reason: string) => ({ kind: "foreground_traffic/1", status: "unavailable", reason, tripMutation: "none", providerCalls: 0,
  fallback: "existing_trip_address_and_navigation", qualification: { status: "unavailable", reason: "DURABLE_SOURCE_AUTHORITY_UNAVAILABLE" } });

/** Additional bounded instance window; original atomic actor quota is still mandatory.
 * No process receipt is ever qualified for SQL confirmation. */
export function createForegroundTrafficService() {
  const windows = new Map<string, Window>();
  const prune = () => { for (const [key, window] of windows) if (Date.now() - window.startsAt >= POLICY.ttlMs && !window.busy) windows.delete(key); };
  function forget(binding: TrafficBinding) {
    const window = windows.get(scopeKey(binding));
    if (window) { window.stopped = true; window.receipt = null; window.controller?.abort(); }
  }
  function forgetActor(actor: string) {
    for (const [key, window] of windows) if ((JSON.parse(key) as TrafficBinding).actor === actor) {
      window.stopped = true; window.receipt = null; window.controller?.abort();
    }
  }
  async function run(binding: TrafficBinding, input: TrafficInput, deps: Dependencies) {
    prune(); const key = scopeKey(binding); let window = windows.get(key);
    if (input.operation === "stop" || !input.foreground || !input.mapConsent) {
      forget(binding); return { ...unavailable("FOREGROUND_STOPPED"), status: "stopped" };
    }
    if (!enabled(deps.env) || deps.signal.aborted) { forget(binding); return unavailable("FOREGROUND_DISABLED"); }
    if (!await deps.authorize()) { forgetActor(binding.actor); return unavailable("CURRENT_SCOPE_UNAVAILABLE"); }
    const rights = await deps.rights();
    if (!rightsCurrent(rights)) { forget(binding); return unavailable("FIELD_RIGHTS_UNAVAILABLE"); }
    const previous = window?.receipt;
    if (input.previousReceiptId !== null && (!previous || previous.receiptId !== input.previousReceiptId)) return unavailable("RECEIPT_UNAVAILABLE");
    if (input.operation === "refresh" && (!previous || input.previousReceiptId === null)) return unavailable("RECEIPT_UNAVAILABLE");
    const now = Date.now();
    if (window?.busy || window && now - window.lastAttemptAt < POLICY.throttleMs) return unavailable("THROTTLED");
    if (window?.costUnknown || window && window.attempts >= POLICY.comparisons) return unavailable("WINDOW_BUDGET_EXHAUSTED");
    if (input.operation === "refresh" && window && now - window.lastAttemptAt < POLICY.refreshMs && input.movementMeters < POLICY.movementMeters) return unavailable("REFRESH_THRESHOLD_NOT_MET");
    const endpoints = await deps.resolve();
    if (!endpoints) { forget(binding); return unavailable("EXACT_ENDPOINTS_UNAVAILABLE"); }
    // Recheck after awaited identity/mapping reads: concurrent callers cannot
    // each create or spend an independent window for the same viewed scope.
    window = windows.get(key);
    if (window?.busy || window && Date.now() - window.lastAttemptAt < POLICY.throttleMs) return unavailable("THROTTLED");
    if (window?.costUnknown || window && window.attempts >= POLICY.comparisons) return unavailable("WINDOW_BUDGET_EXHAUSTED");
    if (!window) {
      if (windows.size >= POLICY.activeScopes) return unavailable("INSTANCE_CAPACITY");
      window = { startsAt: now, lastAttemptAt: now, attempts: 0, busy: false, stopped: false, costUnknown: false, receipt: null, controller: null };
      windows.set(key, window);
    }
    window.stopped = false; window.busy = true; window.attempts++; window.lastAttemptAt = now;
    const active = window; const controller = new AbortController(); active.controller = controller;
    const signal = AbortSignal.any([deps.signal, controller.signal]);
    let dispatched = false;
    try {
      const observation = await observeForegroundRoute(endpoints, { env: deps.env, signal, fetcher: deps.fetcher,
        beforeRequest: async () => {
          if (active.stopped || signal.aborted || !enabled(deps.env) || !await deps.authorize()) return false;
          const currentRights = await deps.rights();
          if (!rightsCurrent(currentRights) || !same(rights, currentRights) || !same(endpoints, await deps.resolve())) return false;
          // Global atomic quota before EACH detail/mode request. Cold start cannot bypass it.
          if (!await deps.quota() || active.stopped || signal.aborted) return false;
          dispatched = true; return true;
        } });
      if (!observation) { active.receipt = null; active.costUnknown = dispatched; return unavailable(dispatched ? "PROVIDER_COST_UNKNOWN" : "CURRENT_SCOPE_UNAVAILABLE"); }
      const finalRights = await deps.rights();
      if (active.stopped || signal.aborted || !await deps.authorize() || !rightsCurrent(finalRights) || !same(rights, finalRights)
        || !same(endpoints, await deps.resolve())) { active.receipt = null; return unavailable("CURRENT_SCOPE_UNAVAILABLE"); }
      const selected = observation.options.find(o => o.mode === binding.mode && o.status === "observed");
      if (!selected || selected.durationSeconds === undefined || selected.distanceMeters === undefined) { active.receipt = null; return { ...unavailable("SELECTED_MODE_UNCOVERED"), providerCalls: observation.providerCalls, destination: observation.destination }; }
      const expiresAt = new Date(Math.min(Date.parse(observation.expiresAt), Date.parse(rights.expiresAt), active.startsAt + POLICY.ttlMs)).toISOString();
      if (Date.parse(expiresAt) <= Date.now()) { active.receipt = null; return unavailable("OBSERVATION_EXPIRED"); }
      const receipt: Receipt = { receiptId: randomUUID(), binding: structuredClone(binding), ...endpoints, fetchedAt: observation.fetchedAt, expiresAt,
        durationSeconds: selected.durationSeconds, distanceMeters: selected.distanceMeters,
        condition: binding.mode === "driving" ? observation.condition : { status: "uncovered", meters: null }, policy: structuredClone(rights) };
      const comparison = compare(previous ?? null, receipt);
      active.receipt = receipt;
      return { kind: "foreground_traffic/1", status: "observed", receiptId: receipt.receiptId, fetchedAt: receipt.fetchedAt, expiresAt,
        provider: "amap", mode: binding.mode, departure: "now", providerObservedAt: null, currentness: "fetch_time_only",
        traffic: receipt.condition, closure: "uncovered", realtimeTransit: "uncovered", prediction: "unavailable",
        selected, comparison, alternatives: explainAlternatives(observation, binding.mode, comparison.kind !== "no_change" && comparison.kind !== "first_observation"),
        destination: observation.destination, providerCalls: observation.providerCalls, tripMutation: "none",
        qualification: { status: "unavailable", reason: "DURABLE_SOURCE_AUTHORITY_UNAVAILABLE" }, policy: rights };
    } catch { active.receipt = null; active.costUnknown = dispatched; return unavailable(dispatched ? "PROVIDER_COST_UNKNOWN" : "CURRENT_SCOPE_UNAVAILABLE"); }
    finally { active.busy = false; active.controller = null; }
  }
  return { run, forget, forgetActor };
}
function compare(previous: Receipt | null, current: Receipt) {
  if (!previous) return { kind: "first_observation", durationDeltaSeconds: null, caveat: "no_baseline" };
  if (Date.parse(previous.expiresAt) <= Date.now() || !same(previous.policy, current.policy)) return { kind: "baseline_expired", durationDeltaSeconds: null, caveat: "recheck_required" };
  if (previous.originId !== current.originId || previous.destinationId !== current.destinationId) return { kind: "endpoint_changed", durationDeltaSeconds: null, caveat: "different_route" };
  const delta = current.durationSeconds - previous.durationSeconds;
  if (previous.condition.status === "observed" && current.condition.status === "observed" && !same(previous.condition.meters, current.condition.meters)) return { kind: "route_condition_changed", durationDeltaSeconds: delta, caveat: "may_reflect_different_route_not_incident" };
  if (Math.abs(delta) >= Math.max(120, previous.durationSeconds * 0.2)) return { kind: "route_estimate_changed", durationDeltaSeconds: delta, caveat: "estimate_not_traffic_event" };
  return { kind: "no_change", durationDeltaSeconds: delta, caveat: "no_material_observed_change_not_no_incidents" };
}
function explainAlternatives(observation: ForegroundProviderResult, mode: TrafficBinding["mode"], changed: boolean) {
  if (!changed) return [];
  return observation.options.filter(o => o.mode !== mode && o.status === "observed").slice(0, 2).map(option => ({ option,
    explanation: "whole_amap_plan_for_same_endpoints", limitations: "estimate_only_check_transfers_walking_and_tolls" }));
}
export const foregroundTrafficService = createForegroundTrafficService();
