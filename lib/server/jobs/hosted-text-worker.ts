import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { createStagingTextJob, type StagingTextJobConfig, type StagingTextJobDependencies, type TextJobPricing } from "./staging-text-job.ts";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";
import type { ValidatedUsageReceipt } from "../model-gateway/budget/usage-receipt.ts";
import type { KnowledgeValidationReceipt } from "../turn/text-worker.ts";
import type { DestinationReceipt } from "../model-gateway/adapters/http-transport.ts";
import { supabaseWorkerHeaders } from "./supabase-worker-headers.ts";

/**
 * VPJ-07 #195 hosted text worker. One long-running trusted process (a small
 * container, never a Vercel function) serves every owner/policy group that SQL
 * reports as ready, instead of one hand-written owner/policy/job file.
 *
 * Authority is unchanged: each group is executed through the existing
 * createStagingTextJob -> scoped claimer -> dispatch authorization -> durable
 * budget -> atomic completion path. This module only chooses WHICH existing
 * scoped job to run and adds an operator stop switch plus a content-free
 * heartbeat. Missing/ambiguous budget scope, unknown mode or a policy endpoint
 * other than the process's bound Qwen endpoint => the group is skipped, never
 * guessed. SQL switch disabled => no discovery and no claim.
 */

export const HOSTED_STAGING_DATABASE_URL = "https://dzqdzetcctkhbrhlxxgn.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = ["current_input_v1", "task_history_v1", "knowledge_intent_v1"] as const;
export type HostedMode = (typeof MODES)[number];
export type HostedTariff = Readonly<{
  priceVersion: string;
  pricing: TextJobPricing;
  reservedMicros: number;
  maxOutputTokens: number;
  timeoutMs: number;
  configurationId: string;
  configurationVersion: number;
}>;
export type HostedWorkerProfile = Readonly<{
  schemaVersion: "vpj07-hosted-text-worker/1";
  pollIntervalMs: number;
  maxLifetimeMs: number;
  drainMs: number;
  concurrency: number;
  groupLimit: number;
  modes: readonly HostedMode[];
  qwen: HostedTariff;
}>;
export type ReadyGroup = Readonly<{
  ownerId: string; policyId: string; contextMode: string; provider: string; endpoint: string;
  scopes: readonly Readonly<{ scopeId: string; model: string; priceVersion: string }>[];
}>;
export type PollResult = "empty" | "finished" | "queued" | "unavailable";
export type HeartbeatState = Readonly<{
  phase: "started" | "polling" | "idle" | "disabled" | "draining" | "stopped";
  result: PollResult | "disabled" | "skipped" | null;
  polls: number; finished: number; unavailable: number; skipped: number;
  stopReason: StopReason | null;
}>;
export type StopReason = "stopped" | "expired" | "unavailable";
export type HostedEvent = Readonly<{
  phase: "cycle"; cycle: number; groups: number; skipped: number; results: Readonly<Partial<Record<PollResult, number>>>;
}> | Readonly<{ phase: "disabled" | "heartbeat-unavailable" | "discovery-unavailable" | "draining"; cycle: number }>;

