import { MODEL_PROFILES, validateKnownUnknownOutput, type KnownUnknownOutput, type ModelDataClass, type ModelTask } from "../index.ts";
import type { CostGuard } from "../budget/index.ts";
import type { FailureCode } from "../../contracts/errors/index.ts";
import { TEXT_TURN_SYSTEM_PROMPT, TEXT_TASK_SYSTEM_PROMPT } from "../prompt/text-turn.ts";
import { KNOWLEDGE_INTENT_SYSTEM_PROMPT } from "../prompt/knowledge-intent.ts";
import { WIKI_GENERATION_SYSTEM_PROMPT, isValidWikiGenerationDraftOutput, type WikiGenerationDraftOutput } from "../prompt/wiki-generation.ts";

export const PROTOCOL_MODELS = Object.freeze({
  qwen: MODEL_PROFILES.qwen_37_strict.providerModelId,
  glm: "glm-5.3-flash",
  deepseek: MODEL_PROFILES.deepseek_flash.providerModelId,
});
export type ProtocolProvider = keyof typeof PROTOCOL_MODELS;
export type ProtocolTool = Readonly<{
  name: string;
  parameters: Readonly<Record<string, unknown>>;
  validateArguments: (value: unknown) => boolean;
}>;
export type ProtocolRequest = Readonly<{
  requestId: string;
  provider: ProtocolProvider;
  dataClass: ModelDataClass;
  input: string;
  task: ModelTask | "tool_candidate" | "text_turn_v1" | "text_task_v2" | "knowledge_intent_v1" | "wiki_generation_v1";
  history?: readonly Readonly<{ role: "user" | "assistant"; content: string }>[];
  tool?: ProtocolTool;
  /** Optional bounded Qwen task-context experiment; output cap includes reasoning. */
  thinkingBudgetTokens?: number;
  maxOutputTokens: number;
  timeoutMs: number;
}>;
export type ProtocolUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number | null;
  uncachedInputTokens: number | null;
  reasoningTokens: number | null;
  cost: "unknown";
}>;
export type ProtocolOutcome =
  | Readonly<{
      kind: "protocol_validated";
      provider: ProtocolProvider;
      model: string;
      output: string | KnownUnknownOutput | WikiGenerationDraftOutput | Readonly<{ kind: "tool_candidate"; id: string; name: string; arguments: Record<string, unknown> }>;
      usage: ProtocolUsage;
    }>
  | Readonly<{ kind: "unavailable"; code: FailureCode; usage: ProtocolUsage | null; cost: "unknown" }>
  | Readonly<{ kind: "cancelled"; code: "CANCELLED"; usage: null; cost: "unknown" }>;

/** Deliberately no default fetch, endpoint, credential loading or production route. */
export type ProtocolTransport = (request: Readonly<{
  provider: ProtocolProvider;
  /** C2 supplies the exact durable policy endpoint; a bound HTTP transport must match it. */
  endpoint?: string;
  method: "POST";
  body: string;
  signal: AbortSignal;
}>) => Promise<Response>;
type BudgetTurn = Extract<ReturnType<CostGuard["startTurn"]>, { kind: "turn" }>;
const MAX_RESPONSE_BYTES = 262144;

/** C0 compatibility entry. No caller-supplied policy boolean can enable C2. */
export async function invokeProviderProtocol(
  request: ProtocolRequest, budget: BudgetTurn, transport: ProtocolTransport, signal: AbortSignal,
): Promise<ProtocolOutcome> {
  if (!validRequest(request)) return unavailable("INVALID_INPUT");
  if (signal.aborted) return cancelled();
  if (request.dataClass !== "c0_synthetic") return unavailable("DATA_POLICY_BLOCKED");
  return invokeProtocol(request, budget, transport, signal);
}

/** Trusted service RPC transport; must impose a finite database timeout. */
export type TextAuthorizationRpc = (name: "read_text_work" | "authorize_text_dispatch" | "authorize_text_task_dispatch", params: Readonly<Record<string, string>>) => Promise<unknown>;
export type KnowledgeAuthorizationRpc = (name: "read_grounded_work" | "authorize_grounded_dispatch", params: Readonly<Record<string, string>>) => Promise<unknown>;

