# Versioned integration seams for the personal assistant

This is the implementation contract under [ADR-0027](../../adr/ADR-0027-personal-journey-assistant.md), not an already available API. Each producer/consumer PR freezes concrete wire/SQL schemas and fixtures before activation. Keep the current native v1/v2/text/grounded and Trip versions compatible; do not mutate a v1 meaning in place.

## Responsibilities and authority

| Object | Responsibility | Must not become |
| --- | --- | --- |
| Conversation | Stable owner-scoped interaction stream; messages reference tasks and artifacts | An automatic new billable task per message or a transcript used as the only truth |
| Journey goal | Minimal intent, scope, progress and optional Trip link; references ServiceTasks | A duplicate Trip, new scheduler or same-named ServiceCase |
| ServiceTask / Turn / Attempt | Bounded deliverable / execution unit / actual cost-bearing attempt | Three interchangeable success or charging states |
| Result artifact | Versioned typed generated deliverable and basis references | Confirmed Trip data or copied unversioned UserArtifact |
| Profile / Memory / working context | Existing authoritative preference field / other explicit persistent fact / temporary input | A second hidden preference database |
| Trip / Proposal / Patch | Confirmed facts / immutable candidate revision / deterministic transaction | An LLM-writable document |
| Evidence / tool observation | Qualified source, observation, applicability and freshness | Model memory or implicit authority to publish |

Use existing tables where their semantics match. Minimal new records/columns belong to existing domain ownership and append-only migrations; avoid premature general graph/platform schemas. Account/Trip deletion and export include new conversation, goal, artifact, index and checkpoint references.

## Conversation and task association (VPJ-78)

Define a new assistant envelope with server-derived owner/session and stable conversation ID, message ID, client idempotency key, optional goal/task/Trip/selected-artifact references, and explicit supported input relationship. Preserve source revisions and a monotonic event cursor. Names and wire version are fixed in the implementation PR; no live version is assumed here.

Server validates ownership, membership, current policy/recipient consent and relationship. A follow-up, amendment, separate question and cancellation are distinct operations. Classification uncertainty may require one clarification; it must not silently charge or assign the wrong goal. Existing four-Turn/clarification-only limits stay frozen for old modes, while the new mode gains bounded continuation and versioned scope changes. Never reopen a terminal Turn; append a related execution for amendments.

Multiple task projections can be visible while the composer remains active. Concurrency is bounded by existing cost/actor controls. Maintain a single authority for message ordering and task status; iOS cached state is a projection. Session replacement/logout invalidates reads and late responses.

## Context and memory (VPJ-11 with VPJ-78/80)

Each dispatch reads the latest permitted goal/task basis, selected Trip revision, relevant explicit Profile/Memory revisions, selected result, required evidence and a bounded conversation summary. Reuse ContextPlan/assembler; version task-specific source permissions and budget policy instead of bypassing filtering. Existing fixed budgets are starting implementation values, not a suitable universal plan-size promise.

A context manifest records selected source IDs/versions, omissions and policy; logs contain no raw sensitive text or hidden reasoning. Summaries are derived caches and cannot override their sources. Recheck consent, relevance, expiry and revisions immediately before external dispatch and before publishing a usable result. Corrected or forgotten memory invalidates queued/checkpointed projections; never resurrect it via compaction or retry.

Provider routes remain behind the current protocol/recipient/budget contract. A stronger or different model is a versioned evaluation choice, not a global provider change. Knowledge source publication and scope qualification remain independent of model-generated planning suggestions.

## Result artifacts (VPJ-79)

Minimal planned semantics: artifact ID, owner, optional goal/task/Trip association, closed content type, immutable revision, currentness/lifecycle state, basis references (including relevant input/Trip/memory/evidence versions), validated content and allowed typed actions. Initial types: comparison, journey draft, decision brief, change proposal reference, practical result. Reuse Proposal IDs/revisions rather than duplicating a confirmation payload.

Creating/editing an artifact changes an owned draft, never a confirmed Trip. A selected route and a confirmed patch are different actions. Artifacts are readable through the same permission-checked service from native VP/Journeys/Library and supported Web surfaces. Search indexes hold derived references, with eligibility checks at query and open, and deletion/withdrawal invalidation.

