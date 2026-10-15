/** Browser-safe stop receipt. It never grants admission, retry or refund authority. */
export const QA_CANCELLATION_VERSION = "qa-cancellation/1" as const;
export const QA_CANCELLATION_STATES = ["pending", "cancelled", "terminal", "not_observed"] as const;
export type QaCancellationState = typeof QA_CANCELLATION_STATES[number];
export type QaCancellationReceipt = Readonly<{
  version: typeof QA_CANCELLATION_VERSION; sessionId: string; requestId: string;
  state: QaCancellationState; ack: "observed" | "unknown";
}>;
export type QaCancellationErrorCode = "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "PROVIDER_UNAVAILABLE";
export type QaCancellationFailure = Readonly<{
  version: typeof QA_CANCELLATION_VERSION; sessionId: string; requestId: string;
  /** not_submitted concerns THIS stop request, never the original message admission. */
  error: Readonly<{ code: QaCancellationErrorCode; ack: "not_submitted" | "unknown" }>;
}>;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
/** Strict original scope. Pending/not_observed never certifies a stop or non-admission. */
export function isQaCancellationReceipt(value: unknown, scope: Readonly<{ sessionId: string; requestId: string }>): value is QaCancellationReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 5 && ["version", "sessionId", "requestId", "state", "ack"].every(k => Object.hasOwn(v,k))
    && v.version === QA_CANCELLATION_VERSION && uuid(v.sessionId) && uuid(v.requestId)
    && v.sessionId === scope.sessionId && v.requestId === scope.requestId
    && (QA_CANCELLATION_STATES as readonly unknown[]).includes(v.state)
    && v.ack === (v.state === "cancelled" || v.state === "terminal" ? "observed" : "unknown");
}
