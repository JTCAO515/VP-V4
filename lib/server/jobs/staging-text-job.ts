import { createScopedTextWorker, type ScopedTextWorkerConfig } from "../turn/scoped-text-worker.ts";
import { createProviderHttpTransport, type HttpProviderConfiguration, type HttpTransportDependencies } from "../model-gateway/adapters/http-transport.ts";
import { PROTOCOL_MODELS, validThinkingBudget } from "../model-gateway/adapters/provider-protocol.ts";
import type { ProtocolUsage } from "../model-gateway/adapters/provider-protocol.ts";
import type { RecordKnowledgeValidation } from "../turn/text-worker.ts";
import type { RecordValidatedUsage } from "../model-gateway/budget/usage-receipt.ts";

export type TextJobPricing = Readonly<{
  mode: "flat" | "cache_split";
  inputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
  cachedInputMicrosPerMillion: number | null;
}>;
export type StagingTextJobConfig = Readonly<{
  schemaVersion: "vpj07-staging-text-job/1" | "vpj07-staging-text-job/2" | "vpj07-staging-text-job/3" | "vpj07-staging-text-job/4";
  thinkingBudgetTokens?: number;
  inputMode?: "task_history_v1" | "knowledge_intent_v1";
  ownerId: string;
  policyId: string;
  budget: ScopedTextWorkerConfig["budget"];
  provider: HttpProviderConfiguration;
  pricing: TextJobPricing;
}>;
export type StagingTextJobDependencies = Readonly<{
  workerCredential: HttpTransportDependencies["credential"];
  providerCredential: HttpTransportDependencies["credential"];
  recordDestination: HttpTransportDependencies["recordDestination"];
  recordUsage?: RecordValidatedUsage;
  recordKnowledgeValidation?: RecordKnowledgeValidation;
  /** Test-only closed destination mapper; CLI uses real fetch without an override. */
  fetch?: typeof globalThis.fetch;
}>;

/**
 * One dedicated-process Staging invocation. Operator supplies the actual reviewed
 * tariff in the budget scope's currency; this calculator is not tariff discovery
 * or supplier invoice proof. No defaults, fallback, policy installation or timer.
 */
export function createStagingTextJob(raw: unknown, dependencies: StagingTextJobDependencies) {
  if (!record(raw) || !record(raw.budget) || !record(raw.provider)
    || raw.provider.timeoutMs !== raw.budget.timeoutMs || !validPricing(raw.pricing)) throw unavailable();
  const schema = raw.schemaVersion;
  if (schema === "vpj07-staging-text-job/1" ? Object.keys(raw).length !== 6 || raw.inputMode !== undefined || raw.thinkingBudgetTokens !== undefined
    : schema === "vpj07-staging-text-job/2" ? Object.keys(raw).length !== 7 || raw.inputMode !== "task_history_v1" || raw.thinkingBudgetTokens !== undefined
    : schema === "vpj07-staging-text-job/4" ? Object.keys(raw).length !== 7 || raw.inputMode !== "knowledge_intent_v1" || raw.thinkingBudgetTokens !== undefined
    : schema !== "vpj07-staging-text-job/3" || Object.keys(raw).length !== 8 || raw.inputMode !== "task_history_v1"
      || !validThinkingBudget(raw.thinkingBudgetTokens, raw.budget.maxOutputTokens as number)) throw unavailable();
  const config = raw as StagingTextJobConfig;
  // This entry is qualified only for the pinned Qwen profile. The full-context
  // bound deliberately over-reserves input instead of estimating tokens from text.
  // Source: https://www.qianwenai.com/models/qwen3.7-plus (2026-09-11).
  if (config.provider.provider !== "qwen" || PROTOCOL_MODELS.qwen !== "qwen3.7-plus-2026-05-26"
    || !Number.isSafeInteger(config.budget.maxOutputTokens) || config.budget.maxOutputTokens < 1
    || !Number.isSafeInteger(config.budget.reservedMicros) || config.budget.reservedMicros < 1) throw unavailable();
  const inputRate = Math.max(config.pricing.inputMicrosPerMillion, config.pricing.cachedInputMicrosPerMillion ?? 0);
  const numerator = BigInt(1_048_576) * BigInt(inputRate)
    // For job/3 maxOutputTokens caps reasoning plus final text (max_completion_tokens).
    + BigInt(config.budget.maxOutputTokens) * BigInt(config.pricing.outputMicrosPerMillion);
  const requiredMicros = (numerator + BigInt(999999)) / BigInt(1000000);
  if (requiredMicros > BigInt(1_000_000_000_000) || BigInt(config.budget.reservedMicros) < requiredMicros) throw unavailable();
  const price = createTextJobPrice(config.pricing);
  const transport = createProviderHttpTransport(config.provider, {
    credential: dependencies.providerCredential, recordDestination: dependencies.recordDestination,
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  });
  return createScopedTextWorker({ environment: "staging", databaseUrl: "https://dzqdzetcctkhbrhlxxgn.supabase.co",
    ownerId: config.ownerId, policyId: config.policyId, budget: config.budget }, {
    credential: dependencies.workerCredential,
    provider: { thinkingBudgetTokens: config.thinkingBudgetTokens, inputMode: config.inputMode ?? "current_input_v1", provider: config.provider.provider, endpoint: config.provider.endpoint, transport, price, recordUsage: dependencies.recordUsage, recordKnowledgeValidation: dependencies.recordKnowledgeValidation },
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  });
}

