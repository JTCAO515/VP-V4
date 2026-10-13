import { textTurnFailureCopy, type Locale } from "../../i18n.ts";
import { CostGuard } from "../model-gateway/budget/index.ts";
import { PROTOCOL_MODELS, type ProtocolOutcome, type ProtocolTransport } from "../model-gateway/adapters/provider-protocol.ts";
import { validatedUsageReceipt, type RecordValidatedUsage } from "../model-gateway/budget/usage-receipt.ts";
import type { BudgetAttempt } from "../model-gateway/budget/durable.ts";
import type { TextProviderBinding, TextWorkerConfig } from "../turn/text-worker.ts";
import type { DurableTurnLease } from "../turn/durable-worker.ts";
import { record, uuid } from "./service.ts";

export type QaWorkerRpc = (name: string, params: Readonly<Record<string, string | number | null>>, signal: AbortSignal) => Promise<unknown>;
type BudgetTurn = Extract<ReturnType<CostGuard["startTurn"]>, { kind: "turn" }>;
export type QaContextInvocation = Readonly<{
  lease: DurableTurnLease; input: Readonly<Record<string, unknown>>;
  budget: BudgetTurn; rpc: QaWorkerRpc; transport: ProtocolTransport;
  binding: TextProviderBinding; configuration: TextWorkerConfig; signal: AbortSignal;
}>;
export type QaExecutorDependencies = Readonly<{
  rpc: QaWorkerRpc;
  /** Supplied by the sole qa-agent-context composer, never an HTTP body/preview. */
  invokeContext: (input: QaContextInvocation) => Promise<ProtocolOutcome>;
  provider: TextProviderBinding;
  recordUsage: RecordValidatedUsage;
}>;
export type QaExecutionResult = "empty" | "finished" | "unavailable" | "reconciliation_required";

/** One owner/policy-scoped claim from the ORIGINAL queue. No second scheduler,
 * credentials, policy activation or retries. The SQL dispatch atomically consumes
 * the original reserved budget; it must not be preceded by dispatch_model_budget.
 */
