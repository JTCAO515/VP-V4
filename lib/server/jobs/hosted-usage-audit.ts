import { createHash } from "node:crypto";
import { jobConfig, parseHostedWorkerProfile, type HostedMode } from "./hosted-text-worker.ts";
import { stagingUsageReconciliation } from "./staging-usage-reconciliation.ts";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";
import type { ValidatedUsageReceipt } from "../model-gateway/budget/usage-receipt.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const iso = (v: unknown) => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function invalid(): never { throw Error("Hosted usage audit unavailable."); }

export function auditHostedUsageJournal(rawRows: unknown) {
  if (!Array.isArray(rawRows) || rawRows.length < 1 || rawRows.length > 50000) invalid();
  const first: unknown = rawRows[0];
  if (!record(first) || !keys(first, ["schemaVersion", "phase", "workerId", "build", "startedAt", "profile", "qwenEndpoint"])
    || first.schemaVersion !== "vpj07-hosted-run/1" || first.phase !== "started"
    || typeof first.workerId !== "string" || !UUID.test(first.workerId)
    || typeof first.build !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(first.build)
    || !iso(first.startedAt) || typeof first.qwenEndpoint !== "string") invalid();
  const profile = parseHostedWorkerProfile(first.profile);
  const groups = new Map<string, { job: ReturnType<typeof jobConfig>; receipts: unknown[] }>();
  const attemptGroups = new Map<string, string>();
  let receiptRows = 0;
  let processEndObserved = false;
  for (let index = 1; index < rawRows.length; index++) {
    const row: unknown = rawRows[index];
    if (processEndObserved) invalid();
    if (!record(row) || typeof row.schemaVersion !== "string") invalid();
    if (row.schemaVersion === "vpj07-hosted-job/1") {
      if (!keys(row, ["schemaVersion", "jobDigest", "job"]) || typeof row.jobDigest !== "string" || !SHA.test(row.jobDigest)
        || !record(row.job) || groups.has(row.jobDigest) || groups.size >= 150) invalid();
      const job = row.job;
      const mode: HostedMode = job.inputMode === undefined ? "current_input_v1" : job.inputMode as HostedMode;
      if (!profile.modes.includes(mode) || typeof job.ownerId !== "string" || !UUID.test(job.ownerId)
        || typeof job.policyId !== "string" || !UUID.test(job.policyId)
        || !record(job.budget) || typeof job.budget.scopeId !== "string" || !UUID.test(job.budget.scopeId)) invalid();
      const expected = jobConfig(profile, mode, job.ownerId, job.policyId, job.budget.scopeId, first.qwenEndpoint);
      if (JSON.stringify(job) !== JSON.stringify(expected)
        || createHash("sha256").update(JSON.stringify(job)).digest("hex") !== row.jobDigest) invalid();
      groups.set(row.jobDigest, { job: expected, receipts: [] });
    } else if (row.schemaVersion === "vpj07-usage-journal/1") {
      if (!keys(row, ["schemaVersion", "configurationDigest", "receipt"])
        || typeof row.configurationDigest !== "string" || !SHA.test(row.configurationDigest)
        || !groups.has(row.configurationDigest) || ++receiptRows > 10000) invalid();
      groups.get(row.configurationDigest)!.receipts.push(row.receipt);
    } else if (row.schemaVersion === "vpj07-knowledge-validation-journal/1") {
      if (!keys(row, ["schemaVersion", "configurationDigest", "receipt"])
        || !groups.has(String(row.configurationDigest)) || !record(row.receipt)
        || !keys(row.receipt, ["schemaVersion", "turnId", "reason"])
        || row.receipt.schemaVersion !== "knowledge-validation/1"
        || typeof row.receipt.turnId !== "string" || !UUID.test(row.receipt.turnId)
        || !["valid", "invalid_json", "missing_unanswered_needs", "protocol_unavailable", "object_shape", "unknown_keys", "place_name_presence", "place_name_invalid", "unanswered_needs_invalid", "intent_scope_invalid"].includes(String(row.receipt.reason))) invalid();
    } else if (row.schemaVersion === "provider-destination/1") {
      if (!keys(row, ["schemaVersion", "invocationId", "provider", "model", "endpoint", "configurationId", "configurationVersion", "phase", "observedAt"])
        || typeof row.invocationId !== "string" || !UUID.test(row.invocationId)
        || row.provider !== "qwen" || typeof row.endpoint !== "string" || row.endpoint !== first.qwenEndpoint
        || row.model !== PROTOCOL_MODELS.qwen || row.configurationId !== profile.qwen.configurationId
        || row.configurationVersion !== profile.qwen.configurationVersion
        || !["configured", "attempted", "response_buffered"].includes(String(row.phase)) || !iso(row.observedAt)) invalid();
    } else if (row.schemaVersion === "vpj07-hosted-run/1") {
      if (!hostedEvent(row)) invalid();
      if (row.phase === "returned") processEndObserved = true;
    } else invalid();
  }
  const result = [];
  for (const [digest, group] of groups) {
    stagingUsageReconciliation(group.job, []);
    const receipts = new Map<string, ValidatedUsageReceipt>();
    for (let i = 0; i < group.receipts.length; i += 100) {
      for (const receipt of stagingUsageReconciliation(group.job, group.receipts.slice(i, i + 100)).receipts) {
        const id = receipt.attempt.attemptId;
        if (attemptGroups.has(id) && attemptGroups.get(id) !== digest) invalid();
        attemptGroups.set(id, digest);
        const prior = receipts.get(id);
        if (prior && JSON.stringify({ ...prior, observedAt: "" }) !== JSON.stringify({ ...receipt, observedAt: "" })) invalid();
        receipts.set(id, receipt);
      }
    }
    const items = [...receipts.values()].sort((a, b) => a.attempt.attemptId.localeCompare(b.attempt.attemptId))
      .map(r => ({ attemptId: r.attempt.attemptId, turnId: r.turnId, actualMicros: r.actualMicros, observedAt: r.observedAt }));
    const actualMicros = items.reduce((sum, item) => sum + item.actualMicros, 0);
    if (!Number.isSafeInteger(actualMicros)) invalid();
    result.push({ jobDigest: digest, ownerId: group.job.ownerId, policyId: group.job.policyId,
      scopeId: group.job.budget.scopeId, priceVersion: group.job.budget.priceVersion,
      receiptRows: group.receipts.length, distinctAttempts: items.length, actualMicros, attempts: items });
  }
  return { schemaVersion: "vpj07-hosted-usage-audit/1" as const, sourceWorkerId: first.workerId,
    sourceBuild: first.build, groups: result.sort((a, b) => a.jobDigest.localeCompare(b.jobDigest)),
    receiptRows, distinctAttempts: attemptGroups.size,
    processEndObserved,
    ledgerState: "not_checked" as const, settlementAction: "none" as const };
}

function hostedEvent(row: Record<string, unknown>): boolean {
  if (row.phase === "returned") return keys(row, ["schemaVersion", "phase", "reason", "polls", "finished", "unavailable", "skipped", "observedAt"])
    && ["stopped", "expired", "unavailable"].includes(String(row.reason))
    && [row.polls, row.finished, row.unavailable, row.skipped].every(integer) && iso(row.observedAt);
  if (row.phase === "cycle") {
    const results = row.results;
    return keys(row, ["schemaVersion", "phase", "cycle", "groups", "skipped", "results", "observedAt"])
      && integer(row.cycle) && integer(row.groups) && integer(row.skipped) && iso(row.observedAt) && record(results)
      && Object.keys(results).every(key => ["empty", "finished", "queued", "unavailable"].includes(key) && integer(results[key]));
  }
  if (["disabled", "heartbeat-unavailable", "discovery-unavailable", "draining"].includes(String(row.phase)))
    return keys(row, ["schemaVersion", "phase", "cycle", "observedAt"]) && integer(row.cycle) && iso(row.observedAt);
  return false;
}
