import { createHash } from "node:crypto";
import { invokeTextProviderProtocol, type TextAuthorizationRpc } from "../model-gateway/adapters/provider-protocol.ts";
import { TEXT_TASK_SYSTEM_PROMPT } from "../model-gateway/prompt/text-turn.ts";
import { QA_CONTEXT_LIMITS, QaContextError, type QaContextBinding } from "./index.ts";

/** Main freezes these two versioned SQL ports; legacy task_history RPCs stay untouched. */
export type QaSessionContextRpc = (
  name: "qa_read_work_v1" | "qa_authorize_dispatch_v1",
  params: Readonly<Record<string, string>>,
  signal: AbortSignal,
) => Promise<unknown>;
type ProtocolArgs = Parameters<typeof invokeTextProviderProtocol>;
const keys = ["kind", "schemaVersion", "contextMode", "ownerId", "authSessionId", "turnId", "threadId", "serviceTaskId", "policyId", "consentId", "provider", "endpoint", "text", "locale", "history", "sourceTurnIds", "contextDigest"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const row = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, k: readonly string[]) => Object.keys(v).length === k.length && k.every(x => Object.hasOwn(v, x));
function deny(): never { throw new QaContextError(); }

/** Consumes only qa-context/1, never a preview or legacy current-input/history row.
 * The original QA reader qualifies all source permissions under its lease before
 * returning this envelope. No caller policy/ready flag participates in assembly.
 */
export function assembleQaSessionContext(binding: QaContextBinding, raw: unknown) {
  if (![binding.actorId, binding.authSessionId, binding.sessionId, binding.taskId, binding.turnId, binding.policyId, binding.consentId].every(s => typeof s === "string" && uuid.test(s))
    || binding.scopeVersion !== 1 || !["qwen", "glm", "deepseek"].includes(binding.provider)
    || typeof binding.endpoint !== "string" || binding.endpoint.length > 512 || !binding.endpoint
    || !row(raw) || !exact(raw, keys)
    || raw.kind !== "qa_input" || raw.schemaVersion !== "qa-context/1"
    || raw.contextMode !== "qa_session_history_v1" || raw.ownerId !== binding.actorId || raw.authSessionId !== binding.authSessionId || raw.turnId !== binding.turnId
    || raw.threadId !== binding.sessionId || raw.serviceTaskId !== binding.taskId || raw.policyId !== binding.policyId
    || raw.consentId !== binding.consentId || raw.provider !== binding.provider || raw.endpoint !== binding.endpoint
    || typeof raw.locale !== "string" || !["en", "zh", "es", "ru", "ar"].includes(raw.locale)
    || typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > QA_CONTEXT_LIMITS.userCharacters
    || typeof raw.contextDigest !== "string" || !/^[a-f0-9]{64}$/.test(raw.contextDigest)
    || !Array.isArray(raw.history) || raw.history.length > (QA_CONTEXT_LIMITS.sourceTurns - 1) * 2 || raw.history.length % 2 !== 0
    || !Array.isArray(raw.sourceTurnIds) || raw.sourceTurnIds.length !== raw.history.length / 2 + 1
    || raw.sourceTurnIds[0] !== binding.turnId || raw.sourceTurnIds.length > QA_CONTEXT_LIMITS.sourceTurns
    || new Set(raw.sourceTurnIds).size !== raw.sourceTurnIds.length
    || !raw.sourceTurnIds.every(s => typeof s === "string" && uuid.test(s))) return deny();
  const chronologicalIds = [...raw.sourceTurnIds].reverse();
  const qualified: { turnId: string; role: "user" | "assistant"; content: string }[] = [];
  for (let i = 0; i < raw.history.length; i++) {
    const s: unknown = raw.history[i];
    if (!row(s) || !exact(s, ["turnId", "role", "content"]) || s.turnId !== chronologicalIds[Math.floor(i / 2)]
      || s.role !== (i % 2 === 0 ? "user" : "assistant") || typeof s.content !== "string" || !s.content.trim()
      || s.content.length > (i % 2 === 0 ? QA_CONTEXT_LIMITS.userCharacters : QA_CONTEXT_LIMITS.assistantCharacters)) return deny();
    qualified.push({ turnId: String(s.turnId), role: s.role as "user" | "assistant", content: s.content });
  }
  // Upstream permission covers at most seven pairs. Consumer sends at most three.
  // Qualify the full bounded envelope before selecting the recent whole-pair window.
  if (Buffer.byteLength(JSON.stringify(raw.history), "utf8") > QA_CONTEXT_LIMITS.upstreamHistoryBytes) return deny();
  const selected = qualified.slice(-QA_CONTEXT_LIMITS.historyMessages);
  const messages = [...selected.map(({ role, content }) => ({ role, content })), { role: "user" as const, content: raw.text }];
  const totalBytes = messages.reduce((n, s) => n + Buffer.byteLength(s.content, "utf8"), 0);
  const promptBytes = Buffer.byteLength(JSON.stringify([{ role: "system", content: TEXT_TASK_SYSTEM_PROMPT }, ...messages]), "utf8");
  if (totalBytes > QA_CONTEXT_LIMITS.totalBytes || promptBytes > QA_CONTEXT_LIMITS.promptBytes) return deny();
  const refs = [...selected, { turnId: binding.turnId, role: "user" as const, content: raw.text }]
    .map((s, i) => Object.freeze({ turnId: s.turnId, role: s.role, projectionOrdinal: i + 1, contentVersion: hash(s.content) }));
  return Object.freeze({
    // Internal gateway serialization shape only. It grants no legacy SQL policy.
    gatewayInput: Object.freeze({ kind: "task_input", text: raw.text, locale: raw.locale,
      policyId: raw.policyId, provider: raw.provider, endpoint: raw.endpoint, contextDigest: raw.contextDigest,
      history: Object.freeze(selected.map(({ role, content }) => Object.freeze({ role, content }))) }),
    manifest: Object.freeze({ schemaVersion: "qa-session-context-manifest/1", taskId: binding.taskId,
      scopeVersion: binding.scopeVersion, sources: Object.freeze(refs), totalBytes, tokenUpperBound: promptBytes,
      upstreamPairs: qualified.length / 2, selectedPairs: selected.length / 2,
      contextDigest: raw.contextDigest, fingerprint: hash(JSON.stringify([binding, raw])) }),
  });
}

