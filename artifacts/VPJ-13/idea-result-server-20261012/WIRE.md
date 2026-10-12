# #203 E1 idea result source and producer contract

Base daa7bae44a660381fb3295d0d2afc327ea98d3ba; isolated branch codex/vpj13-idea-result-server-20261012. Main scope adjudication: existing Shanghai / area_transport → transport_screening only. This is the existing independently consented planning purpose. It does not authorize booking, lodging recommendations, arbitrary city planning or a new serviceIntent.

## Implemented private source

`lib/server/journey-entry/idea-result/source.ts` captures a closed `journey-idea-result-source/1` only from `decodePlanningV2Read` and the existing exact `V2Lease`. `model-adapter.ts` calls the existing `runPlanningV2ModelStep`, preserving actual model effect authority, execution binding, destination journal, usage, settlement and the caller's existing attempt. Every original pre-reserve/pre-dispatch/pre-send read also compares full source bytes against the immutable capture. A settled late output retains its accounted receipt under `kind:stale` and carries no current source. No second call is made.

`result-projection.ts` validates the original factual comparison using `validatesQualifiedIntakeComparison` and checks the exact existing output receipt. The actual model selection determines which option appears first. `none` retains the original order. Factual sentences and closed comparison/1 actions=[] remain unchanged. The projection carries output/usage digests but stays readyForPublication=false. Those integrity fields do not independently prove actual dispatch, settlement or publication.

## Existing source map and exact boundaries

| Requirement | Real source / enforcement |
| --- | --- |
| owner / current native session | authenticated entry; existing work.session_id, lock_turn and planning_v2_run_basis / completed_current. Never caller owner ID authority |
| Native actor epoch | original Native process-local request epoch/current actor and cancellation; not a new invented SQL epoch column. Adapter is a worker-domain source and supplies no native-session grant |
| literal goal / delegation | planning-intake-context/2 goalText and delegation, from original same-owner admitted message/goal; byte-for-byte prompt fields |
| conversation / goal version / parent and sequence | V2Lease.source conversationId, goalId, goalVersion, messageId, messageSequence; messageId is admitted current input, original planning binding retains prior parent. No alternate parent is manufactured |
| Task generation | existing taskId + turnId and service_tasks.last_turn_id / work lease; no numeric generation is invented |
| intake / Memory | source intakeRevision, sorted memoryBasis id/revision, intakeContextDigest + planningContextDigest. Full intake is compared, not merely a claimed digest |
| Trip | existing goal.trip_terminal, optional original Trip link and result-source tripId/tripVersion qualification; no new Trip copied into this model DTO |
| planning purpose / current consent | original planningPolicyId, planningActionBasis, planning consent and text consent; independent withdrawal checks remain original SQL |
| profile / provider / budget | original execution profile snapshot + profile revision/run ID, configuration/version, provider/model/price/scope/attempt checked by original bounded worker and effect/budget RPCs |
| result publication | exact original claim action key/content digest and complete_planning_intake_comparison_v1, atomic completion proof, original publish_comparison_result_v1 and completed receipt |
| re-adoption / currentness | original result read/current-source checks plus proposal/diff/explicitconfirm; readable history does not authorize a new action. Native must re-read exact artifact/revision on reopen/adopt |

Fields unavailable in a first-party intake display cannot be minted by this adapter. No public route exists for the new projection. The original v2 admission route remains disposable-local-test only; no host, target, flag or provider is activated here.

## Consumption and honest product limits

| Input | Actual behavior in this delta | Limit |
| --- | --- | --- |
| literal idea | exact goalText enters original provider prompt; validated highlight affects option order | mocked protocol tests prove transport bytes and projection, not real-provider semantic quality |
| partySize | original explicit nullable value enters prompt once and original summary shows known count | no evidence for group suitability, room counts or pricing; no extra party question |
| dates | explicit nullable dates enter prompt unchanged | current rail observation has no date-specific timetable/availability contract; no date feasibility claim or derived days |
| unknown duration/city/service | null remains null; unsupported qualified city/target cannot form source | no guessed city/date or free-text service-consent classification |
| service | only transport_screening from the fully qualified existing planning read | comparisonTarget is never relabelled serviceIntent |
| adopted/saved | original exact artifact/action receipt only | projection/generating/settled model alone is not first_value or adopted |

