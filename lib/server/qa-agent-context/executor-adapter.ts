import type { DurableTurnLease } from "../turn/durable-worker.ts";
import type { TextProviderBinding, TextWorkerConfig } from "../turn/text-worker.ts";
import { assembleQaSessionContext, invokeQaSessionContext } from "./session.ts";
import type { QaContextBinding } from "./index.ts";

type Invoke = Parameters<typeof invokeQaSessionContext>;
/** Structural port matches qa-agent/executor's QaContextInvocation without a
 * dependency on another writer's unmerged module or access to its directory. */
export type QaExecutorContextInput = Readonly<{
  lease: DurableTurnLease; input: Readonly<Record<string, unknown>>;
  budget: Invoke[3]; transport: Invoke[4]; signal: AbortSignal;
  rpc: (name: string, params: Readonly<Record<string, string | number | null>>, signal: AbortSignal) => Promise<unknown>;
  binding: TextProviderBinding; configuration: TextWorkerConfig;
}>;

export function createQaContextInvoker(dependencies: Readonly<{
  recordManifest?: Invoke[0]["recordManifest"];
}> = {}) {
  return async (input: QaExecutorContextInput): ReturnType<typeof invokeQaSessionContext> => {
    const raw = input.input;
    // All values are from the executor's authenticated original lease + QA SQL
    // read. Unknown values are denied by the assembler, never converted/coerced.
    if (typeof raw.threadId !== "string" || typeof raw.serviceTaskId !== "string"
      || typeof raw.policyId !== "string" || typeof raw.consentId !== "string" || typeof raw.authSessionId !== "string") {
      return { kind: "unavailable", code: "DATA_POLICY_BLOCKED", usage: null, cost: "unknown" };
    }
    const contextBinding: QaContextBinding = {
      actorId: input.lease.ownerId, authSessionId: raw.authSessionId, sessionId: raw.threadId, taskId: raw.serviceTaskId,
      scopeVersion: 1, turnId: input.lease.turnId, policyId: raw.policyId, consentId: raw.consentId,
      provider: input.binding.provider, endpoint: input.binding.endpoint,
    };
    try { assembleQaSessionContext(contextBinding, raw); }
    catch { return { kind: "unavailable", code: "DATA_POLICY_BLOCKED", usage: null, cost: "unknown" }; }
    return invokeQaSessionContext({ contextBinding, scopeId: input.configuration.scopeId,
      recordManifest: dependencies.recordManifest,
      rpc: (name, params, signal) => input.rpc(name, params, signal) },
    input.lease, { provider: input.binding.provider, endpoint: input.binding.endpoint,
      maxOutputTokens: input.configuration.maxOutputTokens, timeoutMs: input.configuration.timeoutMs,
      thinkingBudgetTokens: input.binding.thinkingBudgetTokens }, input.budget, input.transport, input.signal);
  };
}
