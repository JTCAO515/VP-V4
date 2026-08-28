# Fixture model routing and observability contract

## Status and boundary

AI-17 is a TypeScript-only, fixture-only extension of AI-16. It selects an already frozen profile record and projects allowlisted attempt metadata; it does not invoke a provider, make an HTTP request, read an environment variable or credential, choose a real region, persist data, or read/write Trip, Fact, permission, tool, or external state. It is not a production routing, price, availability, or provider-capability claim.

## Closed route policy

`resolveFixtureRoute()` accepts only its exact seven-field synthetic C0 fixture request. It evaluates controls in this order: malformed input (`INVALID_INPUT`), data class/region/policy (`DATA_POLICY_BLOCKED`), safety (`SAFETY_BLOCKED`), then modality/schema/profile availability (`PROVIDER_UNAVAILABLE`). Unknown fields, including any content field, are malformed. A denial is final and precedes every profile choice.

| Task and shape | Result | Fallback / note |
| --- | --- | --- |
| C0, `fixture_only`, text, ordinary, no schema | DeepSeek Flash baseline | Thinking remains disabled; fixture profile only |
| C0, `fixture_only`, text, strict known/unknown | Qwen 3.7 strict baseline | Closed known/unknown schema; fixture profile only |
| Vision, Pro, schema mismatch, or unsupported route | `PROVIDER_UNAVAILABLE` | Vision remains shadow-only and never routes |
| C1–C4, unapproved region, or policy block | `DATA_POLICY_BLOCKED` | Never falls through to another provider |
| Safety block | `SAFETY_BLOCKED` | Never falls through to another provider |

`canFallback()` accepts only its exact `code`/`emittedOutput` shape and returns true only for a pre-output `PROVIDER_UNAVAILABLE`, `TIMEOUT_BEFORE_OUTPUT`, or `MODEL_OUTPUT_INVALID`. It always returns false after output and for policy, safety, authentication, authorization, and cancellation outcomes; unknown fields, including any content field, return false. No fallback call is performed by this fixture module.

`FixtureCircuitBreaker` counts only those same pre-output outcomes per profile. A positive safe-integer threshold opens the profile until its positive safe-integer cooldown elapses. Invalid clocks/configuration, including an overflowing cooldown deadline, throw before mutating state. The breaker has no network consumer in R1/R2; a future transport must explicitly consume its closed state and undergo its own acceptance gate.

## Attempt trace and cost projection

`buildModelAttemptTrace()` accepts exactly these non-content inputs: `attemptId`, route decision, outcome code, input/output token counters, latency, price-version ID, and integer microunit prices. It derives provider, requested/returned model, and observed deployment from `MODEL_PROFILES`; it never accepts them from caller-controlled values.

The returned projection has this allowlist: attempt ID, profile/provider, requested and returned model, observed deployment, route lane, outcome code, input/output token counters, latency, price version, integer `costMicros`, `recordInputs: false`, and `recordOutputs: false`. An unavailable route is recorded with provider/profile/model/deployment `none`, its same failure code, and zero usage/cost. There is no prompt, input, output, reasoning, media, message, raw response, user ID, or region field.

Cost is `inputTokens * inputMicrosPerToken + outputTokens * outputMicrosPerToken`; all operands and the result must be non-negative safe integers. Prices are synthetic versioned snapshots, not live provider billing.

## RL-07 and evidence

RL-07 fixture evidence is **0/6 observed trace-content violations**: `prompt`, `input`, `output`, `reasoning`, `media`, and `messages` are each rejected by deterministic trace, route, and fallback-boundary fixtures. Runtime invariant: only the explicit allowlist can reach a trace, while both content-recording booleans are fixed false.

## Rollback and deferred checks

Rollback removes `lib/server/model-gateway/route/`, `lib/server/observability/`, their tests, this contract, and AI-17 evidence. No provider route, secret, account, flag, persistence, migration, or external configuration exists to revert.

Live provider routing, real pricing/usage, region/DPA, provider failures, streamed/after-output behavior, account configuration, persistence, deployment, and browser checks remain unrun and require separately authorized work.
