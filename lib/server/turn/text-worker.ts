import { textTurnFailureCopy, type Locale } from "../../i18n.ts";
import { randomUUID } from "node:crypto";
import { CostGuard } from "../model-gateway/budget/index.ts";
import { runWithDurableBudget, type BudgetAttempt, type BudgetRpc } from "../model-gateway/budget/durable.ts";
import { invokeTextProviderProtocol, invokeKnowledgeIntentProtocol, validTextTaskHistory, PROTOCOL_MODELS, type ProtocolTransport, type ProtocolUsage } from "../model-gateway/adapters/provider-protocol.ts";
import { validateKnowledgeIntent, type KnowledgeIntent, type KnowledgeIntentRejection } from "../knowledge/claim/intent.ts";
import { runDurableTurnWork, type TurnWorkRpc } from "./durable-worker.ts";
import { validatedUsageReceipt, type RecordValidatedUsage } from "../model-gateway/budget/usage-receipt.ts";

export type TextWorkRpc = (name: "read_text_work" | "authorize_text_dispatch" | "authorize_text_task_dispatch" | "complete_text_work" | "read_grounded_work" | "authorize_grounded_dispatch" | "complete_grounded_work" | "complete_grounded_work_with_needs" | "complete_grounded_place_work", params: Readonly<Record<string, string>>) => Promise<unknown>;
export type TextWorkerConfig = Readonly<{
  scopeId: string;
  priceVersion: string;
  reservedMicros: number;
  maxOutputTokens: number;
  timeoutMs: number;
}>;
export type KnowledgeValidationReceipt = Readonly<{
  schemaVersion: "knowledge-validation/1";
  turnId: string;
  reason: KnowledgeIntentRejection | "valid" | "invalid_json" | "missing_unanswered_needs" | "protocol_unavailable";
}>;
export type RecordKnowledgeValidation = (receipt: KnowledgeValidationReceipt) => Promise<void>;
/** Trusted deployment binding must match the registry endpoint exactly. No default network transport. */
export type TextProviderBinding = Readonly<{
  thinkingBudgetTokens?: number;
  inputMode?: "current_input_v1" | "task_history_v1" | "knowledge_intent_v1";
  provider: keyof typeof PROTOCOL_MODELS;
  endpoint: string;
  transport: ProtocolTransport;
  price: (usage: ProtocolUsage) => number | null;
  /** Persist validated usage before settlement; failure retains unknown-cost treatment. */
  recordUsage?: RecordValidatedUsage;
  /** Optional content-free observation after durable completion; cannot cause a model retry. */
  recordKnowledgeValidation?: RecordKnowledgeValidation;
}>;

/**
 * Executes one durable text lease. Each lease has its own budget attempt; unknown
 * charges remain pending. Completion stores bounded text and terminal atomically.
 * No scheduler/credentials/active policy or real recipient is configured here.
 */
