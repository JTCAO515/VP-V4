# PolicyReceipt v1

Status: fixture-only AI-22/#24 policy and licence boundary. This is an engineering control contract, not legal advice, a licence grant, a provider integration, a registry deployment, or evidence that any external data flow is enabled.

## Decision input

`createPolicyRegistry` accepts one complete fixture policy set and holds parsed records in a private in-memory registry view. Revocation lives in one module-wide in-process authority shared by every view. `evaluatePolicyDecision` receives only a trusted registry, the explicit clock, opaque request ID, registered policy ID, action, purpose, field, and region. A caller cannot supply or refresh a policy object during a decision. It rejects unknown keys, malformed values, duplicate or empty grants, invalid timestamps, and impossible policy ranges before it creates a receipt.

The closed action union is `display`, `cache`, `persist`, `llm_inference`, `embed`, `translate`, `tts`, `model_training`, `backfill`, and `redistribute`. Every valid decision returns a frozen `PolicyReceiptV1`, whether allowed or denied. A malformed caller object is a programming error and produces no decision.

## Fail-closed rules

- A policy is current only from `effectiveAt` through (but excluding) `expiresAt`, `termsRecheckAt`, and an optional `trialEndsAt`.
- Every allowed combination is one atomic `{ field, region, action, purpose }` grant. The registry never forms a cartesian product of independent lists.
- `revokePolicy` owns shared in-process revocation state. After it succeeds, every existing or newly rebuilt registry view terminally denies the same policy ID; callers cannot restore it with an older policy object.
- This first boundary accepts only reviewed `c0_public` fixture policy. C1 needs an authenticated owner-scope contract; C2/C3 need a dedicated accepted region/purpose/retention agreement; C4 is always denied. The module has none of those later contracts, so it returns `DATA_POLICY_BLOCKED`.
- `persist` also requires `retention: durable`; `cache` rejects `retention: none`.
- `embed`, `translate`, `tts`, and `backfill` require an explicit derivative grant. Backfill also requires a combination grant; redistribution requires a redistribution grant; training requires a distinct training grant.
- `shareAlike`, derivative, combination, redistribution, and retention obligations are copied to every receipt. A later consumer must enforce the obligations before rendering or transferring data; it cannot infer or replace them.

Denied receipts carry terminal code `DATA_POLICY_BLOCKED` with a closed reason. The boundary has no retry or fallback path.

## Revocation cascade

`revokePolicy` accepts only a non-future terms withdrawal or policy revocation for a registered policy and returns a frozen deny receipt plus this deterministic invalidation list. It makes the registry deny that policy ID immediately:

`cache`, `rag`, `explore`, `seo`, `new_proposal`.

It does not delete a cache, invalidate an index, withdraw SEO content, or block a route. Those durable consumer adapters do not yet exist; they must accept this plan and supply their own execution and deletion evidence before any real registry or external action is enabled.

## RL-06 evidence

The named RL-06 fixture has three valid policy decisions: an unknown registered policy, an expired term, and a trial-ended term. All produce `DATA_POLICY_BLOCKED` before use. Companion fixtures prove injected request keys, forged registries and duplicate grants fail validation; a C4 policy cannot become allowed by placing `display` in its grant; cross-grant combinations are denied; and the exact pre-revocation request is denied after a registry revocation.

## Boundaries and rollback

There is no database migration, licence feed, provider call, browser route, cache, RAG index, model request, persistence, deletion, secret, account, region choice, or production release in this issue. The in-memory revocation index is intentionally lost on process restart, so a durable registry must replace it before any runtime authorization. Roll back by reverting the module, contract, fixtures, and handoff only.
