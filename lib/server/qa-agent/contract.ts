/** Browser wire. Session IDs are original chat_threads IDs, never a second store. */
export const QA_AGENT_WIRE_VERSION = "qa-agent/1" as const;
export type QaStatus = "pending" | "answered" | "partial" | "clarification" | "blocked" | "technical_failure";
export type QaSession = Readonly<{ id: string; label: string; createdAt: string; updatedAt: string }>;
export type QaMessage = Readonly<{
  requestId: string; turnId: string; sessionId: string; input: string;
  text: string | null; status: QaStatus; createdAt: string;
}>;
export type QaPolicy = Readonly<{
  id: string; noticeHash: string; noticeZh: string; noticeEn: string;
  provider: string; recipient: string; consentState: "not_accepted" | "accepted" | "withdrawn";
  contextMode: "current_input_v1" | "task_history_v1";
}>;
export type QaErrorCode = "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "DATA_POLICY_BLOCKED" | "IDEMPOTENCY_KEY_REUSE" | "PROVIDER_UNAVAILABLE";
export class QaError extends Error {
  readonly code: QaErrorCode;
  readonly ack: "not_submitted" | "unknown";
  constructor(code: QaErrorCode, ack: "not_submitted" | "unknown" = "not_submitted") { super(code); this.code = code; this.ack = ack; }
}
export type QaEnvelope<T> = Readonly<{ version: typeof QA_AGENT_WIRE_VERSION }> & T;
export type QaFailure = QaEnvelope<{ error: { code: QaErrorCode; ack: "not_submitted" | "unknown" } }>;
export type QaSessionsResponse = QaEnvelope<{ sessions: readonly QaSession[] }>;
export type QaCreateResponse = QaEnvelope<{ session: QaSession }>;
export type QaDetailResponse = QaEnvelope<{ session: QaSession; messages: readonly QaMessage[]; historyLimit: 20; policy: QaPolicy }>;
export type QaMessageResponse = QaEnvelope<{ message: QaMessage }>;
export type QaSubmitResponse = QaEnvelope<{ requestId: string; turnId: string; sessionId: string; status: "pending"; reused: boolean }>;
export type QaPolicyResponse = QaEnvelope<{ policy: QaPolicy }>;