export async function runTextWorker(
  workRpc: TurnWorkRpc, textRpc: TextWorkRpc, budgetRpc: BudgetRpc,
  config: TextWorkerConfig, binding: TextProviderBinding, signal: AbortSignal,
): Promise<"empty" | "finished" | "queued" | "unavailable"> {
  return runDurableTurnWork(workRpc, async (lease, leaseSignal) => {
    const keys = { p_turn_id: lease.turnId, p_lease_token: lease.leaseToken };
    const grounded = binding.inputMode === "knowledge_intent_v1";
    const input = await textRpc(grounded ? "read_grounded_work" : "read_text_work", keys);
    const taskMode = binding.inputMode === "task_history_v1";
    if (!record(input) || input.kind !== (grounded ? "intent_input" : taskMode ? "task_input" : "input")
      || (taskMode && !validTextTaskHistory(input.history)) || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000
      || typeof input.policyId !== "string" || input.provider !== binding.provider || input.endpoint !== binding.endpoint
      || typeof input.locale !== "string" || !["zh","en","es","ru","ar"].includes(input.locale)) return "validation_failure";
    const guard = new CostGuard({ windowMs: 120000, perUserAttempts: 1, perTaskAttempts: 1, turnDeadlineMs: 120000, maxModelSteps: 1, maxToolSteps: 1 }).startTurn({ userId: lease.ownerId, taskId: lease.turnId });
    if (guard.kind !== "turn") return "validation_failure";
    const attempt: BudgetAttempt = {
      scopeId: config.scopeId, ownerId: lease.ownerId, taskId: lease.turnId, attemptId: randomUUID(),
      provider: binding.provider, model: PROTOCOL_MODELS[binding.provider], priceVersion: config.priceVersion,
      reservedMicros: config.reservedMicros, timeoutMs: config.timeoutMs,
    };
    const result = await runWithDurableBudget(attempt, budgetRpc, async budgetSignal => {
      const value = grounded
        ? await invokeKnowledgeIntentProtocol(lease, { provider: binding.provider, endpoint: binding.endpoint, maxOutputTokens: config.maxOutputTokens, timeoutMs: config.timeoutMs }, textRpc, guard, binding.transport, budgetSignal)
        : await invokeTextProviderProtocol(lease, { thinkingBudgetTokens: binding.thinkingBudgetTokens, inputMode: binding.inputMode === "task_history_v1" ? "task_history_v1" : "current_input_v1", provider: binding.provider, endpoint: binding.endpoint, maxOutputTokens: config.maxOutputTokens, timeoutMs: config.timeoutMs }, textRpc, guard, binding.transport, budgetSignal);
      // Usage alone does not prove the model used for pricing. The normalizer can
      // retain usage on MODEL_OUTPUT_INVALID, including a mismatched model. Only
      // these outcomes establish model + usage; SAFETY_BLOCKED is emitted after
      // both checks. Business failure/refusal can still incur verified model cost.
      const priceable = value.kind === "protocol_validated" || (value.kind === "unavailable" && value.code === "SAFETY_BLOCKED");
      const actualMicros = priceable && value.usage ? binding.price(value.usage) : null;
      if (actualMicros !== null && value.usage && binding.recordUsage) {
        if (budgetSignal.aborted) throw new Error("Interrupted");
        await binding.recordUsage(validatedUsageReceipt({ schemaVersion: "validated-model-usage/1", attempt,
          turnId: lease.turnId, policyId: input.policyId, usage: value.usage, actualMicros, observedAt: new Date().toISOString() }), budgetSignal);
        if (budgetSignal.aborted) throw new Error("Interrupted");
      }
      return { value, actualMicros };
    }, leaseSignal);
    if (leaseSignal.aborted) throw new Error("Interrupted");
    // A transport failure may have incurred charges. Let the durable queue retry
    // with a separate budget attempt, subject to its bounded retry count.
    if (result.kind !== "completed") return "provider_failure";
    const output = result.value;
    if (grounded) {
      let intent: KnowledgeIntent | null = null;
      let reason: KnowledgeValidationReceipt["reason"] = "protocol_unavailable";
      if (output.kind === "protocol_validated" && typeof output.output === "string") {
        try {
          const validation = validateKnowledgeIntent(JSON.parse(output.output), input.text as string);
          reason = validation.kind === "valid" ? "valid" : validation.reason;
          intent = validation.kind === "valid" ? validation.value : null;
          // v5 output must identify gaps explicitly; compatibility is for old workers, not new missing fields.
          if (intent && intent.unansweredNeeds === undefined) { intent = null; reason = "missing_unanswered_needs"; }
        } catch { reason = "invalid_json"; /* Never persist arbitrary model text. */ }
      }
      const denied = output.kind === "unavailable" && ["SAFETY_BLOCKED", "DATA_POLICY_BLOCKED"].includes(output.code);
      const persisted = await textRpc(intent?.placeName ? "complete_grounded_place_work" : intent?.unansweredNeeds ? "complete_grounded_work_with_needs" : "complete_grounded_work", { ...keys,
        ...(intent?.placeName ? { p_place_name: intent.placeName } : {}),
        ...(intent?.unansweredNeeds ? { p_unanswered_needs: JSON.stringify(intent.unansweredNeeds) } : {}),
        p_intent: intent?.intent ?? (denied ? "blocked" : "technical_failure"), p_request_scope: intent?.requestScope ?? "unknown" });
      if (!record(persisted) || persisted.kind !== "finished") throw new Error("Write rejected");
      try {
        await binding.recordKnowledgeValidation?.({ schemaVersion: "knowledge-validation/1", turnId: lease.turnId, reason });
      } catch { /* Observation failure cannot retry a completed, charged request. */ }
      return "persisted";
    }
    let answer: { outcome: string; text: string } | null = null;
    if (output.kind === "protocol_validated" && typeof output.output === "string") {
      try {
        const value: unknown = JSON.parse(output.output);
        if (record(value) && Object.keys(value).length === 2 && typeof value.outcome === "string" && ["answered","partial","clarification","blocked","technical_failure"].includes(value.outcome)
          && typeof value.text === "string" && value.text.trim().length > 0 && value.text.length <= 8000) answer = { outcome: value.outcome, text: value.text };
      } catch { /* Reject raw/invalid provider output. */ }
    }
    const kind = answer?.outcome ?? (output.kind === "unavailable" && ["SAFETY_BLOCKED","DATA_POLICY_BLOCKED"].includes(output.code) ? "blocked" : "technical_failure");
    const text = answer?.text ?? textTurnFailureCopy[input.locale as Locale][kind === "blocked" ? "blocked" : "technical_failure"];
    const persisted = await textRpc("complete_text_work", { ...keys, p_kind: kind, p_text: text });
    if (!record(persisted) || persisted.kind !== "finished") throw new Error("Write rejected");
    return "persisted";
  }, signal);
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