/** Strict, closed profile. Non-secret and content-free; secrets never enter it. */
export function parseHostedWorkerProfile(raw: unknown): HostedWorkerProfile {
  if (!record(raw) || Object.keys(raw).length !== 8 || raw.schemaVersion !== "vpj07-hosted-text-worker/1"
    || !int(raw.pollIntervalMs, 1000, 60000) || !int(raw.maxLifetimeMs, 60000, 86400000) || !int(raw.drainMs, 0, 60000)
    || !int(raw.concurrency, 1, 8) || !int(raw.groupLimit, 1, 50)
    || !Array.isArray(raw.modes) || raw.modes.length < 1 || raw.modes.length > 3 || new Set(raw.modes).size !== raw.modes.length
    || !raw.modes.every(mode => (MODES as readonly unknown[]).includes(mode))
    || !record(raw.qwen) || Object.keys(raw.qwen).length !== 7
    || typeof raw.qwen.priceVersion !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(raw.qwen.priceVersion)
    || !int(raw.qwen.reservedMicros, 1, 1_000_000_000_000) || !int(raw.qwen.maxOutputTokens, 1, 4096)
    || !int(raw.qwen.timeoutMs, 1, 60000) || typeof raw.qwen.configurationId !== "string" || !UUID.test(raw.qwen.configurationId)
    || !int(raw.qwen.configurationVersion, 1, Number.MAX_SAFE_INTEGER)) throw unavailable();
  const profile = raw as unknown as HostedWorkerProfile;
  // Qualify the tariff/reservation once through the exact existing job validator.
  createStagingTextJob(jobConfig(profile, "current_input_v1", NIL, NIL, NIL, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"), {
    workerCredential: () => null, providerCredential: () => null, recordDestination: async () => {},
  });
  return Object.freeze({ ...profile, modes: Object.freeze([...profile.modes]), qwen: Object.freeze({ ...profile.qwen, pricing: Object.freeze({ ...profile.qwen.pricing }) }) });
}
const NIL = "00000000-0000-4000-8000-000000000000";

/** The exact existing job shape for one discovered group. */
export function jobConfig(profile: HostedWorkerProfile, mode: HostedMode, ownerId: string, policyId: string, scopeId: string, endpoint: string): StagingTextJobConfig {
  const tariff = profile.qwen;
  const version = mode === "knowledge_intent_v1" ? "vpj07-staging-text-job/4" : mode === "task_history_v1" ? "vpj07-staging-text-job/2" : "vpj07-staging-text-job/1";
  return {
    schemaVersion: version, ...(mode === "current_input_v1" ? {} : { inputMode: mode }),
    ownerId, policyId,
    budget: { scopeId, priceVersion: tariff.priceVersion, reservedMicros: tariff.reservedMicros, maxOutputTokens: tariff.maxOutputTokens, timeoutMs: tariff.timeoutMs },
    provider: { provider: "qwen", endpoint, configurationId: tariff.configurationId, configurationVersion: tariff.configurationVersion, timeoutMs: tariff.timeoutMs },
    pricing: { ...tariff.pricing },
  };
}

/** Select exactly one qualifying scope; anything else is a skipped group. */
export function planGroup(profile: HostedWorkerProfile, raw: unknown, qwenEndpoint: string): StagingTextJobConfig | null {
  if (!record(raw) || typeof raw.ownerId !== "string" || !UUID.test(raw.ownerId) || typeof raw.policyId !== "string" || !UUID.test(raw.policyId)
    || !profile.modes.includes(raw.contextMode as HostedMode) || raw.provider !== "qwen" || raw.endpoint !== qwenEndpoint
    || !Array.isArray(raw.scopes)) return null;
  const matching = raw.scopes.filter(scope => record(scope) && typeof scope.scopeId === "string" && UUID.test(scope.scopeId)
    && scope.model === PROTOCOL_MODELS.qwen && scope.priceVersion === profile.qwen.priceVersion);
  if (matching.length !== 1) return null;
  return jobConfig(profile, raw.contextMode as HostedMode, raw.ownerId.toLowerCase(), raw.policyId.toLowerCase(), String(matching[0].scopeId).toLowerCase(), qwenEndpoint);
}

export type HostedLoopDependencies = Readonly<{
  heartbeat: (state: HeartbeatState, signal: AbortSignal) => Promise<{ enabled: boolean } | null>;
  readyGroups: (signal: AbortSignal) => Promise<readonly unknown[] | "disabled" | null>;
  /** null => skip this group (unscoped, ambiguous, other mode/endpoint). */
  workerFor: (group: unknown) => { ownerId: string; poll: (signal: AbortSignal) => Promise<PollResult> } | null;
  record: (event: HostedEvent) => Promise<void>;
  now?: () => number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}>;
