import { createHash } from "node:crypto";
import { QaError, type QaMessage, type QaPolicy, type QaSession, type QaStatus } from "./contract.ts";

export type Rpc = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type Thread = { id: string; status: string; createdAt: string; updatedAt: string };
export type ThreadRead = { thread: Thread; turns: readonly { id: string; status: string; createdAt: string }[] };
export type QaStore = {
  list(): Promise<readonly Thread[]>; create(): Promise<Thread>; read(id: string): Promise<ThreadRead>;
  rpc: Rpc;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const outcomes: readonly QaStatus[] = ["answered", "partial", "clarification", "blocked", "technical_failure"];

/** Uses original protected admission, work queue and text authority exclusively. */
export function createQaService(store: QaStore, policyId: string, contextMode: "current_input_v1" | "task_history_v1" = "current_input_v1") {
  async function call(name: string, params: Record<string, unknown>) {
    const result = await store.rpc(name, params);
    if (result.error) throw rpcError(result.error.message);
    if (!record(result.data)) throw new QaError("PROVIDER_UNAVAILABLE");
    if (["unavailable", "blocked"].includes(String(result.data.kind))) throw new QaError("DATA_POLICY_BLOCKED");
    return result.data;
  }
  async function policy(): Promise<QaPolicy> {
    const data = await call(contextMode === "task_history_v1" ? "read_text_task_policy" : "read_text_policy", { p_policy_id: policyId });
    const p = data.policy;
    if (data.kind !== "policy" || !record(p) || p.id !== policyId || typeof p.noticeHash !== "string" || !/^[a-f0-9]{64}$/.test(p.noticeHash)
      || ![p.noticeZh, p.noticeEn, p.provider, p.recipient].every(v => typeof v === "string" && v.length > 0)
      || !["not_accepted", "accepted", "withdrawn"].includes(String(p.consentState))) throw new QaError("DATA_POLICY_BLOCKED");
    // The task-policy RPC verifies the real stored context mode. Provider history
    // remains bounded and SQL-authorized by the original same-Task dispatcher.
    return { id: policyId, noticeHash: p.noticeHash, noticeZh: p.noticeZh as string, noticeEn: p.noticeEn as string,
      provider: p.provider as string, recipient: p.recipient as string, consentState: p.consentState as QaPolicy["consentState"], contextMode };
  }
  async function readable(sessionId: string) {
    if (!uuid(sessionId)) throw new QaError("INVALID_INPUT");
    const detail = await store.read(sessionId);
    if (detail.thread.id !== sessionId || detail.thread.status !== "active") throw new QaError("FORBIDDEN");
    return detail;
  }
  async function saved(sessionId: string, turn: ThreadRead["turns"][number]): Promise<QaMessage> {
    const text = await call("read_text_turn", { p_turn_id: turn.id });
    if (text.kind !== "text" || text.turnId !== turn.id || typeof text.input !== "string" || !text.input.trim() || text.input.length > 4000
      || (text.output !== null && (typeof text.output !== "string" || !text.output.trim() || text.output.length > 8000))
      || (text.outcome !== null && !outcomes.includes(text.outcome as QaStatus))) throw new QaError("PROVIDER_UNAVAILABLE");
    const terminal = ["completed", "failed", "unavailable", "cancelled", "proposal_ready"].includes(turn.status);
    if ((text.output === null) !== (text.outcome === null)) throw new QaError("PROVIDER_UNAVAILABLE");
    if (!terminal && text.output !== null) throw new QaError("PROVIDER_UNAVAILABLE");
    // Never manufacture an answer for terminal-without-text, including cancellation.
    const status: QaStatus = text.outcome === null ? (terminal ? "technical_failure" : "pending") : text.outcome as QaStatus;
    return { requestId: turn.id, turnId: turn.id, sessionId, input: text.input, text: text.output as string | null, status, createdAt: turn.createdAt };
  }
  const session = (t: Thread): QaSession => ({ id: t.id, label: "Session", createdAt: t.createdAt, updatedAt: t.updatedAt });
  return {
    policy,
    async consent(input: unknown) {
      if (!record(input) || !exact(input, ["policyId", "noticeHash"]) || input.policyId !== policyId || typeof input.noticeHash !== "string" || !/^[a-f0-9]{64}$/.test(input.noticeHash)) throw new QaError("INVALID_INPUT");
      const p = await policy();
      if (p.noticeHash !== input.noticeHash) throw new QaError("DATA_POLICY_BLOCKED");
      const result = await call("accept_text_policy", { p_policy_id: policyId, p_notice_hash: input.noticeHash });
      if (result.kind !== "accepted" || result.policyId !== policyId) throw new QaError("PROVIDER_UNAVAILABLE");
      return policy();
    },
    async list() { return { sessions: (await store.list()).filter(t => t.status === "active").map(session) }; },
    async create(input: unknown) {
      if (!record(input) || !exact(input, [])) throw new QaError("INVALID_INPUT");
      return { session: session(await store.create()) };
    },
    async detail(sessionId: string) {
      const p = await policy();
      if (p.consentState !== "accepted") throw new QaError("DATA_POLICY_BLOCKED");
      const detail = await readable(sessionId);
      // Bound protected text work to twenty original turns; no global-history filter.
      const messages: QaMessage[] = [];
      for (const turn of detail.turns.slice(-20)) messages.push(await saved(sessionId, turn));
      return { session: session(detail.thread), messages, historyLimit: 20, policy: p };
    },
    async message(sessionId: string, requestId: string) {
      if (!uuid(requestId)) throw new QaError("INVALID_INPUT");
      const p = await policy();
      if (p.consentState !== "accepted") throw new QaError("DATA_POLICY_BLOCKED");
      const detail = await readable(sessionId), turn = detail.turns.find(t => t.id === requestId);
      if (!turn) throw new QaError("FORBIDDEN");
      return { message: await saved(sessionId, turn) };
    },
    async submit(sessionId: string, input: unknown) {
      if (!record(input) || !exact(input, ["requestId", "text"]) || !uuid(input.requestId) || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000) throw new QaError("INVALID_INPUT");
      await readable(sessionId);
      const p = await policy();
      if (p.consentState !== "accepted") throw new QaError("DATA_POLICY_BLOCKED");
      // Same request UUID is original turn+idempotency identity. Do not trim or
      // regenerate: SQL compares the original bytes on duplicate/lost ACK replay.
      let result;
      try {
        const params = { p_thread_id: sessionId, p_turn_id: input.requestId, p_idempotency_key: input.requestId,
          p_policy_id: policyId, p_locale: /[\u3400-\u9fff]/u.test(input.text) ? "zh" : "en", p_text: input.text };
        if (contextMode === "task_history_v1") {
          const basis = await call("qa_agent_task_basis_v1", { p_policy_id: policyId, p_thread_id: sessionId, p_turn_id: input.requestId });
          if (basis.kind !== "basis" || !(basis.taskId === null || uuid(basis.taskId))
            || !(basis.parentTurnId === null || uuid(basis.parentTurnId))
            || !["new_goal", "clarification", "repair"].includes(String(basis.relationship))
            || ((basis.relationship === "new_goal") !== (basis.parentTurnId === null))) throw new QaError("DATA_POLICY_BLOCKED");
          const taskId = basis.taskId ?? taskIdentity(sessionId);
          result = await call("submit_service_task_turn", { ...params, p_task_id: taskId, p_scope_version: 1,
            p_relationship: basis.relationship, p_parent_turn_id: basis.parentTurnId });
        } else result = await call("submit_text_turn", params);
      } catch (error) {
        if (error instanceof QaError && error.code !== "PROVIDER_UNAVAILABLE") throw error;
        throw new QaError("PROVIDER_UNAVAILABLE", "unknown");
      }
      if (result.kind !== "accepted" || result.turnId !== input.requestId || typeof result.reused !== "boolean") throw new QaError("PROVIDER_UNAVAILABLE", "unknown");
      // Accepted is pending until protected persisted text is read; no fake answer.
      return { requestId: input.requestId, turnId: result.turnId, sessionId, status: "pending" as const, reused: result.reused };
    },
  };
}
export function rpcError(message: string): QaError {
  if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) return new QaError("UNAUTHENTICATED");
  if (/FORBIDDEN/.test(message)) return new QaError("FORBIDDEN");
  if (/IDEMPOTENCY_KEY_REUSE/.test(message)) return new QaError("IDEMPOTENCY_KEY_REUSE");
  if (/INVALID_INPUT/.test(message)) return new QaError("INVALID_INPUT");
  if (/DATA_POLICY_BLOCKED|SERVICE_TASK/.test(message)) return new QaError("DATA_POLICY_BLOCKED");
  return new QaError("PROVIDER_UNAVAILABLE");
}

/** Stable original Task ID, distinct namespace from client request IDs. */
function taskIdentity(sessionId: string): string {
  const hex = createHash("sha256").update("qa-agent-original-task/1:" + sessionId.toLowerCase()).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
