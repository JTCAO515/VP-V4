import { CostGuard } from "../../../../lib/server/model-gateway/budget/index.ts";
import { PROTOCOL_MODELS, type ProtocolProvider, type ProtocolRequest } from "../../../../lib/server/model-gateway/adapters/provider-protocol.ts";

export const providers: ProtocolProvider[] = ["qwen", "glm", "deepseek"];
export function request(provider: ProtocolProvider, overrides: Partial<ProtocolRequest> = {}): ProtocolRequest {
  return { requestId: "synthetic-001", provider, dataClass: "c0_synthetic", input: "Synthetic protocol sample", task: "ordinary_text", maxOutputTokens: 128, timeoutMs: 1000, ...overrides };
}
export function budget(maxModelSteps = 2) {
  const guard = new CostGuard({ windowMs: 10000, perUserAttempts: 8, perTaskAttempts: 8, turnDeadlineMs: 10000, maxModelSteps, maxToolSteps: 1 });
  const turn = guard.startTurn({ userId: "synthetic-user", taskId: "synthetic-task" });
  if (turn.kind !== "turn") throw new Error("Invalid synthetic budget");
  return turn;
}
export function completion(provider: ProtocolProvider, message: unknown = { role: "assistant", content: "Synthetic answer" }, finish = "stop") {
  return {
    model: PROTOCOL_MODELS[provider],
    choices: [{ index: 0, finish_reason: finish, message }],
    usage: {
      prompt_tokens: 10, completion_tokens: 4, total_tokens: 14,
      ...(provider === "deepseek" ? { prompt_cache_hit_tokens: 3, prompt_cache_miss_tokens: 7 } : { prompt_tokens_details: { cached_tokens: 3 } }),
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  };
}
