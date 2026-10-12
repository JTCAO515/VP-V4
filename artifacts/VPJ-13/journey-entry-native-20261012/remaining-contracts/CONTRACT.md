# Remaining VPJ-13 source contract after PR678

Base: normal FF to daa7bae44a660381fb3295d0d2afc327ea98d3ba. The merged six-source PR678 and its nineteen green checks are not rerun. This follow-up remains the same Native sole-owner task. No new helper PR, shared delta, database write, provider execution or role is introduced.

## 1. Idea, party and service intent

Actual source map:

- `Features/Ask/NativeAssistantConversationView.swift`: the original literal text is retained in the existing owner/current-policy conversation and parent message. `goal_start` records a goal but does not execute a result; the existing follow-up admission retains its goal and ServiceTask authority.
- `Features/Ask/NativeTravelIntakeModels.swift`: `stay-area-intake/1` already has explicit nullable city, comparisonTarget, durationDays, partySize (1..10), interests, pace, lodgingBudget, dates and mobilityConstraints. `NativeTravelIntakeBasis.decode` pins conversation, goal, goalVersion, message/sequence, intakeRevision, contextDigest and Memory revisions. `readyForProvider:false` is mandatory: a read or displayed field does not establish model consumption.
- `NativeSession.travelIntakeRequest` and `lib/server/turn/native-travel-intake-http.ts`: existing GET /api/chat/native/v5/travel-intake authenticates native session/current text consent and returns the original source or closed unavailable reason. A private bounded read is allowed; no new method or RPC is required to display those existing fields.
- `Features/TravelDirections/NativeTravelDirectionsContent.swift` and `lib/server/planning/directions/contract.ts`: travel-directions-intake/1 is a closed eight-field schema, with no partySize or serviceIntent. `domainInput` does not consume literal idea text. `domain.ts` returns fixed depth/breadth choices; changing titles locally cannot establish personalized outcomes.
- Directions `protocol.ts`/`http.ts` and applied migration 20261010030000 retain original write/read CAS and source matching. Mutating the v1 shape in place would break closed native/TS decoders, canonical digests and retained export inventories.

Actual private consumer increment: the compact directions page now reads the original travel intake, displays existing party/date/city only for an exact current conversation/goal/version/parent within a request-start 20s lease, and clears on hide, scope change or replacement. It does not auto-copy the fields to the directions request, label them consumed by a model, classify service intent from prose, or invent missing values. No additional question is asked for party size already displayed. Unavailable source is omitted; the original directions request stays usable.

Minimum backend/source delta for the original planning contract owner (Main must assign or live-confirm owner): retain the exact literal goal/message as the sole current-input source; expose a reviewed versioned projection from the existing travel-intake source with its revision/digest and null unknowns, preserving original purpose/recipient gates and rechecking before publication. Carry the existing party field once, without a second preference store. No service-intent authority was found anywhere beyond the AC wording: determine the original supported explicit service vocabulary before adding a field. Do not relabel comparisonTarget or infer service consent from text. If semantic ambiguity changes the result, return at most one explicit optional clarification alongside an actually usable existing result. This Native task cannot manufacture the grounded planner/source consumer, semantic service contract or publication source receipt.

Affected canonical seams: native-travel-intake-http.ts; directions/{contract,protocol,domain,source-match,http}.ts; NativeTravelDirectionsContent/Wire/IntakeStore; the original directions SQL producer and Turn retained export inventory. These are shared-source candidates only, not leased writes in this task. Existing v1 replay/export/erase must continue; a source contract change needs original owner and Main exact delta review.

## 2. Typed authoritative last decision

Actual source map:

- `NativeFiveResultContent.decision` already decodes decision/1 with typed state pending/chosen, chosenOptionID and exact comparison reference. `NativeFiveResultDetail` displays the recorded choice after the existing exact ID/revision read; it does not invent a decision for pending.
- `native-result-v2-http.ts` and `read_result_artifact_v2` validate current owner/native session and exact source. `NativeResultSource` pins goal/version, Task/Turn, parent/sequence and Trip/version; currentness is separate from historical readability.
- Applied `20261003110000_vpj79_five_result_lifecycle.sql` owns `choose_result_decision_v2`: exact revision/operation idempotency, actual option membership, current source and atomic immutable revision. The chosen field and direction selected/save receipts are existing decision evidence, not missing persistence.
- Discovery currently supports taskId or tripId through `read_task_result_reference_v2` / `read_trip_result_reference_v2`. The selected result pointer can refer to an older revision and must be reread. Goal-index DTOs carry goal/link metadata, not a canonical latest-decision pointer.

