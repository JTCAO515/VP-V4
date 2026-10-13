import { createQaWorker, type QaWorkerConfiguration } from "./worker.ts";
import { createTextJobPrice } from "../jobs/staging-text-job.ts";
import { validatedUsageReceipt, type ValidatedUsageReceipt } from "../model-gateway/budget/usage-receipt.ts";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";

/** Read-only validation for the ORIGINAL hosted secure journal. No settlement,
 * new receipt authority, provider call or automatic reconciliation is performed. */
export function auditQaUsage(config: QaWorkerConfiguration, rawReceipts: readonly unknown[]) {
  const forbidden = () => { throw new Error("QA audit has no execution capability"); };
  createQaWorker(config, { workerCredential: forbidden, providerCredential: forbidden,
    recordDestination: forbidden, recordUsage: forbidden, invokeContext: forbidden,
    qwenEndpoint: config.provider.provider === "qwen" ? config.provider.endpoint : undefined });
  if (!Array.isArray(rawReceipts) || rawReceipts.length > 100) throw invalid();
  const price = createTextJobPrice(config.pricing), receipts = new Map<string, ValidatedUsageReceipt>();
  for (const raw of rawReceipts) {
    const r = validatedUsageReceipt(raw), a = r.attempt;
    if (a.ownerId !== config.ownerId || r.policyId !== config.policyId || a.scopeId !== config.budget.scopeId
      || a.provider !== config.provider.provider || a.model !== PROTOCOL_MODELS[config.provider.provider]
      || a.priceVersion !== config.budget.priceVersion || a.reservedMicros !== config.budget.reservedMicros
      || a.timeoutMs !== config.budget.timeoutMs || r.usage.outputTokens > config.budget.maxOutputTokens || price(r.usage) !== r.actualMicros) throw invalid();
    const prior = receipts.get(a.attemptId);
    if (prior && JSON.stringify({ ...prior, observedAt: "" }) !== JSON.stringify({ ...r, observedAt: "" })) throw invalid();
    receipts.set(a.attemptId, r);
  }
  return Object.freeze({ receipts: Object.freeze([...receipts.values()]) });
}
function invalid() { return new Error("QA usage audit unavailable"); }
