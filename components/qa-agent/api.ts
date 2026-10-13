/** The sole browser wire mapping; cookie identity and saved text remain server authority. */
export type Session = { id: string; createdAt: string; updatedAt: string; label: string };
export type Message = { requestId: string; text: string; answer: string | null; status: "pending" | "answered" | "partial" | "clarification" | "blocked" | "technical_failure" };
export type History = { session: Session; messages: Message[] };
export type Policy = { policyId: string; noticeHash: string; noticeZh: string; noticeEn: string; consented: boolean; contextMode: "current_input_v1" | "task_history_v1" };
export class ApiError extends Error {
  constructor(public status: number, public code = "PROVIDER_UNAVAILABLE", public ack: "not_submitted" | "unknown" = "unknown") { super(`QA request failed (${status})`); }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function invalid(): never { throw new ApiError(502, "INVALID_RESPONSE"); }
async function request(path: string, signal: AbortSignal, body?: object): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/qa-agent${path}`, {
    method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  let data: unknown;
  try { data = await response.json(); } catch { throw new ApiError(response.status || 502); }
  if (!response.ok) {
    const error = record(data) && record(data.error) ? data.error : null;
    throw new ApiError(response.status, typeof error?.code === "string" ? error.code : "PROVIDER_UNAVAILABLE", error?.ack === "not_submitted" ? "not_submitted" : "unknown");
  }
  if (!record(data) || data.version !== "qa-agent/1") invalid();
  return data;
}
function session(value: unknown): Session {
  if (!record(value) || !uuid(value.id) || typeof value.label !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") invalid();
  return { id: value.id, label: value.label, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
function policy(value: unknown): Policy {
  if (!record(value) || !uuid(value.id) || typeof value.noticeHash !== "string" || !/^[a-f0-9]{64}$/.test(value.noticeHash)
    || typeof value.noticeZh !== "string" || !value.noticeZh.trim() || typeof value.noticeEn !== "string" || !value.noticeEn.trim()
    || !["accepted", "not_accepted", "withdrawn"].includes(String(value.consentState))
    || !["current_input_v1", "task_history_v1"].includes(String(value.contextMode))) invalid();
  return { policyId: value.id, noticeHash: value.noticeHash, noticeZh: value.noticeZh, noticeEn: value.noticeEn, consented: value.consentState === "accepted", contextMode: value.contextMode as Policy["contextMode"] };
}
function message(value: unknown, sessionId: string, requestId?: string): Message {
  if (!record(value) || !uuid(value.requestId) || value.turnId !== value.requestId || value.sessionId !== sessionId
    || (requestId && value.requestId !== requestId) || typeof value.input !== "string" || !value.input.trim() || value.input.length > 4000
    || !["pending", "answered", "partial", "clarification", "blocked", "technical_failure"].includes(String(value.status))
    || (value.text !== null && (typeof value.text !== "string" || !value.text.trim() || value.text.length > 8000))
    || (value.status === "pending" && value.text !== null)
    || (["answered", "partial", "clarification"].includes(String(value.status)) && value.text === null)) invalid();
  return { requestId: value.requestId, text: value.input, answer: value.text as string | null, status: value.status as Message["status"] };
}
const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;
export const qaApi = {
  async sessions(signal: AbortSignal) { const data = await request("/sessions", signal); if (!Array.isArray(data.sessions)) invalid(); return { sessions: data.sessions.map(session) }; },
  async create(signal: AbortSignal) { return { session: session((await request("/sessions", signal, {})).session) }; },
  async history(id: string, signal: AbortSignal): Promise<History> {
    const data = await request(sessionPath(id), signal), selected = session(data.session);
    if (selected.id !== id || !Array.isArray(data.messages)) invalid();
    return { session: selected, messages: data.messages.map(value => message(value, id)) };
  },
  async policy(signal: AbortSignal) { return policy((await request("/policy", signal)).policy); },
  async consent(notice: Policy, signal: AbortSignal) { return policy((await request("/consent", signal, { policyId: notice.policyId, noticeHash: notice.noticeHash })).policy); },
  async send(id: string, input: { requestId: string; text: string }, signal: AbortSignal) {
    const data = await request(`${sessionPath(id)}/messages`, signal, input);
    if (data.sessionId !== id || data.requestId !== input.requestId || data.turnId !== input.requestId || data.status !== "pending" || typeof data.reused !== "boolean") invalid();
    return { message: { requestId: input.requestId, text: input.text, answer: null, status: "pending" as const } };
  },
  async recover(id: string, requestId: string, signal: AbortSignal) { return { message: message((await request(`${sessionPath(id)}/messages/${encodeURIComponent(requestId)}`, signal)).message, id, requestId) }; },
};
