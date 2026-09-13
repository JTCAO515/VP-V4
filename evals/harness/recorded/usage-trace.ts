import { validatedUsageReceipt } from "../../../lib/server/model-gateway/budget/usage-receipt.ts";

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function invalid(): never { throw new Error("Recorded task trace is invalid."); }
function record(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid();
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) return invalid();
  return row;
}
function text(raw: unknown, pattern: RegExp): string {
  if (typeof raw !== "string" || !pattern.test(raw)) return invalid();
  return raw;
}
function uuid(raw: unknown) { return text(raw, uuidPattern); }
function timestamp(raw: unknown): string {
  const value = text(raw, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid();
  return value;
}
function micros(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > 1e12) return invalid();
  return raw;
}

/** Consistency of an operator-supplied historical recording, never current authority or a live run. */
export function recordedUsageTrace(raw: unknown) {
  const input = record(raw, ["schemaVersion", "recordedAt", "apiSha", "workerSha", "configurationDigest", "prompt", "binding", "taskRecord", "turnLink", "budgetScopes", "attempts"]);
  if (input.schemaVersion !== "vpj67-recorded-usage-input/1") return invalid();
  const recordedAt = timestamp(input.recordedAt);
  const versions = {
    apiSha: text(input.apiSha, /^[a-f0-9]{40}$/), workerSha: text(input.workerSha, /^[a-f0-9]{40}$/),
    configurationDigest: text(input.configurationDigest, /^[a-f0-9]{64}$/),
  };
  const prompt = record(input.prompt, ["version", "digest"]);
  const promptVersion = text(prompt.version, /^[A-Za-z0-9._-]{1,100}$/);
  const promptDigest = text(prompt.digest, /^[a-f0-9]{64}$/);
  const binding = record(input.binding, ["ownerId", "serviceTaskId", "turnId", "policyId"]);
  const ownerId = uuid(binding.ownerId), serviceTaskId = uuid(binding.serviceTaskId);
  const turnId = uuid(binding.turnId), policyId = uuid(binding.policyId);
  if (turnId === serviceTaskId || !Array.isArray(input.attempts) || input.attempts.length > 100) return invalid();
  const taskRecord = input.taskRecord === null ? null : record(input.taskRecord, ["id", "ownerId", "policyId"]);
  if (taskRecord && (uuid(taskRecord.id) !== serviceTaskId || uuid(taskRecord.ownerId) !== ownerId || uuid(taskRecord.policyId) !== policyId)) return invalid();
  const turnLink = input.turnLink === null ? null : record(input.turnLink, ["turnId", "taskId", "ownerId"]);
  if (turnLink && (uuid(turnLink.turnId) !== turnId || uuid(turnLink.taskId) !== serviceTaskId || uuid(turnLink.ownerId) !== ownerId)) return invalid();
  if (!Array.isArray(input.budgetScopes) || input.budgetScopes.length > 100) return invalid();
  const scopes = new Map<string, string>();
  for (const value of input.budgetScopes) {
    const scope = record(value, ["id", "ownerId", "currency"]), id = uuid(scope.id);
    if (uuid(scope.ownerId) !== ownerId || scopes.has(id)) return invalid();
    scopes.set(id, text(scope.currency, /^(CNY|USD)$/));
  }
  const seen = new Set<string>();
  const attempts = input.attempts.map(value => {
    const entry = record(value, ["attemptId", "scopeId", "ledgerTaskId", "status", "actualMicros", "provider", "model", "priceVersion", "reservedMicros", "usageReceipt"]);
    const attemptId = uuid(entry.attemptId), scopeId = uuid(entry.scopeId);
    // The worker receipt calls its Turn ID taskId; the durable ledger uses ServiceTask ID.
    if (uuid(entry.ledgerTaskId) !== serviceTaskId || seen.has(attemptId)) return invalid();
    seen.add(attemptId);
    const provider = text(entry.provider, /^(qwen|glm|deepseek)$/);
    const model = text(entry.model, /^[A-Za-z0-9._-]{1,100}$/);
    const priceVersion = text(entry.priceVersion, /^[A-Za-z0-9._-]{1,100}$/);
    const reservedMicros = micros(entry.reservedMicros);
    if (reservedMicros === 0) return invalid();
    const status = text(entry.status, /^(reserved|dispatched|pending|settled|released)$/);
    const actualMicros = entry.actualMicros === null ? null : micros(entry.actualMicros);
    if ((status === "settled") !== (actualMicros !== null)) return invalid();
    const receipt = entry.usageReceipt === null ? null : validatedUsageReceipt(entry.usageReceipt);
    if (receipt && (receipt.turnId !== turnId || receipt.policyId !== policyId
      || receipt.attempt.taskId !== turnId || receipt.attempt.ownerId !== ownerId
      || receipt.attempt.scopeId !== scopeId || receipt.attempt.attemptId !== attemptId
      || receipt.attempt.provider !== provider || receipt.attempt.model !== model
      || receipt.attempt.priceVersion !== priceVersion || receipt.attempt.reservedMicros !== reservedMicros
      || Date.parse(receipt.observedAt) > Date.parse(recordedAt)
      || (actualMicros !== null && receipt.actualMicros !== actualMicros))) return invalid();
    if (status === "released" && receipt !== null) return invalid();
    return {
      attemptId, scopeId, ledgerTaskId: serviceTaskId, workerTaskId: receipt ? turnId : null, status,
      provider, model, priceVersion, reservedMicros, scopeOwnerLinked: scopes.has(scopeId), usage: receipt?.usage ?? "unknown",
      tariffMicros: actualMicros ?? "unknown", currency: scopes.get(scopeId) ?? "unknown", vendorCost: "unknown" as const,
      usageObservedAt: receipt?.observedAt ?? null,
    };
  });
  const complete = taskRecord !== null && turnLink !== null && attempts.length > 0
    && attempts.every(a => a.status === "settled" && a.usage !== "unknown" && a.scopeOwnerLinked);
  return {
    schemaVersion: "vpj67-recorded-usage-trace/1", mode: "recorded-staging", recordedAt,
    provenance: "Operator-supplied records; cross-record consistency does not authenticate their origin.",
    versions: { ...versions, promptVersion, promptDigest },
    binding: { ownerId, serviceTaskId, turnId, policyId }, taskOwnerLinked: taskRecord !== null, turnTaskLinked: turnLink !== null, attempts,
    traceValidation: complete ? "PASS" : "INCOMPLETE",
    attemptSetCompleteness: "NOT_VERIFIED", currentAuthorization: "NOT_RECHECKED", factualValidation: "NOT_RUN", tripInvariance: "NOT_CHECKED",
    nativeConsumer: "NOT_CHECKED", webConsumer: "NOT_CHECKED", fullAcceptance: "NOT_RUN",
    providerCallsMade: 0, databaseWritesMade: 0,
  } as const;
}