/** A separate C2 exit accepts current input only; it cannot consume a history or evidence envelope. */
export async function invokeKnowledgeIntentProtocol(
  lease: Readonly<{ turnId: string; leaseToken: string }>,
  binding: Readonly<{ provider: ProtocolProvider; endpoint: string; maxOutputTokens: number; timeoutMs: number }>,
  rpc: KnowledgeAuthorizationRpc, budget: BudgetTurn, transport: ProtocolTransport, signal: AbortSignal,
): Promise<ProtocolOutcome> {
  if (signal.aborted) return cancelled();
  const keys = { p_turn_id: lease.turnId, p_lease_token: lease.leaseToken };
  let raw: unknown;
  try { raw = await rpc("read_grounded_work", keys); } catch { return unavailable("DATA_POLICY_BLOCKED"); }
  if (!record(raw) || Object.keys(raw).length !== 7 || raw.kind !== "intent_input"
    || raw.provider !== binding.provider || raw.endpoint !== binding.endpoint
    || typeof raw.policyId !== "string" || typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 4000
    || !["zh", "en"].includes(String(raw.locale))
    || typeof raw.contextDigest !== "string" || !/^[a-f0-9]{64}$/.test(raw.contextDigest)) return unavailable("DATA_POLICY_BLOCKED");
  const policyId = raw.policyId, digest = raw.contextDigest;
  return invokeProtocol({ requestId: lease.leaseToken, provider: binding.provider, dataClass: "c2_sensitive",
    input: raw.text, task: "knowledge_intent_v1", maxOutputTokens: binding.maxOutputTokens, timeoutMs: binding.timeoutMs },
  budget, transport, signal, async () => {
    const decision = await rpc("authorize_grounded_dispatch", { ...keys, p_policy_id: policyId,
      p_provider: binding.provider, p_context_digest: digest });
    return record(decision) && decision.kind === "authorized";
  }, binding.endpoint);
}
/**
 * The sole C2 exit owns both SQL checks and builds input from the durable row.
 * Caller binds an approved deployment transport; it cannot provide prompt content
 * or assert permission. No fallback inherits this recipient's grant.
 */
export async function invokeTextProviderProtocol(
  lease: Readonly<{ turnId: string; leaseToken: string }>,
  binding: Readonly<{ provider: ProtocolProvider; endpoint: string; maxOutputTokens: number; timeoutMs: number; thinkingBudgetTokens?: number; inputMode?: "current_input_v1" | "task_history_v1" }>,
  rpc: TextAuthorizationRpc, budget: BudgetTurn, transport: ProtocolTransport, signal: AbortSignal,
): Promise<ProtocolOutcome> {
  if (signal.aborted) return cancelled();
  const keys = { p_turn_id: lease.turnId, p_lease_token: lease.leaseToken };
  let raw: unknown;
  try { raw = await rpc("read_text_work", keys); } catch { return unavailable("DATA_POLICY_BLOCKED"); }
  const taskMode = binding.inputMode === "task_history_v1";
  if (!record(raw) || raw.kind !== (taskMode ? "task_input" : "input") || raw.provider !== binding.provider || raw.endpoint !== binding.endpoint
    || typeof raw.policyId !== "string" || typeof raw.text !== "string" || raw.text.length > 4000
    || (taskMode && (!validTextTaskHistory(raw.history) || typeof raw.contextDigest !== "string" || !/^[a-f0-9]{64}$/.test(raw.contextDigest)))) return unavailable("DATA_POLICY_BLOCKED");
  const policyId = raw.policyId;
  return invokeProtocol({ requestId: lease.leaseToken, provider: binding.provider, dataClass: "c2_sensitive", input: raw.text, task: taskMode ? "text_task_v2" : "text_turn_v1", ...(taskMode ? { history: raw.history as ProtocolRequest["history"] } : {}), thinkingBudgetTokens: binding.thinkingBudgetTokens, maxOutputTokens: binding.maxOutputTokens, timeoutMs: binding.timeoutMs }, budget, transport, signal, async () => {
    const decision = await rpc(taskMode ? "authorize_text_task_dispatch" : "authorize_text_dispatch", { ...keys, p_policy_id: policyId, p_provider: binding.provider, ...(taskMode ? { p_context_digest: raw.contextDigest as string } : {}) });
    return record(decision) && decision.kind === "authorized";
  }, binding.endpoint);
}

