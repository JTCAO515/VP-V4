# Tool Gateway v1

**Owner:** Tool Gateway (#88 / V4-03)
**Status:** deterministic baseline with VPJ-80 durable action-claim extension
**Consumers:** future TurnCoordinator, Product Tool adapters, ContextAssembler's model-safe Tool candidate boundary, and trace recorder
**Non-consumers:** model providers, HTTP routes, UI components, database clients, Trip writers, and arbitrary external payloads

## Objective and boundary

`ToolCallIntent` is a structured request from a model or UI, not authority to execute. `ToolRegistry` owns the registered server allowlist. `executeToolIntent` is the sole execution seam: it validates a resolved definition, actor policy, input, exact approval when required, idempotency and deadline before invoking the supplied executor.

The module has no provider implementation, route, retry loop, direct Trip write, credential, or external account. VPJ-80 adds an injected service-only PostgreSQL action store for an existing lease; no worker or tool is activated. `trip.*` definitions are rejected. `P_proposal_producing` registration is also rejected until its typed Proposal capability is frozen: an arbitrary injected executor cannot be treated as a Trip-write boundary. This gateway contains no executable Proposal or Trip adapter.

## Definition and actor contract

A `ToolDefinition` has a namespaced `id`, safe bounded version/feature-flag strings, risk class, task/data/license allowlists, schema guards, approval and idempotency requirements, deadline, retry declaration, and a model-output code-point budget. Finite bounds are restricted to 1–60,000 ms and 1–4,096 serialized-payload code points. The registry rejects duplicate IDs, invalid bounds, direct Trip IDs, executable Proposal tools, and `read_only_once` retry declarations on non-read-only tools.

A `ToolCallIntent` declares the active data classes for this invocation; they must be a subset of both the definition allowlist and the actor's data classes. A `ToolActor` supplies its immutable ID, task profile, data classes, license scopes, enabled feature flags, and upstream-issued approvals. An approval binds the intent digest to actor, call ID, source, task profile, exact data-class set and expiry. The ID is used only for upstream authorization and idempotency key derivation; it is never copied into the receipt.

The effective sequence is:

1. resolve the static allowlist;
2. validate task profile and data class policy;
3. validate input schema and compute a canonical SHA-256 intent digest;
4. require a non-expired exact actor-bound approval for an external side effect;
5. require a durable action store for a tool marked `idempotency: required`; claim a lease-bound key before invoking the executor;
6. validate and bound JSON-safe output; project it inside an escaped `<untrusted-tool-output>` boundary and persist the receipt digest;
7. return only a receipt with tool/version/call/digest/timestamps/policy fingerprint and the model-safe projection.

No ToolCallIntent is the no-tool/clarification path: no executor is supplied or called. Unknown, out-of-profile, data/license-invalid, schema-invalid, feature-disabled, malformed-call, or unapproved calls fail before execution. Callers translate those typed errors into their own bounded unavailable or clarification outcome; the gateway never selects another tool or retries a policy/safety failure.

## Idempotency, deadline, output and errors

`approvalDigestForToolIntent` canonicalizes object keys before SHA-256 hashing, so equivalent JSON object ordering cannot alter approval or replay identity. Reusing a call ID with the same digest is rejected as replay; reusing it with a different digest is also rejected.

The old in-process claim Map is removed. A required action without a durable store fails before execution. A claimed action whose executor or receipt acknowledgement fails remains `unknown`; an automatic retry is denied until reconciliation. The PostgreSQL store binds a claim to current owner, ServiceTask, assistant message/goal version, explicit Memory revisions and Turn lease, and caps actions at four per ServiceTask. It stores hashes and status, not raw tool output. The store starts with no scheduler or registered production tools. External side effects and Proposal tools remain disabled; the declared retry policy is deliberately not an executor loop.

Tool output must validate, serialize as finite acyclic JSON, and fit `maxModelOutputTokens` measured as code points of the complete escaped projection including wrapper and safe bounded tool/version attributes. Receipt output never exposes the raw executor object.

`ToolGatewayError.code` is one of `TOOL_POLICY_REJECTED`, `TOOL_REPLAY_REJECTED`, `TOOL_DEADLINE_EXCEEDED`, or `TOOL_OUTPUT_REJECTED`. The gateway does not map errors to HTTP, provider retry, UI copy, or a Trip outcome.

## Rollback and verification

The VPJ-80 extension can be disabled by leaving the planning producer unwired, reverting the TypeScript seam, and retaining the append-only receipt table for audit until reviewed forward cleanup. It has no provider or external request. Contract tests in `tests/contract/tools/` cover fail-closed replay and output behavior; SQL integration must cover lease, owner, cancellation, revocation, stale basis and unknown costs before activation. The earlier #88 command records remain in `artifacts/V4-03/`.