The gap is therefore goal-scoped *discovery and ordering*, not another decision table/decoder. Current private entry can open a selected artifact, and the original typed consumer can show its recorded choice. That is not proof of the latest decision across the current goal; no local timestamp sort or global-latest fallback is permitted.

Minimum delta for the original artifact/current-source owner (Main live-confirms): produce a bounded canonical current-goal discovery/reference from existing goal/task/result/choice source records. Bind current goal version and parent/input sequence; qualify owner, current consent, Trip/deletion, Memory versions and exact Task generation before selecting and immediately on re-open. A pending, superseded, withdrawn, unknown or absent source gives an explicit unknown state. Preserve a readable historical receipt separately; it cannot become the current next action. Reuse existing result read and typed decision content. An actual discovery contract must be supplied by that owner before Native wires a return snapshot; this task names no fictional live RPC or route.

## 3. Consented product outcome observation

Actual source map:

- first_value exists only in 20260917140000 research-intake application status/event transitions. It is a research enrollment outcome, not task/result telemetry and must not be invoked here.
- docs/contracts/launch-14-content-free-observability.md and lib/server/observability/launch-14.ts are explicitly in-memory preparation with no exporter, route, persistence, identity lookup or runtime sink. Their stage/outcome counters do not authorize product first_value/adoption events.
- launch-05-message-output-retention.md restricts generic telemetry to content-free receipts and excludes caller IDs, locale, content and content-derived digests. Its old retention preparation is not current analytics consent.
- Current text/planning consent authorizes its stated processing purpose, not an unlisted analytics purpose. AssistantEvents and result_events are operational delivery/invalidation/outbox authorities, not product observation consent. No active product event consent schema/readback, sink, dedup reducer, activation definition or original telemetry export/delete registration was found.

Minimum original observability/privacy contract delta for Main assignment: identify a real accepted product observation purpose and consent version first; use an existing authorized retention/lifecycle registry rather than an independent ledger. Do not reinterpret research consent, content-processing consent or result outbox rows. Establish a closed event union, source qualification, idempotency and withdrawal/deletion/export behavior before native emits any event. Unknown activation semantics (including prior Q38 undecided scope) stays undefined; first_value must not imply activated or outcome completion.

Executable gate expected of the eventual source owner: disabled/absent/wrong-purpose/withdrawn consent rejects before enqueue or persist; foreign/stale/erased/TTL-expired artifact or Task generation rejects; first_value needs an actually rendered readable usable result; upload/OCR/goal recording/generating are ineligible; adopt/save needs the original action receipt; decline is an explicit optional closed reason, not transport failure; partial/blocked/technical_failure use the admitted execution’s actual terminal outcome. No raw idea/material/secret, reason text, user IDs, unreviewed content hashes or provider payload in generic logs. Counts must be N/D with eligible observed attempts/results/decisions as the named denominator; duplicate-question rate requires audited source-field/clarification provenance, not matching text or guessed zeroes.

No Native event emitter is enabled in this follow-up. The closed sink and consent/lifecycle input are absent, so emitting to an invented API or using test events would be false completion. Native will integrate the actual supplied consumer once Main assigns and accepts that backend contract.

## Validation and retained data

New private known-requirements read introduces transient display only. All retained data remains with the original travel-intake/conversation/Trip/result/Memory source inventories and their original export/delete/restore handlers. No copied preferences, transcript, telemetry, raw material, default logging or new persistence is added. Request generation, current actor selection, original parent, finite monotonic lease, task cancellation and inactive clearing fence the read. Compile and changed source-identity negative cases are the affected checks; permitted HTTP integration, UI rendering and physical/VoiceOver remain UNRUN. Private display does not resolve the backend personalization or goal-last-decision discovery and observation gaps, so #203 remains OPEN.