/** Uses original text protocol/model/output validation. Authorizes ONLY the new QA
 * SQL port, with original reserved scope/lease attempt. Every read independently
 * resolves ownerId/authSessionId through the protected current QA lease; no caller
 * identity callback or cached lease can claim fresh authentication.
 */
export async function invokeQaSessionContext(
  input: Readonly<{
    contextBinding: QaContextBinding; scopeId: string; rpc: QaSessionContextRpc;
    recordManifest?: (manifest: ReturnType<typeof assembleQaSessionContext>["manifest"]) => Promise<void>;
  }>,
  lease: ProtocolArgs[0] & Readonly<{ ownerId: string }>,
  provider: Omit<ProtocolArgs[1], "inputMode">,
  budget: ProtocolArgs[3], transport: ProtocolArgs[4], signal: AbortSignal,
): ReturnType<typeof invokeTextProviderProtocol> {
  if (!Number.isSafeInteger(provider.timeoutMs) || provider.timeoutMs < 1 || provider.timeoutMs > 60000) {
    return { kind: "unavailable", code: "INVALID_INPUT", usage: null, cost: "unknown" };
  }
  if (signal.aborted) return { kind: "cancelled", code: "CANCELLED", usage: null, cost: "unknown" };
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const interrupted = new Promise<Awaited<ReturnType<typeof invokeTextProviderProtocol>>>(resolve => {
    controller.signal.addEventListener("abort", () => resolve(timedOut
      ? { kind: "unavailable", code: "TIMEOUT_BEFORE_OUTPUT", usage: null, cost: "unknown" }
      : { kind: "cancelled", code: "CANCELLED", usage: null, cost: "unknown" }), { once: true });
  });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, provider.timeoutMs);
  try {
    return await Promise.race([
      invokeWithinDeadline(input, lease, provider, budget, transport, controller.signal),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort); controller.abort();
  }
}

async function invokeWithinDeadline(
  input: Parameters<typeof invokeQaSessionContext>[0],
  lease: ProtocolArgs[0] & Readonly<{ ownerId: string }>,
  provider: Omit<ProtocolArgs[1], "inputMode">,
  budget: ProtocolArgs[3], transport: ProtocolArgs[4], signal: AbortSignal,
): ReturnType<typeof invokeTextProviderProtocol> {
  let fingerprint: string | undefined;
  const read = async () => {
    if (signal.aborted || !uuid.test(input.scopeId) || lease.turnId !== input.contextBinding.turnId
      || lease.ownerId !== input.contextBinding.actorId || provider.provider !== input.contextBinding.provider
      || provider.endpoint !== input.contextBinding.endpoint) return deny();
    if (signal.aborted) return deny();
    const raw = await input.rpc("qa_read_work_v1", { p_turn_id: lease.turnId, p_lease_token: lease.leaseToken }, signal);
    if (signal.aborted) return deny();
    return assembleQaSessionContext(input.contextBinding, raw);
  };
  const rpc: TextAuthorizationRpc = async (name, params) => {
    try {
      if (name === "read_text_work") {
        const assembled = await read(); fingerprint = assembled.manifest.fingerprint;
        return assembled.gatewayInput;
      }
      if (name !== "authorize_text_task_dispatch" || fingerprint === undefined) return { kind: "blocked" };
      const fresh = await read();
      if (fresh.manifest.fingerprint !== fingerprint || params.p_context_digest !== fresh.gatewayInput.contextDigest) return { kind: "blocked" };
      // Optional content-free audit must finish before final SQL authorization.
      // It cannot insert delay after permission check or alter the sent prompt.
      if (input.recordManifest) await input.recordManifest(fresh.manifest);
      if (signal.aborted) return { kind: "blocked" };
      return await input.rpc("qa_authorize_dispatch_v1", { ...params, p_scope_id: input.scopeId }, signal);
    } catch { return { kind: "blocked" }; }
  };
  return invokeTextProviderProtocol(lease, { ...provider, inputMode: "task_history_v1" }, rpc, budget, transport, signal);
}