No mandatory question is introduced by this supported rail-screening producer, so the current private projection has no clarification. If Native's original intake is missing city or target, the existing unavailable/waiting path remains; a future optional clarification must be a single original explicit field question, skip must retain a usable original result, and known party/date must not be asked again. It must not admit a new planning purpose through text. This package does not claim that such missing-source admission is implemented.

Unsupported service/city: close unavailable and keep the original directions result and manual selection/confirmation path usable. Do not replace it with this unpublished projection. Quota/policy/source failures similarly retain permitted existing reads without invoking a model.

## Shared candidate, not applied

`shared-candidates/manifest.json` pins full original baseline worker before, patch, after. Main now identifies W2 as current writer; this baseline candidate is superseded for integration and must be regenerated on W2 final stable after, preserving Ops gates, pause_ops/noqueuedretry/destination codes. It grants no shared lease. It replaces prompt/model-step construction with the private adapter and consumes `projectIdeaResult(...).content` before the existing content digest/action key/completion. It must NOT be applied alone: current SQL exact comparison validation rejects reordered options.

Required professional SQL allocation: proposed new private namespace `turn_private.journey_idea_result_content_v1`, no table/queue/module, accepting original fully qualified intake/observation + the actual recorded settled output, returning the existing comparison/1 with only selection order changed. It must be called from a reviewed full replacement of existing `complete_planning_intake_comparison_v1` and checked through the original completion proof. Existing v1 qualified comparison validator stays unchanged for old consumers. Before/after of original completion function is supplied as the source input; SQL owner must produce full helper/replacement/current catalog/pin/ACL and append-only lifecycle delta after Main allocation. No SQL slot or migration write is granted here.

The SQL gate must derive highlight from the exact collector output selected by original scope/attempt/outputDigest/usageDigest, not a TS-supplied highlight. Preserve owner/current-session/consent/goal/parent/task generation/Trip terminal/Memory/source/current profile checks, original atomic terminal and capacity/grant settlement, no externally writable helper and no extra publication authority. Freeze actual provider payload provenance for the literal/intake bytes as well as output selection. Preserve transaction/current-source checks through final publication. Unknown/missing output gives unavailable, never personalized order.

Retention/lifecycle: no new persistent state. Existing provider destination request/payload digests, model output, intake/bindings, completion proofs/receipts, result bodies and task/conversation records remain in original registered export/delete/restore inventories. New helper must not retain raw idea or copied preferences. New transformed comparison content remains an ordinary original result body, with no added field or sink. SQL owner must prove retained old v1 compatibility and ordered content digest integrity across deletion/export/restore. No analytics/event emitter or event consent is added.

Native consumption now: reuse original comparison/1 renderer for a genuinely published artifact only. No adapter SOURCE or preparation should be shown as a result or used as a client RPC. Stable private exports are available for backend integration; a public source-qualified publication/read receipt and original admission lease are still absent, so runtime Native consumer integration remains UNRUN.

## Verification scope

Focused mock source/protocol/projection tests: literal/intake byte consumption, known party/date and null duration; foreign owner/task/turn/artifact/policy; conversation/goal/current input/version/sequence/revision; unknown fields/unsupported city/target; mutated source at same digest; immutable capture; selected/none order with exact factual prose; output integrity; no actions; expired observation; disabled/stale/denied zero calls; settled late response and aborted current-source rejection. Original v1 comparison and worker/output contracts reused as regressions. No real provider, SQL fixture, target, device, public read route or new native admission test is run. #203 remains OPEN.

## Source provenance audit

Original record_planning_intake_provider_destination_v1 (20261003150000 lines 296–301) already reconstructs the exact canonical request/body/requestDigest/payloadDigest, then checks parsed user input exactly against qualified goalText, delegation, full intake, completed observation and the closed unknown array. The collector origin stores request/payload digests and binding, not raw payload text. Do not introduce raw payload retention. read_planning_intake_model_output_v1 qualifies the original settled collector output; valid_current_v2_completion_proof binds original lease/model attempt/origin/output/budget/current profile and content digest in the transaction. The completion trigger and valid_current_v2_publication_proof reuse that proof. Professional SQL must preserve the entire chain and derive permitted selection order through it; accepting a TS expected tuple alone is not authority. All eight original full-function source snapshots and hashes are in sql-source-pins.json. They are baseline source, not live installed-function assertions or W2 releases.