export type HostedLoopSettings = Readonly<{ pollIntervalMs: number; maxLifetimeMs: number; drainMs: number; concurrency: number; maxConsecutiveFailures?: number; pollDeadlineMs?: number }>;
export type HostedLoopResult = Readonly<{ reason: StopReason; polls: number; finished: number; unavailable: number; skipped: number }>;

/**
 * Resident loop. `signal` is a SOFT stop: no new heartbeat/discovery/claim;
 * in-flight group polls get `drainMs` to finish before their own signal aborts
 * (an aborted dispatch keeps its pending budget hold and its lease expires).
 * Persistent SQL/transport unavailability exits so the orchestrator restarts
 * the process with backoff instead of hot-looping.
 */
export async function runHostedTextLoop(settings: HostedLoopSettings, dependencies: HostedLoopDependencies, signal: AbortSignal): Promise<HostedLoopResult> {
  const now = dependencies.now ?? Date.now;
  const wait = dependencies.wait ?? (async (milliseconds: number, stop: AbortSignal) => { await delay(milliseconds, undefined, { signal: stop }).catch(() => {}); });
  const maxFailures = settings.maxConsecutiveFailures ?? 5, pollDeadlineMs = settings.pollDeadlineMs ?? 150000;
  const deadline = now() + settings.maxLifetimeMs;
  const soft = new AbortController(), hard = new AbortController();
  let reason: StopReason | null = null, drainTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = (why: StopReason) => {
    if (!reason) reason = why;
    if (soft.signal.aborted) return;
    soft.abort();
    drainTimer = setTimeout(() => hard.abort(), settings.drainMs);
  };
  const onSignal = () => stop("stopped");
  signal.addEventListener("abort", onSignal, { once: true });
  if (signal.aborted) onSignal();
  const lifetime = setTimeout(() => stop("expired"), Math.max(0, deadline - now()));
  const counts = { polls: 0, finished: 0, unavailable: 0, skipped: 0 };
  let failures = 0, cycle = 0, lastResult: HeartbeatState["result"] = null, phase: HeartbeatState["phase"] = "started";
  const beat = async (stopReason: StopReason | null = null) => {
    try { return await dependencies.heartbeat({ phase: stopReason ? "stopped" : phase, result: lastResult, ...counts, stopReason }, stopReason ? hard.signal : soft.signal); }
    catch { return null; }
  };
  const fail = async (event: "heartbeat-unavailable" | "discovery-unavailable") => {
    failures++; counts.unavailable++; lastResult = "unavailable";
    await dependencies.record({ phase: event, cycle }).catch(() => {});
    if (failures >= maxFailures) stop("unavailable");
    else await wait(Math.min(settings.pollIntervalMs * 2 ** Math.min(failures, 4), 60000), soft.signal);
  };
  try {
    while (!soft.signal.aborted) {
      if (now() >= deadline) { stop("expired"); break; }
      cycle++;
      const heartbeat = await beat();
      if (soft.signal.aborted) break;
      if (!heartbeat) { await fail("heartbeat-unavailable"); continue; }
      if (!heartbeat.enabled) {
        failures = 0; phase = "disabled"; lastResult = "disabled";
        await dependencies.record({ phase: "disabled", cycle }).catch(() => {});
        await wait(settings.pollIntervalMs, soft.signal);
        continue;
      }
      phase = "polling";
      let groups: readonly unknown[] | "disabled" | null;
      try { groups = await dependencies.readyGroups(soft.signal); } catch { groups = null; }
      if (soft.signal.aborted) break;
      if (groups === null || (groups !== "disabled" && !Array.isArray(groups))) { await fail("discovery-unavailable"); continue; }
      if (groups === "disabled") { phase = "disabled"; lastResult = "disabled"; await wait(settings.pollIntervalMs, soft.signal); continue; }
      counts.polls++;
      // One owner's groups run sequentially: parallel reservations on one budget
      // scope would trip its concurrency limit and burn bounded Turn attempts.
      const byOwner = new Map<string, ((signal: AbortSignal) => Promise<PollResult>)[]>();
      let skipped = 0;
      for (const group of groups) {
        let worker: ReturnType<HostedLoopDependencies["workerFor"]> = null;
        try { worker = dependencies.workerFor(group); } catch { worker = null; }
        if (!worker) { skipped++; continue; }
        byOwner.set(worker.ownerId, [...(byOwner.get(worker.ownerId) ?? []), worker.poll]);
      }
      counts.skipped += skipped;
      const results: PollResult[] = [];
      const lanes = [...byOwner.values()];
      await runLimited(lanes, settings.concurrency, async lane => {
        for (const poll of lane) {
          if (soft.signal.aborted) return;
          results.push(await boundedPoll(poll, hard.signal, pollDeadlineMs));
        }
      });
      const tally: Partial<Record<PollResult, number>> = {};
      for (const result of results) tally[result] = (tally[result] ?? 0) + 1;
      counts.finished += tally.finished ?? 0;
      counts.unavailable += tally.unavailable ?? 0;
      await dependencies.record({ phase: "cycle", cycle, groups: groups.length, skipped, results: tally }).catch(() => {});
      const progressed = (tally.finished ?? 0) + (tally.queued ?? 0) > 0;
      failures = results.length > 0 && (tally.unavailable ?? 0) === results.length ? failures + 1 : 0;
      lastResult = progressed ? (tally.finished ? "finished" : "queued") : results.length ? (tally.unavailable ? "unavailable" : "empty") : skipped ? "skipped" : "empty";
      if (failures >= maxFailures) { stop("unavailable"); break; }
      if (!progressed) { phase = "idle"; await wait(settings.pollIntervalMs, soft.signal); }
    }
  } finally {
    clearTimeout(lifetime);
    signal.removeEventListener("abort", onSignal);
  }
  if (!reason) reason = "stopped";
  phase = "draining";
  clearTimeout(drainTimer);
  hard.abort();
  const result = { reason: reason as StopReason, ...counts };
  // Best-effort final signal; the lease/heartbeat age already tells Ops if this fails.
  const finalController = new AbortController(), finalTimer = setTimeout(() => finalController.abort(), 5000);
  try { await dependencies.heartbeat({ phase: "stopped", result: lastResult, ...counts, stopReason: result.reason }, finalController.signal); } catch { /* retained */ }
  finally { clearTimeout(finalTimer); }
  return result;
}