/** Integer micro-units; incomplete usage never becomes a zero charge. */
export function createTextJobPrice(value: TextJobPricing): (usage: ProtocolUsage) => number | null {
  if (!validPricing(value)) throw unavailable();
  const price = Object.freeze({ ...value });
  return usage => {
    if (!usage || ![usage.inputTokens, usage.outputTokens, usage.totalTokens].every(count => Number.isSafeInteger(count) && count >= 0)
      || usage.inputTokens + usage.outputTokens !== usage.totalTokens) return null;
    let numerator = BigInt(usage.outputTokens) * BigInt(price.outputMicrosPerMillion);
    if (price.mode === "cache_split") {
      const cached = usage.cachedInputTokens;
      if (cached === null || !Number.isSafeInteger(cached) || cached < 0 || cached > usage.inputTokens
        || (usage.uncachedInputTokens !== null && usage.uncachedInputTokens !== usage.inputTokens - cached)) return null;
      numerator += BigInt(cached) * BigInt(price.cachedInputMicrosPerMillion!)
        + BigInt(usage.inputTokens - cached) * BigInt(price.inputMicrosPerMillion);
    } else numerator += BigInt(usage.inputTokens) * BigInt(price.inputMicrosPerMillion);
    // Round the combined charge upward once, preserving any nonzero fraction.
    const micros = (numerator + BigInt(999999)) / BigInt(1000000);
    return micros <= BigInt(1_000_000_000_000) ? Number(micros) : null;
  };
}

function validPricing(value: unknown): value is TextJobPricing {
  return record(value) && Object.keys(value).length === 4
    && [value.inputMicrosPerMillion, value.outputMicrosPerMillion].every(rate => typeof rate === "number" && Number.isSafeInteger(rate) && rate > 0 && rate <= 1_000_000_000_000)
    && (value.mode === "flat" ? value.cachedInputMicrosPerMillion === null
      : value.mode === "cache_split" && typeof value.cachedInputMicrosPerMillion === "number" && Number.isSafeInteger(value.cachedInputMicrosPerMillion)
        && value.cachedInputMicrosPerMillion > 0 && value.cachedInputMicrosPerMillion <= 1_000_000_000_000);
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function unavailable(): Error { return new Error("Staging text job configuration unavailable."); }
