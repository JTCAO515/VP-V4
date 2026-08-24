# AI-44 Failure Taxonomy

Status: accepted fixture-only contract for Issue #48. The closed set contains 21 product/domain failure codes; provider raw errors are never a UI contract.

## Invariants

- A caller receives only a registered code, its HTTP status, SSE terminal shape, retryability, provider-fallback permission, and metric label.
- `SAFETY_BLOCKED` and `DATA_POLICY_BLOCKED` are terminal `unavailable` outcomes: neither retry nor provider fallback is allowed.
- Unknown codes are invalid at the type boundary. Future additions require this document, five locale snapshots, and consumer tests to change together.
- HTTP/SSE transport implements this mapping later; AI-44 does not add a route or expose a provider error.

## Mapping

| Code group | Codes | HTTP / SSE |
| --- | --- | --- |
| Identity and input | `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `INVALID_INPUT`, `UNSUPPORTED_MEDIA`, `AMBIGUOUS_SCOPE` | 401/403/429/400/415/400; failure or unavailable |
| Evidence and policy | `NO_ELIGIBLE_EVIDENCE`, `DATA_POLICY_BLOCKED`, `DATA_EXPIRED` | 422/403/409; unavailable |
| Provider and validation | `PROVIDER_UNAVAILABLE`, `TIMEOUT_BEFORE_OUTPUT`, `TIMEOUT_AFTER_OUTPUT`, `MODEL_OUTPUT_INVALID`, `SAFETY_BLOCKED`, `BUDGET_EXHAUSTED`, `CANCELLED` | 503/504/504/502/422/429/499; unavailable, failure, or cancelled |
| Trip and projection | `STALE_TRIP_VERSION`, `PROPOSAL_NOT_CONFIRMABLE`, `IDEMPOTENCY_KEY_REUSE`, `PROJECTION_LAG`, `INTERNAL_ERROR` | 409/409/409/503/500; conflict, unavailable, or failure |

The authoritative machine-readable mapping is `lib/server/contracts/errors/index.ts`; `lib/i18n.ts` supplies a non-empty zh/en/es/ru/ar message for every code. Runtime maturity remains fixture-only. Rollback is a revert of this contract; callers must not fall back to raw provider strings.