async function boundedPoll(poll: (signal: AbortSignal) => Promise<PollResult>, parent: AbortSignal, deadlineMs: number): Promise<PollResult> {
  if (parent.aborted) return "unavailable";
  const controller = new AbortController(), abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, deadlineMs);
  try {
    const result = await poll(controller.signal);
    return ["empty", "finished", "queued", "unavailable"].includes(result) ? result : "unavailable";
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); parent.removeEventListener("abort", abort); }
}

async function runLimited<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const item = items[next++]; await run(item).catch(() => {}); }
  }));
}

export type HostedJournal = Readonly<{
  job: (digest: string, job: StagingTextJobConfig) => Promise<void>;
  usage: (digest: string, receipt: ValidatedUsageReceipt, signal: AbortSignal) => Promise<void>;
  knowledge: (digest: string, receipt: KnowledgeValidationReceipt) => Promise<void>;
  destination: (receipt: DestinationReceipt, signal: AbortSignal) => Promise<void>;
  event: (event: HostedEvent) => Promise<void>;
}>;
export type HostedWorkerDependencies = Readonly<{
  workerId: string;
  build: string;
  startedAt: string;
  qwenEndpoint: string;
  workerCredential: StagingTextJobDependencies["workerCredential"];
  providerCredential: StagingTextJobDependencies["providerCredential"];
  journal: HostedJournal;
  /** Content-free liveness observer for an optional local health endpoint. */
  onHeartbeat?: (ok: boolean, enabled: boolean | null) => void;
  /** Test-only closed destination seam. The CLI never supplies it. */
  fetch?: typeof globalThis.fetch;
}>;

