import type { BudgetAttempt } from "./durable.ts";
import type { ProtocolUsage } from "../adapters/provider-protocol.ts";

/** Trusted worker evidence only. No prompt, answer, credential or customer charge. */
export type ValidatedUsageReceipt = Readonly<{
  schemaVersion: "validated-model-usage/1";
  attempt: BudgetAttempt;
  turnId: string;
  policyId: string;
  usage: ProtocolUsage;
  actualMicros: number;
  observedAt: string;
}>;
export type RecordValidatedUsage = (receipt: ValidatedUsageReceipt, signal: AbortSignal) => Promise<void>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9._-]{1,100}$/;
const count = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const record = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
const keys = (x: Record<string, unknown>, names: string[]) => Object.keys(x).length === names.length && names.every(k => Object.hasOwn(x, k));

/** Validate the complete receipt before any reconciliation I/O. */
export function validatedUsageReceipt(raw: unknown): ValidatedUsageReceipt {
  if (!record(raw) || !keys(raw, ["schemaVersion", "attempt", "turnId", "policyId", "usage", "actualMicros", "observedAt"])
    || raw.schemaVersion !== "validated-model-usage/1" || !record(raw.attempt) || !record(raw.usage)) throw invalid();
  const a = raw.attempt, u = raw.usage;
  if (!keys(a, ["scopeId", "ownerId", "taskId", "attemptId", "provider", "model", "priceVersion", "reservedMicros", "timeoutMs"])
    || ![a.scopeId, a.ownerId, a.taskId, a.attemptId, raw.turnId, raw.policyId].every(x => typeof x === "string" && UUID.test(x))
    || a.taskId !== raw.turnId || !["qwen", "glm", "deepseek"].includes(String(a.provider))
    || ![a.model, a.priceVersion].every(x => typeof x === "string" && TOKEN.test(x))
    || !count(a.reservedMicros) || a.reservedMicros < 1 || a.reservedMicros > 1e12
    || !count(a.timeoutMs) || a.timeoutMs < 1 || a.timeoutMs > 300000
    || !count(raw.actualMicros) || raw.actualMicros > 1e12
    || typeof raw.observedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.observedAt)
    || !Number.isFinite(Date.parse(raw.observedAt)) || new Date(raw.observedAt).toISOString() !== raw.observedAt) throw invalid();
  if (!keys(u, ["inputTokens", "outputTokens", "totalTokens", "cachedInputTokens", "uncachedInputTokens", "reasoningTokens", "cost"])
    || u.cost !== "unknown" || !count(u.inputTokens) || !count(u.outputTokens) || !count(u.totalTokens)
    || u.inputTokens + u.outputTokens !== u.totalTokens
    || ![u.cachedInputTokens, u.uncachedInputTokens, u.reasoningTokens].every(x => x === null || count(x))
    || (typeof u.cachedInputTokens === "number" && u.cachedInputTokens > u.inputTokens)
    || (typeof u.uncachedInputTokens === "number" && u.uncachedInputTokens > u.inputTokens)
    || (typeof u.cachedInputTokens === "number" && typeof u.uncachedInputTokens === "number" && u.cachedInputTokens + u.uncachedInputTokens !== u.inputTokens)
    || (typeof u.reasoningTokens === "number" && u.reasoningTokens > u.outputTokens)) throw invalid();
  return Object.freeze({ schemaVersion: "validated-model-usage/1", turnId: raw.turnId, policyId: raw.policyId,
    attempt: Object.freeze({ scopeId: a.scopeId, ownerId: a.ownerId, taskId: a.taskId, attemptId: a.attemptId,
      provider: a.provider, model: a.model, priceVersion: a.priceVersion, reservedMicros: a.reservedMicros, timeoutMs: a.timeoutMs }),
    usage: Object.freeze({ inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens,
      cachedInputTokens: u.cachedInputTokens, uncachedInputTokens: u.uncachedInputTokens, reasoningTokens: u.reasoningTokens, cost: "unknown" }),
    actualMicros: raw.actualMicros, observedAt: raw.observedAt }) as ValidatedUsageReceipt;
}
function invalid(): Error { return new Error("Validated usage receipt unavailable."); }
