export const FAILURE_CODES = [
  "UNAUTHENTICATED", "FORBIDDEN", "RATE_LIMITED",
  "INVALID_INPUT", "UNSUPPORTED_MEDIA", "AMBIGUOUS_SCOPE",
  "NO_ELIGIBLE_EVIDENCE", "DATA_POLICY_BLOCKED", "DATA_EXPIRED",
  "PROVIDER_UNAVAILABLE", "TIMEOUT_BEFORE_OUTPUT", "TIMEOUT_AFTER_OUTPUT",
  "MODEL_OUTPUT_INVALID", "SAFETY_BLOCKED", "BUDGET_EXHAUSTED", "CANCELLED",
  "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE", "IDEMPOTENCY_KEY_REUSE",
  "PROJECTION_LAG", "INTERNAL_ERROR",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];
export type FailureSseEvent = "failure" | "unavailable" | "cancelled" | "conflict";

export type FailureSpec = Readonly<{
  httpStatus: 400 | 401 | 403 | 409 | 415 | 422 | 429 | 499 | 500 | 502 | 503 | 504;
  sseEvent: FailureSseEvent;
  retryable: boolean;
  providerFallbackAllowed: boolean;
  metricLabel: string;
}>;

const spec = (httpStatus: FailureSpec["httpStatus"], sseEvent: FailureSseEvent, retryable: boolean, providerFallbackAllowed: boolean, metricLabel: string): FailureSpec =>
  ({ httpStatus, sseEvent, retryable, providerFallbackAllowed, metricLabel });

export const FAILURE_TAXONOMY: Readonly<Record<FailureCode, FailureSpec>> = {
  UNAUTHENTICATED: spec(401, "failure", false, false, "unauthenticated"),
  FORBIDDEN: spec(403, "failure", false, false, "forbidden"),
  RATE_LIMITED: spec(429, "unavailable", true, false, "rate_limited"),
  INVALID_INPUT: spec(400, "failure", false, false, "invalid_input"),
  UNSUPPORTED_MEDIA: spec(415, "failure", false, false, "unsupported_media"),
  AMBIGUOUS_SCOPE: spec(400, "unavailable", false, false, "ambiguous_scope"),
  NO_ELIGIBLE_EVIDENCE: spec(422, "unavailable", false, false, "no_eligible_evidence"),
  DATA_POLICY_BLOCKED: spec(403, "unavailable", false, false, "data_policy_blocked"),
  DATA_EXPIRED: spec(409, "unavailable", true, false, "data_expired"),
  PROVIDER_UNAVAILABLE: spec(503, "unavailable", true, true, "provider_unavailable"),
  TIMEOUT_BEFORE_OUTPUT: spec(504, "unavailable", true, true, "timeout_before_output"),
  TIMEOUT_AFTER_OUTPUT: spec(504, "failure", false, false, "timeout_after_output"),
  MODEL_OUTPUT_INVALID: spec(502, "failure", true, true, "model_output_invalid"),
  SAFETY_BLOCKED: spec(422, "unavailable", false, false, "safety_blocked"),
  BUDGET_EXHAUSTED: spec(429, "unavailable", true, false, "budget_exhausted"),
  CANCELLED: spec(499, "cancelled", false, false, "cancelled"),
  STALE_TRIP_VERSION: spec(409, "conflict", true, false, "stale_trip_version"),
  PROPOSAL_NOT_CONFIRMABLE: spec(409, "conflict", false, false, "proposal_not_confirmable"),
  IDEMPOTENCY_KEY_REUSE: spec(409, "conflict", false, false, "idempotency_key_reuse"),
  PROJECTION_LAG: spec(503, "unavailable", true, false, "projection_lag"),
  INTERNAL_ERROR: spec(500, "failure", true, false, "internal_error"),
};

export function isFailureCode(value: unknown): value is FailureCode {
  return typeof value === "string" && (FAILURE_CODES as readonly string[]).includes(value);
}

export function getFailureSpec(code: FailureCode): FailureSpec {
  return FAILURE_TAXONOMY[code];
}