export async function executeQaWork(
  ownerId: string, policyId: string, config: TextWorkerConfig,
  dependencies: QaExecutorDependencies, signal: AbortSignal,
): Promise<QaExecutionResult> {
  if (!uuid(ownerId) || !uuid(policyId) || !uuid(config.scopeId) || !/^[A-Za-z0-9._-]{1,100}$/.test(config.priceVersion)
    || !Number.isSafeInteger(config.reservedMicros) || config.reservedMicros < 1 || config.reservedMicros > 1_000_000_000_000
    || !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 60000
    || !Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > 4096
    || !Object.hasOwn(PROTOCOL_MODELS, dependencies.provider.provider) || signal.aborted) return "unavailable";
  const claimSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  const rpc = (name: string, params: Readonly<Record<string, string | number | null>>) => bounded(() => dependencies.rpc(name, params, claimSignal), claimSignal);
  let claim: unknown;
  try { claim = await rpc("qa_claim_work_v1", { p_owner_id: ownerId, p_policy_id: policyId }); } catch { return "unavailable"; }
  if (record(claim) && claim.kind === "empty") return "empty";
  if (record(claim) && claim.kind === "reconciliation_required") return "reconciliation_required";
  if (!record(claim) || claim.kind !== "leased" || claim.ownerId !== ownerId || !uuid(claim.turnId) || !uuid(claim.leaseToken)
    || !Number.isSafeInteger(claim.attempt) || Number(claim.attempt) < 1 || !Number.isSafeInteger(claim.leaseMs)
    || Number(claim.leaseMs) < 1 || Number(claim.leaseMs) > 120000 || signal.aborted) return "unavailable";
  const lease = claim as unknown as DurableTurnLease;
  const controller = new AbortController(), abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.min(lease.leaseMs, config.timeoutMs + 15000));
  const keys = { p_turn_id: lease.turnId, p_lease_token: lease.leaseToken };
  const identity = { p_scope_id: config.scopeId, p_owner_id: ownerId, p_attempt_id: lease.leaseToken };
  const attempt: BudgetAttempt = { scopeId: config.scopeId, ownerId, taskId: lease.turnId, attemptId: lease.leaseToken,
    provider: dependencies.provider.provider, model: PROTOCOL_MODELS[dependencies.provider.provider], priceVersion: config.priceVersion,
    reservedMicros: config.reservedMicros, timeoutMs: config.timeoutMs };
  let reserved = false, dispatchAttempted = false, dispatchAuthorized = false, sent = false, accounted = false;
  const call = (name: string, params: Readonly<Record<string, string | number | null>>) => bounded(() => dependencies.rpc(name, params, controller.signal), controller.signal);
  try {
    const raw = await call("qa_read_work_v1", keys);
    if (!record(raw) || raw.kind !== "qa_input" || raw.schemaVersion !== "qa-context/1" || raw.turnId !== lease.turnId
      || raw.contextMode !== "qa_session_history_v1" || raw.ownerId !== ownerId || !uuid(raw.authSessionId) || raw.policyId !== policyId || !uuid(raw.threadId) || !uuid(raw.serviceTaskId) || !uuid(raw.consentId)
      || raw.provider !== dependencies.provider.provider || raw.endpoint !== dependencies.provider.endpoint) return "unavailable";
    const guard = new CostGuard({ windowMs: 120000, perUserAttempts: 1, perTaskAttempts: 1, turnDeadlineMs: 120000, maxModelSteps: 1, maxToolSteps: 1 })
      .startTurn({ userId: ownerId, taskId: lease.turnId });
    if (guard.kind !== "turn" || controller.signal.aborted) return "unavailable";
    const reservation = await call("reserve_model_budget", { ...identity, p_task_id: lease.turnId, p_provider: attempt.provider,
      p_model: attempt.model, p_price_version: attempt.priceVersion, p_reserved_micros: attempt.reservedMicros });
    if (!record(reservation) || reservation.kind !== "reserved") return "unavailable";
    reserved = true;
    const contextRpc: QaWorkerRpc = async (name, params, contextSignal) => {
      if (!["qa_read_work_v1", "qa_authorize_dispatch_v1"].includes(name) || params.p_turn_id !== lease.turnId
        || params.p_lease_token !== lease.leaseToken || contextSignal.aborted || controller.signal.aborted) throw new Error("QA context unavailable");
      if (name === "qa_authorize_dispatch_v1") {
        if (dispatchAttempted || params.p_scope_id !== config.scopeId || params.p_policy_id !== policyId || params.p_provider !== attempt.provider) throw new Error("QA dispatch unavailable");
        dispatchAttempted = true;
      }
      const result = await call(name, params);
      if (name === "qa_authorize_dispatch_v1") dispatchAuthorized = record(result) && result.kind === "authorized";
      return result;
    };
    const guardedTransport: ProtocolTransport = async request => {
      if (!dispatchAuthorized || sent || controller.signal.aborted || request.signal.aborted) throw new Error("QA dispatch unavailable");
      sent = true;
      return bounded(() => dependencies.provider.transport(request), controller.signal);
    };
    const outcome = await bounded(() => dependencies.invokeContext({ lease, input: raw, budget: guard, rpc: contextRpc,
      transport: guardedTransport, binding: dependencies.provider, configuration: config, signal: controller.signal }), controller.signal);
    if (controller.signal.aborted) return "unavailable";
    const priceable = outcome.kind === "protocol_validated" || (outcome.kind === "unavailable" && outcome.code === "SAFETY_BLOCKED");
    const actualMicros = priceable && outcome.usage ? dependencies.provider.price(outcome.usage) : null;
    if (actualMicros === null || !outcome.usage || !dispatchAuthorized || !sent) return "unavailable";
    // Real validated usage is persisted before settlement. Unknown price/usage or
    // ACK retains the original pending attempt; it never becomes a free retry.
    await bounded(() => dependencies.recordUsage(validatedUsageReceipt({ schemaVersion: "validated-model-usage/1", attempt,
      turnId: lease.turnId, policyId, usage: outcome.usage, actualMicros, observedAt: new Date().toISOString() }), controller.signal), controller.signal);
    const settlement = await call("finish_model_budget", { ...identity, p_action: "settle", p_actual_micros: actualMicros });
    if (!record(settlement) || settlement.kind !== "settled" || settlement.overrun === true || controller.signal.aborted) return "unavailable";
    accounted = true;
    const answer = parseAnswer(outcome) ?? { outcome: outcome.kind === "unavailable" && outcome.code === "SAFETY_BLOCKED" ? "blocked" : "technical_failure",
      text: textTurnFailureCopy[["en", "zh", "es", "ru", "ar"].includes(String(raw.locale)) ? raw.locale as Locale : "en"][outcome.kind === "unavailable" && outcome.code === "SAFETY_BLOCKED" ? "blocked" : "technical_failure"] };
    if (!answer) return "unavailable";
    const completion = await call("qa_complete_work_v1", { ...keys, p_kind: answer.outcome, p_text: answer.text });
    return record(completion) && completion.kind === "finished" && !controller.signal.aborted ? "finished" : "unavailable";
  } catch { return "unavailable"; }
  finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort);
    // The original ledger owns idempotency. Cleanup has a short independent
    // deadline so caller cancellation cannot turn an actual cost into zero.
    if (reserved && !accounted) {
      const drain = AbortSignal.timeout(3000);
      try { await bounded(() => dependencies.rpc("finish_model_budget", { ...identity, p_action: dispatchAttempted ? "pending" : "release", p_actual_micros: null }, drain), drain); } catch { /* original durable reservation/dispatch survives */ }
    }
    controller.abort();
  }
}
function parseAnswer(outcome: ProtocolOutcome): { outcome: string; text: string } | null {
  if (outcome.kind !== "protocol_validated" || typeof outcome.output !== "string") return null;
  try {
    const value: unknown = JSON.parse(outcome.output);
    return record(value) && Object.keys(value).length === 2 && typeof value.outcome === "string"
      && ["answered", "partial", "clarification", "blocked", "technical_failure"].includes(value.outcome)
      && typeof value.text === "string" && value.text.trim().length > 0 && value.text.length <= 8000
      && !/^(?:outcome\s*[:=-]\s*)?(?:answered|partial|clarification|blocked|technical[\s_-]*failure)[.!]?$/i.test(value.text.trim())
      ? { outcome: value.outcome, text: value.text } : null;
  } catch { return null; }
}

function bounded<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("QA work unavailable"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { if (signal.aborted) throw new Error("QA work unavailable"); return work(); })
      .then(value => { if (signal.aborted) abort(); else resolve(value); }, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
