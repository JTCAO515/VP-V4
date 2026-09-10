import { textTurnFailureCopy, type Locale } from "../../i18n.ts";
import { randomUUID } from "node:crypto";
import { CostGuard } from "../model-gateway/budget/index.ts";
import { runWithDurableBudget, type BudgetAttempt, type BudgetRpc } from "../model-gateway/budget/durable.ts";
import { invokeTextProviderProtocol, PROTOCOL_MODELS, type ProtocolTransport, type ProtocolUsage } from "../model-gateway/adapters/provider-protocol.ts";
import { runDurableTurnWork, type TurnWorkRpc } from "./durable-worker.ts";

export type TextWorkRpc = (name: "read_text_work" | "authorize_text_dispatch" | "complete_text_work", params: Readonly<Record<string, string>>) => Promise<unknown>;
export type TextWorkerConfig = Readonly<{
  scopeId: string;
  priceVersion: string;
  reservedMicros: number;
  maxOutputTokens: number;
  timeoutMs: number;
}>;
/** Trusted deployment binding must match the registry endpoint exactly. No default network transport. */
export type TextProviderBinding = Readonly<{
  provider: keyof typeof PROTOCOL_MODELS;
  endpoint: string;
  transport: ProtocolTransport;
  price: (usage: ProtocolUsage) => number | null;
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
    const input = await textRpc("read_text_work", keys);
    if (!record(input) || input.kind !== "input" || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000
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
      const value = await invokeTextProviderProtocol(lease, { provider: binding.provider, endpoint: binding.endpoint, maxOutputTokens: config.maxOutputTokens, timeoutMs: config.timeoutMs }, textRpc, guard, binding.transport, budgetSignal);
      return { value, actualMicros: value.usage ? binding.price(value.usage) : null };
    }, leaseSignal);
    if (leaseSignal.aborted) throw new Error("Interrupted");
    // A transport failure may have incurred charges. Let the durable queue retry
    // with a separate budget attempt, subject to its bounded retry count.
    if (result.kind !== "completed") return "provider_failure";
    const output = result.value;
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
