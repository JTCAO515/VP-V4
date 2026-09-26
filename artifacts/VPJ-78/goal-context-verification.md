# VPJ-78 goal context slice — 2026-09-27

Related to #559. Base: `7b182943a087fc51a8b3f95ffac2b099c2de3f19` (after #567). The first #568 Conversation slice is already on main; this record covers only the second, read-only context-manifest increment.

## Implemented contract

`POST /api/chat/native/v5/context` accepts a current goal-scoped message and up to three explicitly selected Memory IDs. It composes a bounded `assistant-goal-context/1` manifest from existing `ContextPlan`/assembler rules. The route rechecks actor/mobile session, v5 text policy/consent, goal scope and selected Memory revision/receipt/consent before returning. A revoked or changed source cannot be presented as current. Profile, Trip, result artifact, evidence and ServiceTask basis are omitted with named reasons. The response returns no raw selected Memory summary and sets `readyForProvider: false`; no model or queue is invoked. A separate LOCAL/STAGING/PRODUCTION flag defaults the new endpoint closed.

## Verification

| Check | Result | What it proves |
| --- | --- | --- |
| Focused goal context contract tests | PASS 4/4 | Exact goal/Memory source versions, selected-only relevance, bounded constraints and stale scope failure |
| Focused context HTTP security tests | PASS 6/6 | Default-closed endpoint, second source read, withdrawal/correction, replaced session and aborted late response |
| `node tests/integration/turn/run-native-http.mjs` | PASS 3/3 | Disposable local Supabase/Auth/HTTP: actual persisted goal + explicit Memory RPC readback, revision change, retrieval-consent revocation, cross-owner denial, no synthetic model call for manifest |

The local provider in this runner is synthetic. The context test itself observes zero model calls after goal/context requests. Actual external provider consumption, Staging and Production remain **UNRUN**. This slice does not claim that Memory changed an answer, nor does it close #559.

## Risk and rollback

Selected Memory summaries are read only inside the server request; only a bounded manifest leaves the route. The current preference relevance rule is lexical and may conservatively omit a semantically relevant preference. No consumer may treat the manifest as provider-ready; future dispatch needs a separate recipient/version review. Disable the new context flag or revert its route while retaining #568's Conversation data; there is no migration to reverse. No #560 native/result file was modified.
