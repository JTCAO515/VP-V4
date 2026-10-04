import { randomUUID } from "node:crypto";
import { POLICY, enabled, scopeKey, type TrafficBinding, type TrafficInput } from "./contract.ts";
import { observeForegroundRoute, type TrafficCondition, type ForegroundProviderResult } from "./provider.ts";

export type FieldRights = { policyId: string; version: number; sourceId: string; licenceVersion: string; expiresAt: string; tmcAllowed?: boolean; allowedEndpointModes?: TrafficBinding["mode"][] };
export type Receipt = {
  receiptId: string; binding: TrafficBinding; originId: string; destinationId: string; fetchedAt: string; expiresAt: string;
  durationSeconds: number; distanceMeters: number; condition: TrafficCondition; policy: FieldRights;
};
type Window = { startsAt: number; lastAttemptAt: number; attempts: number; busy: boolean; stopped: boolean; costUnknown: boolean; receipt: Receipt | null; controller: AbortController | null };
type Dependencies = {
  env: Readonly<Record<string, string | undefined>>; signal: AbortSignal;
  authorize: () => Promise<boolean>; quota: (kind: "detail" | TrafficBinding["mode"]) => Promise<boolean>; rights: () => Promise<FieldRights | null>;
  resolve: () => Promise<{ originId: string; destinationId: string } | null>; fetcher: typeof fetch;
  durable?: {
    begin: (operation: "check" | "refresh") => Promise<boolean>;
    complete: (fetchedAt: string, selected: unknown, alternatives: unknown[], previousReceiptId: string | null) => Promise<Record<string, unknown> | null>;
    unknown: () => Promise<void>; stop: (epoch: number | null) => Promise<boolean>; read: (receiptId: string) => Promise<Record<string, unknown> | null>;
  };
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
  function expire(key: string, window: Window) {
    const timer = setTimeout(() => {
      window.stopped = true; window.receipt = null; window.controller?.abort();
      if (windows.get(key) === window) windows.delete(key);
    }, Math.max(1, window.startsAt + POLICY.ttlMs - Date.now()));
    timer.unref();
  }
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
      forget(binding);
      if (deps.durable && !await deps.durable.stop(input.expectedStopEpoch)) return unavailable("DURABLE_STOP_UNAVAILABLE");
      return { ...unavailable("FOREGROUND_STOPPED"), status: "stopped", scopeStopConfirmed: !!deps.durable };
    }
    if (!enabled(deps.env) || deps.signal.aborted) { forget(binding); return unavailable("FOREGROUND_DISABLED"); }
    if (!await deps.authorize()) { forgetActor(binding.actor); return unavailable("CURRENT_SCOPE_UNAVAILABLE"); }
    const rights = await deps.rights();
    if (!rightsCurrent(rights)) { forget(binding); return unavailable("FIELD_RIGHTS_UNAVAILABLE"); }
    let previous = window?.receipt;
    if (!previous && input.previousReceiptId && deps.durable) {
      const stored = await deps.durable.read(input.previousReceiptId);
      const endpoints = await deps.resolve();
      if (stored && endpoints && typeof stored.receiptId === "string" && typeof stored.fetchedAt === "string" && typeof stored.expiresAt === "string"
        && stored.selected && typeof stored.selected === "object" && "durationSeconds" in stored.selected && "distanceMeters" in stored.selected
        && typeof stored.selected.durationSeconds === "number" && typeof stored.selected.distanceMeters === "number") {
        const selected = stored.selected as { durationSeconds: number; distanceMeters: number; tmc?: unknown };
        const tmc = selected.tmc as { unknown: number; smooth: number; slow: number; congested: number; severely_congested: number } | null;
        previous = { receiptId: stored.receiptId, binding: structuredClone(binding), ...endpoints, fetchedAt: stored.fetchedAt, expiresAt: stored.expiresAt,
          durationSeconds: selected.durationSeconds, distanceMeters: selected.distanceMeters,
          condition: tmc ? { status: "observed", meters: { unknown: tmc.unknown, clear: tmc.smooth, slow: tmc.slow, congested: tmc.congested, severe: tmc.severely_congested } } : { status: "uncovered", meters: null }, policy: rights };
      }
    }
    if (input.previousReceiptId !== null && (!previous || previous.receiptId !== input.previousReceiptId)) return unavailable("RECEIPT_UNAVAILABLE");
    if (input.operation === "refresh" && (!previous || input.previousReceiptId === null)) return unavailable("RECEIPT_UNAVAILABLE");
    const now = Date.now();
    // SQL remains the durable budget authority. Its receipt can restore only the
    // exact baseline after instance loss, never grant a provider dispatch.
    if (!window && previous && deps.durable) {
      if (windows.size >= POLICY.activeScopes) return unavailable("INSTANCE_CAPACITY");
      window = { startsAt: Date.parse(previous.fetchedAt), lastAttemptAt: Date.parse(previous.fetchedAt), attempts: 1,
        busy: false, stopped: false, costUnknown: false, receipt: previous, controller: null };
      windows.set(key, window); expire(key, window);
    }
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
      windows.set(key, window); expire(key, window);
    }
    window.stopped = false; window.busy = true; window.attempts++; window.lastAttemptAt = now;
    const active = window; const controller = new AbortController(); active.controller = controller;
    const signal = AbortSignal.any([deps.signal, controller.signal]);
    let dispatched = false;
    try {
      if (deps.durable && !await deps.durable.begin(input.operation)) return unavailable("DURABLE_DISPATCH_UNAVAILABLE");
      const observation = await observeForegroundRoute(endpoints, { env: deps.env, signal, fetcher: deps.fetcher, includeTraffic: rights.tmcAllowed === true, modes: rights.allowedEndpointModes,
        beforeRequest: async kind => {
          if (active.stopped || signal.aborted || !enabled(deps.env) || !await deps.authorize()) return false;
          const currentRights = await deps.rights();
          if (!rightsCurrent(currentRights) || !same(rights, currentRights) || !same(endpoints, await deps.resolve())) return false;
          // Global atomic quota before EACH detail/mode request. Cold start cannot bypass it.
          if (!await deps.quota(kind) || active.stopped || signal.aborted) return false;
          dispatched = true; return true;
        } });
      if (!observation) { active.receipt = null; active.costUnknown = dispatched; if (deps.durable) await deps.durable.unknown(); return unavailable(dispatched ? "PROVIDER_COST_UNKNOWN" : "CURRENT_SCOPE_UNAVAILABLE"); }
      const finalRights = await deps.rights();
      if (active.stopped || signal.aborted || !await deps.authorize() || !rightsCurrent(finalRights) || !same(rights, finalRights)
        || !same(endpoints, await deps.resolve())) { active.receipt = null; if (deps.durable) await deps.durable.unknown(); return unavailable("CURRENT_SCOPE_UNAVAILABLE"); }
      const selected = observation.options.find(o => o.mode === binding.mode && o.status === "observed");
      if (!selected || selected.durationSeconds === undefined || selected.distanceMeters === undefined) { active.receipt = null; if (deps.durable) await deps.durable.unknown(); return { ...unavailable("SELECTED_MODE_UNCOVERED"), providerCalls: observation.providerCalls }; }
      const expiresAt = new Date(Math.min(Date.parse(observation.expiresAt), Date.parse(rights.expiresAt), active.startsAt + POLICY.ttlMs)).toISOString();
      if (Date.parse(expiresAt) <= Date.now()) { active.receipt = null; return unavailable("OBSERVATION_EXPIRED"); }
      const receipt: Receipt = { receiptId: randomUUID(), binding: structuredClone(binding), ...endpoints, fetchedAt: observation.fetchedAt, expiresAt,
        durationSeconds: selected.durationSeconds, distanceMeters: selected.distanceMeters,
        condition: binding.mode === "driving" ? observation.condition : { status: "uncovered", meters: null }, policy: structuredClone(rights) };
      const comparison = compare(previous ?? null, receipt);
      const alternatives = explainAlternatives(observation, binding.mode, comparison.kind !== "no_change" && comparison.kind !== "first_observation");
      const durableReceipt = deps.durable ? await deps.durable.complete(observation.fetchedAt, summary(selected, receipt.condition),
        observation.options.filter(o => o.mode !== binding.mode && o.status === "observed").slice(0, 2).map(o => summary(o, { status: "uncovered", meters: null })),
        input.previousReceiptId) : null;
      if (deps.durable && !durableReceipt) { active.receipt = null; await deps.durable.unknown(); return unavailable("DURABLE_RECEIPT_UNAVAILABLE"); }
      const outputRights = await deps.rights();
      if (signal.aborted || active.stopped || !await deps.authorize() || !rightsCurrent(outputRights) || !same(rights, outputRights)) { active.receipt = null; return unavailable("CURRENT_SCOPE_UNAVAILABLE"); }
      if (durableReceipt && typeof durableReceipt.receiptId === "string" && typeof durableReceipt.expiresAt === "string") {
        receipt.receiptId = durableReceipt.receiptId;
        receipt.expiresAt = new Date(Math.min(Date.parse(expiresAt), Date.parse(durableReceipt.expiresAt))).toISOString();
      }
      active.receipt = receipt;
      const expiry = setTimeout(() => { if (active.receipt === receipt) active.receipt = null; }, Math.max(1, Date.parse(receipt.expiresAt) - Date.now()));
      expiry.unref();
      return { kind: "foreground_traffic/1", status: "observed", receiptId: receipt.receiptId, fetchedAt: receipt.fetchedAt, expiresAt: receipt.expiresAt,
        provider: "amap", mode: binding.mode, departure: "now", providerObservedAt: null, currentness: "fetch_time_only",
        traffic: receipt.condition, closure: "uncovered", realtimeTransit: "uncovered", prediction: "unavailable",
        selected: summary(selected, receipt.condition), comparison, alternatives,
        durableReceipt, fallback: "existing_trip_address_and_navigation", providerCalls: observation.providerCalls, tripMutation: "none",
        qualification: durableReceipt?.r2Qualified === true && ["route_estimate_changed", "route_condition_changed"].includes(durableReceipt.changeKind as string) ? { status: "qualified", reason: null } : { status: "unavailable", reason: "DURABLE_SOURCE_AUTHORITY_UNAVAILABLE" }, policy: rights };
    } catch { active.receipt = null; active.costUnknown = dispatched; if (deps.durable) { try { await deps.durable.unknown(); } catch { /* unknown remains frozen */ } } return unavailable(dispatched ? "PROVIDER_COST_UNKNOWN" : "CURRENT_SCOPE_UNAVAILABLE"); }
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
  return observation.options.filter(o => o.mode !== mode && o.status === "observed").slice(0, 2).map(option => ({ option: summary(option, { status: "uncovered", meters: null }),
    explanation: "whole_amap_plan_for_same_endpoints", limitations: "estimate_only_check_transfers_walking_and_tolls" }));
}
function summary(option: import("../route-comparison.ts").RouteOption, condition: TrafficCondition) {
  const meters = condition.meters;
  return { mode: option.mode, durationSeconds: option.durationSeconds, distanceMeters: option.distanceMeters,
    tmc: meters ? { unknown: meters.unknown, smooth: meters.clear, slow: meters.slow, congested: meters.congested, severely_congested: meters.severe } : null };
}
export const foregroundTrafficService = createForegroundTrafficService();