/** Compose the loop with the real Staging service RPCs and existing scoped jobs. */
export function createHostedTextWorker(profile: HostedWorkerProfile, dependencies: HostedWorkerDependencies) {
  if (typeof window !== "undefined" || !UUID.test(dependencies.workerId) || !/^[A-Za-z0-9._-]{1,64}$/.test(dependencies.build)
    || !Number.isFinite(Date.parse(dependencies.startedAt)) || new Date(dependencies.startedAt).toISOString() !== dependencies.startedAt
    || typeof dependencies.workerCredential !== "function" || typeof dependencies.providerCredential !== "function") throw unavailable();
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const journaled = new Set<string>();
  const rpc = async (name: "hosted_worker_heartbeat" | "hosted_worker_ready_groups", parameters: Record<string, unknown>, signal: AbortSignal) => {
    if (process.env.VERCEL_ENV || signal.aborted) throw unavailable();
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const secret = await dependencies.workerCredential(timeout);
    if (typeof secret !== "string" || !/^[\x21-\x7e]{1,8192}$/.test(secret)) throw unavailable();
    const response = await fetcher(HOSTED_STAGING_DATABASE_URL + "/rest/v1/rpc/" + name, {
      method: "POST", headers: supabaseWorkerHeaders(secret),
      body: JSON.stringify(parameters), redirect: "manual", credentials: "omit", cache: "no-store", signal: timeout,
    });
    if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      try { await response.body?.cancel(); } catch { /* bounded */ }
      throw unavailable();
    }
    const text = await response.text();
    if (text.length > 262144) throw unavailable();
    return JSON.parse(text) as unknown;
  };
  return (signal: AbortSignal) => runHostedTextLoop(profile, {
    heartbeat: async (state, stop) => {
      const value = await rpc("hosted_worker_heartbeat", {
        p_worker_id: dependencies.workerId, p_build: dependencies.build, p_started_at: dependencies.startedAt,
        p_phase: state.phase, p_result: state.result, p_polls: state.polls, p_finished: state.finished,
        p_unavailable: state.unavailable, p_skipped: state.skipped, p_stop_reason: state.stopReason,
      }, stop).catch(() => null);
      const ok = record(value) && value.kind === "ok" && typeof value.enabled === "boolean";
      try { dependencies.onHeartbeat?.(ok, ok ? value.enabled as boolean : null); } catch { /* observer only */ }
      return ok ? { enabled: value.enabled as boolean } : null;
    },
    readyGroups: async stop => {
      const value = await rpc("hosted_worker_ready_groups", { p_limit: profile.groupLimit }, stop);
      if (record(value) && value.kind === "disabled") return "disabled";
      return record(value) && value.kind === "groups" && Array.isArray(value.groups) && value.groups.length <= profile.groupLimit ? value.groups : null;
    },
    workerFor: group => {
      const job = planGroup(profile, group, dependencies.qwenEndpoint);
      if (!job) return null;
      const digest = createHash("sha256").update(JSON.stringify(job)).digest("hex");
      const poll = createStagingTextJob(job, {
        workerCredential: dependencies.workerCredential, providerCredential: dependencies.providerCredential,
        qwenEndpoint: dependencies.qwenEndpoint, recordDestination: dependencies.journal.destination,
        recordUsage: (receipt, stop) => dependencies.journal.usage(digest, receipt, stop),
        recordKnowledgeValidation: receipt => dependencies.journal.knowledge(digest, receipt),
        ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
      });
      return {
        ownerId: job.ownerId,
        // The exact job (ids, tariff; no secret/content) is journaled before its
        // first claim so any later usage receipt is reconcilable against it.
        poll: async stop => {
          if (!journaled.has(digest)) { await dependencies.journal.job(digest, job); journaled.add(digest); }
          return poll(stop);
        },
      };
    },
    record: dependencies.journal.event,
  }, signal);
}

function int(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function unavailable(): Error { return new Error("Hosted text worker unavailable."); }
