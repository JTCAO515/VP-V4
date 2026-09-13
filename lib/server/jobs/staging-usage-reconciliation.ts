import { createStagingTextJob, createTextJobPrice, type StagingTextJobConfig } from "./staging-text-job.ts";
import { validatedUsageReceipt, type ValidatedUsageReceipt } from "../model-gateway/budget/usage-receipt.ts";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";
import type { BudgetRpc } from "../model-gateway/budget/durable.ts";

/** Validate all evidence before issuing even the first settlement. No provider capability. */
export function stagingUsageReconciliation(rawConfig: unknown, rawReceipts: readonly unknown[]) {
  const forbidden = () => { throw invalid(); };
  // Reuse exact configuration/reservation/price qualification without running the job.
  createStagingTextJob(rawConfig, { workerCredential: forbidden, providerCredential: forbidden, recordDestination: async () => forbidden() });
  const config = rawConfig as StagingTextJobConfig;
  if (!Array.isArray(rawReceipts) || rawReceipts.length > 100) throw invalid();
  const price = createTextJobPrice(config.pricing), receipts = new Map<string, ValidatedUsageReceipt>();
  for (const raw of rawReceipts) {
    const r = validatedUsageReceipt(raw), a = r.attempt;
    if (a.ownerId !== config.ownerId || r.policyId !== config.policyId || a.scopeId !== config.budget.scopeId
      || a.provider !== config.provider.provider || a.model !== PROTOCOL_MODELS[config.provider.provider]
      || a.priceVersion !== config.budget.priceVersion || a.reservedMicros !== config.budget.reservedMicros
      || a.timeoutMs !== config.budget.timeoutMs || r.usage.outputTokens > config.budget.maxOutputTokens
      || price(r.usage) !== r.actualMicros) throw invalid();
    const prior = receipts.get(a.attemptId);
    if (prior && JSON.stringify({ ...prior, observedAt: "" }) !== JSON.stringify({ ...r, observedAt: "" })) throw invalid();
    receipts.set(a.attemptId, r);
  }
  return Object.freeze({
    receipts: Object.freeze([...receipts.values()]),
    async settle(receipt: ValidatedUsageReceipt, rpc: BudgetRpc, signal: AbortSignal): Promise<"settled" | "already_settled" | "unavailable"> {
      if (signal.aborted || receipts.get(receipt.attempt.attemptId) !== receipt) return "unavailable";
      const a = receipt.attempt;
      let result: unknown;
      try { result = await rpc("finish_model_budget", { p_scope_id: a.scopeId, p_owner_id: a.ownerId,
        p_attempt_id: a.attemptId, p_action: "settle", p_actual_micros: receipt.actualMicros }); } catch { return "unavailable"; }
      if (result === null || typeof result !== "object" || signal.aborted) return "unavailable";
      const value = result as Record<string, unknown>;
      if (value.kind === "settled" && typeof value.overrun === "boolean") return "settled";
      if (value.kind === "duplicate" && value.status === "settled") return "already_settled";
      return "unavailable";
    },
  });
}
function invalid(): Error { return new Error("Staging usage reconciliation unavailable."); }
