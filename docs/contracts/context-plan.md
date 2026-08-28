# ContextPlan and ContextAssembler v1

**Owner:** Context Engineering (#85 / V4-02)  
**Status:** frozen deterministic contract baseline  
**Consumers:** future TurnCoordinator, Constraint Engine, Knowledge retrieval, Tool Gateway, and trace recorder  
**Non-consumers:** provider SDKs, database clients, HTTP routes, UI components, and raw external payloads

## Objective and boundary

`ContextPlan` chooses the allowed, required, ordered, and budgeted sources for one bounded task/risk pair. `ContextAssembler` accepts only caller-projected candidate text and returns ordered model context with a privacy-safe provenance manifest. It is not a retriever, auth resolver, persistence layer, model gateway, Tool executor, or Trip writer.

## Input contract

`createContextPlan({ taskProfile, riskClass })` accepts the closed `TaskProfileId` union (`trip_planning`, `trip_update`, `information_lookup`, `recovery`) and closed `RiskClass` union (`low`, `elevated`, `high`). Unknown values fail.

`assembleContext({ plan, actorId, candidates })` requires a non-empty actor ID and `ContextCandidate` projections with an ID, source kind, nullable owner ID, eligible/draft/expired/prohibited state, source version, positive integer token count, and text. A `tool` candidate must additionally declare `payloadKind: model_safe_projection` before it can be included.

## Stable source order and fixed boundary

The complete stable order is:

1. `system`
2. `policy`
3. `constraints`
4. `trip`
5. `proposal`
6. `memory`
7. `evidence`
8. `tool`
9. `thread`
10. `user_message`

`system`, `policy`, `constraints`, and `user_message` are required. If filtering or budgeting removes one, assembly fails rather than producing a context missing a hard boundary. `constraints` is intentionally placed before compactable thread state and the current user message has the final stable section.

The v1 policy budgets are deterministic: system 120, policy 120, constraints 200, trip 180, proposal 120, memory 160, evidence 160, tool 100, thread 100, and user message 160 tokens. High-risk policies disallow tools and set their tool-definition maximum to zero. Raw user artifacts are never allowed.

## Eligibility and injection safety

Candidates are excluded before text rendering when any of the following is true:

- state is not `eligible`;
- non-null owner ID differs from the requesting actor;
- source is not allowed by the task/risk policy;
- source is `user_artifact`;
- Tool payload is not an explicit model-safe projection;
- source budget or source-item maximum has been exhausted.

Eligible Tool projections are rendered only inside `<untrusted-data source="tool" ref="…">` delimiters. The assembler does not parse, adopt, execute, or elevate text inside that boundary. Callers must never pass raw provider payloads, uploaded artifacts, HTML, arbitrary URLs, credentials, or unredacted PII as candidate text.

## Output and trace contract

`ContextAssembly` contains rendered sections and a `ContextManifest`. The manifest includes context and compaction versions, source references, source versions, omission reasons, per-section and total token counts, and SHA-256 text fingerprints. It deliberately excludes text, owner IDs, actor IDs, credentials, and raw payloads. A trace recorder may persist the manifest subject to its own retention policy; it must not substitute the manifest for authoritative domain state.

## Errors, rollback, and verification

Unknown profiles/risk classes, malformed candidates, missing actor ID, and absent required sources throw typed `ContextPlanError` or `ContextAssemblyError`. Callers must publish their own bounded unavailable/clarification outcome; this module never weakens authorization or falls back to another actor's context.

Rollback is a revert of the #85 merge. No database, schema, cache, provider configuration, or runtime data needs rollback. Contract checks are in `tests/contract/context/`; synthetic full-history/compaction and zero-leak cases are in `evals/context/` with their privacy statement in `artifacts/V4-02/`.
