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
export function createQaService(store: QaStore, policyId: string, contextMode: "current_input_v1" | "qa_session_history_v1" = "current_input_v1") {
  async function call(name: string, params: Record<string, unknown>) {
    const result = await store.rpc(name, params);
    if (result.error) throw rpcError(result.error.message);
    if (!record(result.data)) throw new QaError("PROVIDER_UNAVAILABLE");
    if (["unavailable", "blocked"].includes(String(result.data.kind))) throw new QaError("DATA_POLICY_BLOCKED");
    return result.data;
  }
  async function policy(): Promise<QaPolicy> {
    const data = await call(contextMode === "qa_session_history_v1" ? "qa_read_policy_v1" : "read_text_policy", { p_policy_id: policyId });
    const p = data.policy;
    if (contextMode === "qa_session_history_v1" && (!record(p) || p.contextMode !== contextMode || p.maxTurns !== 8)) throw new QaError("DATA_POLICY_BLOCKED");
    if (data.kind !== "policy" || !record(p) || p.id !== policyId || typeof p.noticeHash !== "string" || !/^[a-f0-9]{64}$/.test(p.noticeHash)
      || ![p.noticeZh, p.noticeEn, p.provider, p.recipient].every(v => typeof v === "string" && v.length > 0)
      || !["not_accepted", "accepted", "withdrawn"].includes(String(p.consentState))) throw new QaError("DATA_POLICY_BLOCKED");
    // The task-policy RPC verifies the real stored context mode. Provider history
    // remains bounded and SQL-authorized by the original same-Task dispatcher.
    return { id: policyId, noticeHash: p.noticeHash, noticeZh: p.noticeZh as string, noticeEn: p.noticeEn as string,
      provider: p.provider as string, recipient: p.recipient as string, consentState: p.consentState as QaPolicy["consentState"], contextMode, maxTurns: contextMode === "qa_session_history_v1" ? p.maxTurns as 8 : null };
  }
  async function readable(sessionId: string) {
    if (!uuid(sessionId)) throw new QaError("INVALID_INPUT");
    const detail = await store.read(sessionId);
    if (detail.thread.id !== sessionId || detail.thread.status !== "active") throw new QaError("FORBIDDEN");
    return detail;
  }
  async function saved(sessionId: string, turn: ThreadRead["turns"][number], protectedText?: Record<string, unknown>): Promise<QaMessage> {
    const text = protectedText ?? await call("read_text_turn", { p_turn_id: turn.id });
    if (text.kind !== "text" || text.turnId !== turn.id || typeof text.input !== "string" || !text.input.trim() || text.input.length > 4000
      || (text.output !== null && (typeof text.output !== "string" || !text.output.trim() || text.output.length > 8000))
      || (text.outcome !== null && !outcomes.includes(text.outcome as QaStatus))) throw new QaError("PROVIDER_UNAVAILABLE");
    const reconciliationRequired = contextMode === "qa_session_history_v1" && protectedText?.reconciliationRequired === true;
    if (reconciliationRequired && (text.output !== null || text.outcome !== null)) throw new QaError("DATA_POLICY_BLOCKED");
    const terminal = isTerminal(turn.status);
    if ((text.output === null) !== (text.outcome === null)) throw new QaError("PROVIDER_UNAVAILABLE");
    if (!terminal && text.output !== null) throw new QaError("PROVIDER_UNAVAILABLE");
    // Never manufacture an answer for terminal-without-text, including cancellation.
    const status: QaStatus = reconciliationRequired ? "reconciliation_required" : text.outcome === null ? (terminal ? "technical_failure" : "pending") : text.outcome as QaStatus;
    return { requestId: turn.id, turnId: turn.id, sessionId, input: text.input, text: text.output as string | null, status, createdAt: turn.createdAt };
  }
  async function qaSession(detail: ThreadRead) {
    const readSnapshot = async () => {
      const value = await call("qa_read_session_v1", { p_thread_id: detail.thread.id });
      if (value.kind !== "session" || value.schemaVersion !== "qa-session/1" || value.threadId !== detail.thread.id
        || !Array.isArray(value.messages) || value.messages.length > 8) throw new QaError("DATA_POLICY_BLOCKED");
      if (value.messages.length === 0) {
        if (value.policyId !== null || value.serviceTaskId !== null || value.lastTurnId !== null) throw new QaError("DATA_POLICY_BLOCKED");
      } else if (value.policyId !== policyId || !uuid(value.serviceTaskId) || !uuid(value.lastTurnId)) throw new QaError("DATA_POLICY_BLOCKED");
      const ids = new Set<string>(), texts: Record<string, unknown>[] = [];
      for (const item of value.messages) {
        if (!record(item) || item.kind !== "text" || !uuid(item.turnId) || ids.has(item.turnId)) throw new QaError("DATA_POLICY_BLOCKED");
        if (typeof item.reconciliationRequired !== "boolean"
          || (item.reconciliationRequired && (item.output !== null || item.outcome !== null))) throw new QaError("DATA_POLICY_BLOCKED");
        ids.add(item.turnId); texts.push(item);
      }
      if (texts.length && texts.at(-1)?.turnId !== value.lastTurnId) throw new QaError("DATA_POLICY_BLOCKED");
      return { taskId: value.serviceTaskId, lastTurnId: value.lastTurnId, texts };
    };
    const matches = (snapshot: Awaited<ReturnType<typeof readSnapshot>>, current: ThreadRead) =>
      snapshot.texts.length === current.turns.length && snapshot.texts.every(text => current.turns.some(turn => turn.id === text.turnId));
    let snapshot = await readSnapshot(), current = detail;
    const completedBetweenReads = snapshot.texts.some(text => {
      const turn = current.turns.find(t => t.id === text.turnId);
      return turn && !isTerminal(turn.status) && typeof text.output === "string";
    });
    // Another tab may append a Turn between the actor-scoped metadata read and
    // protected text read. Share one metadata refresh budget with completion
    // races, then reread protected text at most once if membership still differs.
    if (!matches(snapshot, current) || completedBetweenReads) current = await readable(detail.thread.id);
    const stateTextMismatch = () => snapshot.texts.some(text => {
      const turn = current.turns.find(t => t.id === text.turnId);
      return turn && ((!isTerminal(turn.status) && typeof text.output === "string")
        || (["completed", "proposal_ready"].includes(turn.status) && text.output === null && text.outcome === null));
    });
    // Membership can now match while the earlier text is still pending/null and
    // the refreshed metadata has completed. Spend the same one protected-reread
    // budget on this state/text race; never convert that stale null to failure.
    if (!matches(snapshot, current) || stateTextMismatch()) snapshot = await readSnapshot();
    // A confirmed terminal-without-text retains the existing failure projection.
    // Failed/cancelled/unavailable states already prove a terminal failure and do
    // not trigger rereads. Pending + output remains fail-closed in saved().
    // A persistent or continuing snapshot mismatch is retryable, not evidence
    // of consent withdrawal. Fail closed without returning a partial history.
    if (!matches(snapshot, current)) throw new QaError("PROVIDER_UNAVAILABLE");
    if (!snapshot.texts.length) return null;
    const messages: QaMessage[] = [];
    for (const text of snapshot.texts) {
      const turn = current.turns.find(t => t.id === text.turnId);
      if (!turn) throw new QaError("PROVIDER_UNAVAILABLE");
      messages.push(await saved(detail.thread.id, turn, text));
    }
    return { taskId: snapshot.taskId as string, lastTurnId: snapshot.lastTurnId as string, messages };
  }
  const session = (t: Thread): QaSession => ({ id: t.id, label: "Session", createdAt: t.createdAt, updatedAt: t.updatedAt });
  return {
    policy,
    async consent(input: unknown) {
      if (!record(input) || !exact(input, ["policyId", "noticeHash"]) || input.policyId !== policyId || typeof input.noticeHash !== "string" || !/^[a-f0-9]{64}$/.test(input.noticeHash)) throw new QaError("INVALID_INPUT");
      const p = await policy();
      if (p.noticeHash !== input.noticeHash) throw new QaError("DATA_POLICY_BLOCKED");
      const result = await call(contextMode === "qa_session_history_v1" ? "qa_accept_policy_v1" : "accept_text_policy", { p_policy_id: policyId, p_notice_hash: input.noticeHash });
      if (result.kind !== "accepted" || result.policyId !== policyId) throw new QaError("PROVIDER_UNAVAILABLE");
      return policy();
    },
    async list() {
      const threads = (await store.list()).filter(t => t.status === "active");
      if (contextMode !== "qa_session_history_v1") return { sessions: threads.map(session) };
      const value = await call("qa_list_sessions_v1", { p_limit: 20 });
      if (value.kind !== "sessions" || !Array.isArray(value.sessions) || value.sessions.length > 20) throw new QaError("PROVIDER_UNAVAILABLE");
      const ids = new Set<string>();
      for (const item of value.sessions) {
        if (!record(item) || !uuid(item.threadId) || ids.has(item.threadId)) throw new QaError("PROVIDER_UNAVAILABLE");
        ids.add(item.threadId);
      }
      return { sessions: threads.filter(t => ids.has(t.id)).map(session) };
    },
    async create(input: unknown) {
      if (!record(input) || !exact(input, [])) throw new QaError("INVALID_INPUT");
      return { session: session(await store.create()) };
    },
    async detail(sessionId: string) {
      const p = await policy();
      if (p.consentState !== "accepted") throw new QaError("DATA_POLICY_BLOCKED");
      const detail = await readable(sessionId);
      // Bound protected text work to twenty original turns; no global-history filter.
      const messages: QaMessage[] = contextMode === "qa_session_history_v1" ? (await qaSession(detail))?.messages ?? [] : [];
      if (contextMode !== "qa_session_history_v1") for (const turn of detail.turns.slice(-20)) messages.push(await saved(sessionId, turn));
      return { session: session(detail.thread), messages, historyLimit: 20, policy: p };
    },
    async message(sessionId: string, requestId: string) {
      if (!uuid(requestId)) throw new QaError("INVALID_INPUT");
      const p = await policy();
      if (p.consentState !== "accepted") throw new QaError("DATA_POLICY_BLOCKED");
      const detail = await readable(sessionId), turn = detail.turns.find(t => t.id === requestId);
      if (!turn) throw new QaError("FORBIDDEN");
      if (contextMode === "qa_session_history_v1") {
        const message = (await qaSession(detail))?.messages.find(m => m.requestId === requestId);
        if (!message) throw new QaError("FORBIDDEN");
        return { message };
      }
      return { message: await saved(sessionId, turn) };
    },
    async submit(sessionId: string, input: unknown) {
      if (!record(input) || !exact(input, ["requestId", "text"]) || !uuid(input.requestId) || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000) throw new QaError("INVALID_INPUT");
      const detail = await readable(sessionId);
      const p = await policy();
      if (p.consentState !== "accepted") throw new QaError("DATA_POLICY_BLOCKED");
      // Same request UUID is original turn+idempotency identity. Do not trim or
      // regenerate: SQL compares the original bytes on duplicate/lost ACK replay.
      const prior = contextMode === "qa_session_history_v1" ? await qaSession(detail) : null;
      let result;
      try {
        const params = { p_thread_id: sessionId, p_turn_id: input.requestId, p_idempotency_key: input.requestId,
          p_policy_id: policyId, p_locale: /[\u3400-\u9fff]/u.test(input.text) ? "zh" : "en", p_text: input.text };
        if (contextMode === "qa_session_history_v1") {
          // The versioned SQL wrapper resolves the original request's persisted
          // parent on retry, including after a newer turn has completed.
          result = await call("qa_submit_message_v1", { ...params, p_task_id: prior?.taskId ?? taskIdentity(sessionId),
            p_relationship: "qa_followup" });
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
  if (/QA_CONTEXT_LIMIT/.test(message)) return new QaError("QA_CONTEXT_LIMIT");
  if (/DATA_POLICY_BLOCKED|SERVICE_TASK|QA_MODE_CONFLICT/.test(message)) return new QaError("DATA_POLICY_BLOCKED");
  return new QaError("PROVIDER_UNAVAILABLE");
}

/** Stable original Task ID, distinct namespace from client request IDs. */
function taskIdentity(sessionId: string): string {
  const hex = createHash("sha256").update("qa-agent-original-task/1:" + sessionId.toLowerCase()).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

function isTerminal(status: string): boolean {
  return ["completed", "failed", "unavailable", "cancelled", "proposal_ready"].includes(status);
}
