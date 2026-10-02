import { createHash } from "node:crypto";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";
import { PLANNING_COMPARISON_PROMPT } from "../model-gateway/prompt/planning-comparison.ts";

export type PlanningV2ModelRequestBinding = Readonly<{
  owner: string; task: string; turn: string; lease: string; textPolicy: string; planningPolicy: string;
  scope: string; attempt: string; provider: "qwen"; model: string; priceVersion: string;
  intakeDigest: string; planningDigest: string;
}>;
export type PlanningV2ModelRequest = Readonly<{
  schemaVersion: "planning-v2-model-request/1"; binding: PlanningV2ModelRequestBinding; requestId: string;
  body: string; payloadDigest: string; requestDigest: string; executionAvailable: false;
}>;
const tupleKeys = ["owner", "task", "turn", "lease", "textPolicy", "planningPolicy", "scope", "attempt", "provider", "model", "priceVersion", "intakeDigest", "planningDigest"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9._-]{1,100}$/;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
function binding(v: unknown): v is PlanningV2ModelRequestBinding {
  return record(v) && keys(v, tupleKeys) && tupleKeys.every(k => typeof v[k] === "string")
    && tupleKeys.slice(0, 8).every(k => UUID.test(v[k] as string)) && v.provider === "qwen"
    && v.model === PROTOCOL_MODELS.qwen && TOKEN.test(v.priceVersion as string)
    && SHA.test(v.intakeDigest as string) && SHA.test(v.planningDigest as string)
    && v.task !== v.turn && v.intakeDigest !== v.planningDigest;
}
const sha = (body: string) => createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");

/** Deterministic bytes only: no send, endpoint, credential, timeout, permit or SQL authority.
 * Request UUID uniqueness per attempt is a later durable journal constraint, not enforced
 * by this stateless constructor. A matching expected tuple is structural data only. */
export function createPlanningV2ModelRequest(raw: unknown, expected: unknown): PlanningV2ModelRequest | null {
  if (!record(raw) || !keys(raw, ["schemaVersion", "binding", "requestId", "payload"])
    || raw.schemaVersion !== "planning-v2-model-request/1" || !binding(raw.binding) || !binding(expected)
    || typeof raw.requestId !== "string" || !UUID.test(raw.requestId) || !record(raw.payload)) return null;
  const b = raw.binding, p = raw.payload;
  if (!tupleKeys.every(k => b[k] === expected[k]) || !keys(p, ["model", "messages", "stream", "max_tokens", "enable_thinking", "response_format"])
    || p.model !== PROTOCOL_MODELS.qwen || p.model !== b.model || p.stream !== false || p.enable_thinking !== false
    || typeof p.max_tokens !== "number" || !Number.isSafeInteger(p.max_tokens) || p.max_tokens < 1 || p.max_tokens > 8192
    || !record(p.response_format) || !keys(p.response_format, ["type"]) || p.response_format.type !== "json_object"
    || !Array.isArray(p.messages) || p.messages.length !== 2) return null;
  const [system, user] = p.messages;
  if (!record(system) || !keys(system, ["role", "content"]) || system.role !== "system" || system.content !== PLANNING_COMPARISON_PROMPT
    || !record(user) || !keys(user, ["role", "content"]) || user.role !== "user" || typeof user.content !== "string"
    || user.content.trim().length === 0 || user.content.length > 32768 || user.content.includes("\0")
    || Buffer.from(user.content, "utf8").toString("utf8") !== user.content) return null;
  // Same field insertion order as the existing planning/qwen protocol; never jsonb::text.
  const body = JSON.stringify({ model: PROTOCOL_MODELS.qwen, messages: [
    { role: "system", content: PLANNING_COMPARISON_PROMPT }, { role: "user", content: user.content }],
    stream: false, max_tokens: p.max_tokens, enable_thinking: false, response_format: { type: "json_object" } });
  if (Buffer.byteLength(body, "utf8") > 65536) return null;
  const captured = Object.freeze(Object.fromEntries(tupleKeys.map(k => [k, b[k]]))) as PlanningV2ModelRequestBinding;
  const payloadDigest = sha(body);
  return Object.freeze({ schemaVersion: "planning-v2-model-request/1", binding: captured, requestId: raw.requestId, body, payloadDigest,
    requestDigest: sha(JSON.stringify(["planning-v2-model-request/1", tupleKeys.map(k => captured[k]), raw.requestId, payloadDigest])),
    executionAvailable: false });
}