async function invokeProtocol(
  request: ProtocolRequest, budget: BudgetTurn, transport: ProtocolTransport, signal: AbortSignal,
  authorizeText?: () => Promise<boolean>,
  endpoint?: string,
): Promise<ProtocolOutcome> {
  if (!validRequest(request)) return unavailable("INVALID_INPUT");
  if (signal.aborted) return cancelled();
  if (request.dataClass !== "c0_synthetic" && (request.dataClass !== "c2_sensitive" || !["text_turn_v1", "text_task_v2", "knowledge_intent_v1"].includes(request.task) || !authorizeText)) return unavailable("DATA_POLICY_BLOCKED");
  let body: string;
  try { body = JSON.stringify(requestBody(request)); } catch { return unavailable("INVALID_INPUT"); }
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) return unavailable("INVALID_INPUT");
  const admission = budget.admitModelStep();
  if (admission.kind !== "admitted") return unavailable(admission.kind === "invalid" ? "INVALID_INPUT" : admission.code);

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, request.timeoutMs);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<ProtocolOutcome>((resolve) => {
    onAbort = () => resolve(timedOut ? unavailable("TIMEOUT_BEFORE_OUTPUT") : cancelled());
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    // Race also covers a transport/body stream that ignores AbortSignal. Late results are discarded.
    const attempt = async (): Promise<ProtocolOutcome> => {
      let response: Response;
      try {
        // C2 requires a fresh durable, lease-bound authorization immediately before egress.
        if (request.dataClass === "c2_sensitive" && !(await authorizeText!())) return unavailable("DATA_POLICY_BLOCKED");
        if (controller.signal.aborted) return cancelled();
        response = await transport({ provider: request.provider, ...(endpoint === undefined ? {} : { endpoint }), method: "POST", body, signal: controller.signal });
      } catch {
        return controller.signal.aborted
          ? timedOut ? unavailable("TIMEOUT_BEFORE_OUTPUT") : cancelled()
          : unavailable("PROVIDER_UNAVAILABLE");
      }
      if (controller.signal.aborted) { await response.body?.cancel(); return cancelled(); }
      if (!response.ok) {
        await response.body?.cancel();
        return unavailable("PROVIDER_UNAVAILABLE");
      }
      const value = await readBoundedJson(response, controller.signal);
      return normalizeResponse(request, value);
    };
    return await Promise.race([attempt(), interrupted]);
  } catch {
    return controller.signal.aborted
      ? timedOut ? unavailable("TIMEOUT_BEFORE_OUTPUT") : cancelled()
      : unavailable("MODEL_OUTPUT_INVALID");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

function requestBody(request: ProtocolRequest): Record<string, unknown> {
  return {
    model: PROTOCOL_MODELS[request.provider],
    messages: [
      ...(request.task === "text_turn_v1" ? [{ role: "system", content: TEXT_TURN_SYSTEM_PROMPT }] : []),
      ...(request.task === "text_task_v2" ? [{ role: "system", content: TEXT_TASK_SYSTEM_PROMPT }, ...request.history!] : []),
      ...(request.task === "knowledge_intent_v1" ? [{ role: "system", content: KNOWLEDGE_INTENT_SYSTEM_PROMPT }] : []),
      ...(request.task === "wiki_generation_v1" ? [{ role: "system", content: WIKI_GENERATION_SYSTEM_PROMPT }] : []),
      ...(request.task === "strict_known_unknown" ? [{ role: "system", content: 'Return only JSON: {"kind":"known","value":"nonempty text"} or {"kind":"unknown","reason":"fixture_no_evidence"}. Do not add fields.' }] : []),
      { role: "user", content: request.input },
    ],
    stream: false,
    ...(request.thinkingBudgetTokens === undefined
      ? { max_tokens: request.maxOutputTokens }
      : { max_completion_tokens: request.maxOutputTokens, thinking_budget: request.thinkingBudgetTokens }),
    // GLM-5.3-Flash rejects thinking: disabled (observed HTTP400/1210).
    // Preserve its native default; reasoning text still never leaves normalization.
    ...(request.provider === "qwen" ? { enable_thinking: request.thinkingBudgetTokens !== undefined } : request.provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
    ...(["strict_known_unknown", "text_turn_v1", "text_task_v2", "knowledge_intent_v1", "wiki_generation_v1"].includes(request.task) ? { response_format: { type: "json_object" } } : {}),
    ...(request.task === "tool_candidate" && request.tool ? {
      tools: [{ type: "function", function: { name: request.tool.name, parameters: request.tool.parameters } }],
      tool_choice: "auto",
    } : {}),
  };
}

function normalizeResponse(request: ProtocolRequest, value: unknown): ProtocolOutcome {
  if (!record(value)) return unavailable("MODEL_OUTPUT_INVALID");
  const usage = normalizeUsage(request.provider, value.usage);
  if (value.error || !usage || value.model !== PROTOCOL_MODELS[request.provider] || !Array.isArray(value.choices) || value.choices.length !== 1) return unavailable("MODEL_OUTPUT_INVALID", usage);
  if (request.thinkingBudgetTokens !== undefined && usage.outputTokens > request.maxOutputTokens) return unavailable("MODEL_OUTPUT_INVALID", usage);
  const choice = value.choices[0];
  if (!record(choice) || choice.index !== 0 || !record(choice.message) || choice.message.role !== "assistant") return unavailable("MODEL_OUTPUT_INVALID", usage);
  const message = choice.message;
  // Never display reasoning or treat a partial, blocked or resource-exhausted completion as an answer.
  if (choice.finish_reason === "content_filter" || (request.provider === "glm" && choice.finish_reason === "sensitive")) return unavailable("SAFETY_BLOCKED", usage);
  if (choice.finish_reason !== "stop" && choice.finish_reason !== "tool_calls") return unavailable("MODEL_OUTPUT_INVALID", usage);
  let output: Extract<ProtocolOutcome, { kind: "protocol_validated" }>["output"];
  if (request.task === "tool_candidate") {
    if (choice.finish_reason !== "tool_calls" || !request.tool || !Array.isArray(message.tool_calls) || message.tool_calls.length !== 1 || (message.content != null && message.content !== "")) return unavailable("MODEL_OUTPUT_INVALID", usage);
    const call = message.tool_calls[0];
    if (!record(call) || call.type !== "function" || typeof call.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(call.id) || !record(call.function) || call.function.name !== request.tool.name || typeof call.function.arguments !== "string") return unavailable("MODEL_OUTPUT_INVALID", usage);
    try {
      const args: unknown = JSON.parse(call.function.arguments);
      if (!record(args) || !request.tool.validateArguments(args)) return unavailable("MODEL_OUTPUT_INVALID", usage);
      output = { kind: "tool_candidate", id: call.id, name: request.tool.name, arguments: args };
    } catch { return unavailable("MODEL_OUTPUT_INVALID", usage); }
  } else {
    if (choice.finish_reason !== "stop" || (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0)) || typeof message.content !== "string" || !message.content.trim()) return unavailable("MODEL_OUTPUT_INVALID", usage);
    if (request.task === "strict_known_unknown") {
      try {
        const parsed: unknown = JSON.parse(message.content);
        if (!validateKnownUnknownOutput(parsed)) return unavailable("MODEL_OUTPUT_INVALID", usage);
        output = parsed;
      } catch { return unavailable("MODEL_OUTPUT_INVALID", usage); }
    } else if (request.task === "wiki_generation_v1") {
      try {
        const parsed: unknown = JSON.parse(message.content);
        if (!isValidWikiGenerationDraftOutput(parsed)) return unavailable("MODEL_OUTPUT_INVALID", usage);
        output = parsed;
      } catch { return unavailable("MODEL_OUTPUT_INVALID", usage); }
    } else output = message.content;
  }
  return { kind: "protocol_validated", provider: request.provider, model: value.model as string, output, usage };
}

function normalizeUsage(provider: ProtocolProvider, value: unknown): ProtocolUsage | null {
  if (!record(value) || !count(value.prompt_tokens) || !count(value.completion_tokens) || !count(value.total_tokens) || value.prompt_tokens + value.completion_tokens !== value.total_tokens) return null;
  const details = value.prompt_tokens_details;
  const completion = value.completion_tokens_details;
  if ((details != null && !record(details)) || (completion != null && !record(completion))) return null;
  const cached = provider === "deepseek" ? value.prompt_cache_hit_tokens : record(details) ? details.cached_tokens : undefined;
  const uncached = provider === "deepseek" ? value.prompt_cache_miss_tokens : undefined;
  const reasoning = record(completion) ? completion.reasoning_tokens : undefined;
  if ((cached !== undefined && (!count(cached) || cached > value.prompt_tokens)) || (reasoning !== undefined && (!count(reasoning) || reasoning > value.completion_tokens))) return null;
  if (provider === "deepseek" && (!count(cached) || !count(uncached) || cached + uncached !== value.prompt_tokens)) return null;
  return {
    inputTokens: value.prompt_tokens, outputTokens: value.completion_tokens, totalTokens: value.total_tokens,
    cachedInputTokens: typeof cached === "number" ? cached : null,
    uncachedInputTokens: typeof uncached === "number" ? uncached : null,
    reasoningTokens: typeof reasoning === "number" ? reasoning : null,
    cost: "unknown",
  };
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const type = response.headers.get("content-type")?.split(";")[0].trim();
  if (type !== "application/json" || !response.body) { await response.body?.cancel(); throw new Error("Invalid response format"); }
  const reader = response.body.getReader();
  const stop = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", stop, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error("Interrupted");
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Response limit"); }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    signal.removeEventListener("abort", stop);
    reader.releaseLock();
  }
}

function validRequest(value: ProtocolRequest): boolean {
  return record(value) && typeof value.requestId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.requestId) && Object.hasOwn(PROTOCOL_MODELS, value.provider)
    && ["ordinary_text", "strict_known_unknown", "tool_candidate", "text_turn_v1", "text_task_v2", "knowledge_intent_v1", "wiki_generation_v1"].includes(value.task)
    && (value.task === "text_task_v2" ? validTextTaskHistory(value.history) : value.history === undefined)
    && typeof value.input === "string" && value.input.trim().length > 0 && value.input.length <= 32768
    && ["c0_synthetic", "c1_user", "c2_sensitive", "c3_restricted", "c4_secret"].includes(value.dataClass)
    && count(value.maxOutputTokens) && value.maxOutputTokens > 0 && value.maxOutputTokens <= 8192
    && (value.thinkingBudgetTokens === undefined || (value.provider === "qwen" && value.task === "text_task_v2"
      && validThinkingBudget(value.thinkingBudgetTokens, value.maxOutputTokens)))
    && count(value.timeoutMs) && value.timeoutMs > 0 && value.timeoutMs <= 60000
    && (value.task === "tool_candidate"
      ? record(value.tool) && typeof value.tool.name === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value.tool.name) && record(value.tool.parameters) && value.tool.parameters.type === "object" && typeof value.tool.validateArguments === "function"
      : value.tool === undefined);
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function unavailable(code: FailureCode, usage: ProtocolUsage | null = null): ProtocolOutcome { return { kind: "unavailable", code, usage, cost: "unknown" }; }
function cancelled(): ProtocolOutcome { return { kind: "cancelled", code: "CANCELLED", usage: null, cost: "unknown" }; }

/** Fixed alternating roles; caller-supplied system/tool messages never enter C2. */
export function validTextTaskHistory(value: unknown): value is NonNullable<ProtocolRequest["history"]> {
  return Array.isArray(value) && value.length <= 6 && value.length % 2 === 0
    && value.every((item, i) => record(item) && Object.keys(item).length === 2
      && item.role === (i % 2 === 0 ? "user" : "assistant") && typeof item.content === "string"
      && item.content.trim().length > 0 && item.content.length <= (i % 2 === 0 ? 4000 : 8000));
}

/** Total generation is capped separately; reserve against the complete output cap. */
export function validThinkingBudget(value: unknown, total: number): value is number {
  return count(value) && value > 0 && value <= 2048 && count(total) && total <= 4096 && value < total;
}