Native components accept schema-versioned content and typed actions, not arbitrary model HTML, URLs or code. Validate location identity and media rights/provenance. Unsupported card types fall back to safe readable content; old clients must not hide fields and then confirm a different meaning. Production imagery is not generated concept art masquerading as a real place.

## Bounded execution (VPJ-80)

Extend the existing durable lease runner and attempt budget. State progression distinguishes accepted/queued/running/waiting-input/waiting-confirmation/paused/completed/failed/cancelled; concrete unions and transitions are versioned before migration. Business outcome, execution state, artifact currentness and accounting status remain separate.

Per execution step: load current authorized basis → select next allowed action → execute with deadline and cost budget → persist validated observation/checkpoint → decide finish, wait or another bounded step. Cap model/tool steps, retries, concurrency, elapsed execution and cumulative task cost. A long-lived goal is not a permanently held lease or continuous LLM loop. Persist progress before releasing a wait; resume via existing durable work infrastructure on authorized input/event.

Tool catalog initially exposes narrowly scoped evidence lookup, place/route reads, deterministic constraint evaluation, owned artifact preparation and a typed proposal-producing adapter. ToolRegistry currently rejects Trip/proposal/external-effect registration: change only a reviewed capability boundary with persistent idempotency/action receipts. The existing in-process Map is not durable replay protection. No confirm/payment/booking/email tool is introduced by this plan.

Compare alternatives using real supported data and deterministic budget/time/transfer checks. Missing opening/price/availability evidence remains unknown; an appealing early direction may still be delivered with its assumptions. Preserve unaffected choices and user-confirmed requirements during replanning. Do not use arbitrary model confidence as feasibility proof.

At-least-once execution can repeat provider calls; record each actual attempt and unknown cost. Logical task settlement, artifact publication and Trip application must be idempotent. Cancellation/revocation denies new effects, and ambiguous effects are reconciled before retry. A newer basis prevents an old worker from publishing a current actionable artifact.

## Events, rendering and proactive work

Extend existing durable event/replay semantics with task status, progress summary, artifact-ready/updated/invalidated and preference-change references. Checkpoint/status writes and their publishable events require an atomic or recoverable outbox-style boundary within current storage. SSE is delivery, never the only persistence.

Native stores maintain independent conversation, task-list and selected-artifact state. A slow task cannot freeze send/cancel/navigation; new events must not steal focus or scroll. Global current-journey context uses stable IDs and explicit scope, not raw URL text. Library uses existing tools and source records; it does not duplicate their domain logic.

Proactivity starts with accepted task outcomes and user-set follow-ups. Reuse #221 for actual delivery, deduplication, quiet hours, timezone, permission and journey freshness. Recheck current consent and revisions before dispatch. Scheduling eligibility is not proof of APNs delivery; unsupported transport stays unavailable. Recurrent fact monitoring waits for a verified source and purpose, and stops when the goal expires, is paused or cancelled.

## Compatibility and staged activation

1. Inventory concrete producers/consumers and old API semantics; add closed new schemas and negative cases.
2. Add storage/reader changes first, with forward/rollback checks, RLS and export/delete coverage. No applied migration edits or automatic conversion of old text into a new charged task.
3. Add disabled new execution/capabilities and synthetic coverage; then a bounded real target-environment chain.
4. Connect native consumers through the same APIs/events; keep Web a light same-Trip/result consumer.
5. Activate the four-tab shell after the supported path is functional. Old entry mappings and fallback retain access to new in-flight tasks/results.
6. Broaden supported tasks only after observed reliability/cost/UX results. Disable new producers for rollback; preserve confirmed data and honest read/cancel/reconciliation paths.

Interface work has a named producer, transport, persistence, native/Web consumer, deterministic validator, owner and rollback in every PR. A schema file or demo renderer alone is a preparation result.

## Commercial compatibility

Reuse catalog, official transaction verification, entitlement and usage ledgers. New subscription semantics require an explicit versioned transaction/renewal/grant model; never reinterpret the current one-transaction/720h Pass as auto-renewal. Until selected, exact price/capacity are development hypotheses and no store sale is enabled. User task capacity is separate from actual attempt cost; clarification, correction and system repair do not create accidental new purchases.

Keep commission metadata out of organic relevance scoring; disclose commercial handoff and coverage limits. A ranking regression changes commission while holding traveller/evidence inputs fixed and checks that organic relevance does not improve because of that change. Actual affiliate attribution/payment still needs its own evidence.
