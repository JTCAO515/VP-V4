# VPJ65 exact TripItemSupport / source-impact dependency

Main-approved dependency of whole207; unique proposed/reserved20261003200000. Independent support branch from main9b7; no180/190/applied Trip/359 writer-body edits, no second Trip writer. No GRANT/role/JWT/credential/target/source fetch/publish/fees. Native complete UI remains a named downstream dependency.

## Actual identity and typed source

Real public.trip_place_references binds owner+trip+canonical_poi_id (or explicit user_label), not an item. canonical_pois/provider_poi_mappings supply actual canonical/provider identity. Statement symbolic subjectId has no existing FK to canonical POI; never match by title/name similarity or caller boolean.

A new support-owned claim_entity_binding candidate uses real canonicalPoiId + exact statementId/revision/payloadHash/sourceDigest and existing qualified evidence metadata. Existing current_actor Ops independent review excludes mapping author and all actual source submitters; stores reviewer member revision and canonical identity hash. Revoked/revised statement/source/entity/reviewer makes mapping stale. This does not change359 publication or canonical/provider records, infer copyright or acquire new content.

GroundedClaim/EvidenceReceipt/assertGroundedClaim are current typed validators, not DB receipt issuers. Backend current knowledge_read_v1 qualification and original publication/source gates provide actual factId/version/reviewedAt/expiresAt. Typed located_at/place_address and opens_during/opening_hours use actual reviewed payload place/value and validPlaceFields. Server mints address/time_window claim and FactEvidenceReceipt from these exact current rows; caller C0 JSON/FactID alone cannot prove eligibility.

## Core keys / shape / boundaries

All persisted IDs UUID except dayId/itemId: exact case-sensitive TEXT ^[A-Za-z0-9_-]{1,64}$, matching real Trip patch/snapshot model. Owner comes from existing Trip actor/session/mobile guard. Proposal digest/revision/base and current snapshot/day/item are exact. No global/latest fallback.

Status = reference_current/recheck_required/blocked/revoked, separate applicability = unverified/matched. Only address_reference/opening_window_reference actual typed scopes. Plain claim_reference, if separately exposed, is only a source reference with no domain conclusion; no safephrase expansion. Never plan_feasible/title_verified/whole_itinerary_verified.

matched requires exact reviewed canonical mapping, owner's selected canonical TripPlaceReference and explicitly selected day/item relation, plus all date/timezone/typed-field constraints of this scope. Missing canonical relation/date/timezone leaves unverified; receipt does not silently manufacture it. For opening-window scope, explicit item window/date/timezone must lie within actual claim window; mere naming/relevance is insufficient. Address scope proves only selected entity address reference, not walking time, availability, admission or title semantics.

## Complete default-revoked RPC signatures

1. submit_trip_support_entity_mapping_v1(p_input jsonb). Exact keys operationId,canonicalPoiId,statementId,expectedClaimRevision,expectedPayloadHash,expectedSourceDigest,basisMetadata. basisMetadata is bounded actual source IDs/locators/approved identity references, no fetched text/user dialogue. Returns {kind:mapping_candidate,mappingId,version,digest,status:pending}. Same operation+request digest idempotent; altered request conflict.
2. review_trip_support_entity_mapping_v1(p_mapping uuid,p_expected_version bigint,p_expected_digest text,p_decision text). Current Ops identity independently approves/rejects exact current rows; returns {kind:mapping_reviewed,mappingId,version,digest,status}. No caller reviewerId or eligibility bool.
3. prepare_trip_item_support_v1(p_input jsonb). Exact keys operationId,tripId,placeReferenceId,dayId,itemId,proposalId,expectedProposalRevision,expectedBaseVersion,expectedProposalDigest,expectedItemDigest,mappingId,expectedMappingVersion,expectedMappingDigest,city,scene,locale,scope,expectedClaimRevision,expectedPayloadHash,expectedSourceDigest. Scope address_reference/opening_window_reference. Server current source qualification, proposed after-diff item and actual entity mapping required. Returns {kind:prepared,receiptId,version,tripId,proposalId,proposalRevision,baseVersion,dayId,itemId,scope,applicability,claim,sourceDigest,expiresAt}. No trust in caller typed claim/value/source payload.
4. revoke_trip_item_support_preparation_v1(p_receipt uuid,p_expected_version bigint) returns {kind:revoked,receiptId,version} or blocked/conflict. Prepared selection only; no confirmed content mutation.
5. confirm_and_apply_supported_trip_proposal_v1(p_proposal_id uuid,p_idempotency_key text,p_digest text,p_support_selection jsonb). Array1..8 exact {receiptId,version,sourceDigest}, unique receipt and day/item/scope. Owner explicitly chooses these receipts. Returns original confirm outcome/trip/proposal/resultingVersion plus bounded support binding receipts/status. No arbitrary prepared receipt automatically attaches through old confirmation.
6. read_trip_item_support_v1(p_trip uuid,p_expected_trip_version integer,p_day text,p_item text). Owner-only {kind:support,tripId,tripVersion,dayId,itemId,entries} max8, exact current item/snapshot and current source/mapping/reviewer qualification. entries expose typed value only while presently allowed; otherwise minimal scope/status/reason/version/hash, no withdrawn value/locators. No receipt grants evergreen eligibility.
7. apply_trip_item_source_impact_v1(p_support uuid,p_expected_version bigint,p_source uuid,p_expected_source_digest text). Source delta only real persistent support eligibility/recheck version change and immutable effect receipt; no Trip/content/intent/claim publication mutation. Future207 consumer must ACK only that committed effect. Existing current gate also blocks lost qualifications before any delayed effect.
8. renew_trip_item_support_v1(p_input jsonb). Exact operationId,supportId,expectedVersion,tripVersion,dayId,itemId,mappingId,expectedMappingVersion,expectedMappingDigest,expectedClaimRevision,expectedPayloadHash,expectedSourceDigest. Requires new current reviewed mapping/claim/source receipt and exact user item selection; new support version/current receipt. Cannot clear recheck from old receipt/boolean.

Every success/failure shape is closed, UUID/hash/version/item scalar limits strict, idempotency scoped owner/operation. Source/claim/mapping change yields stale, wrong owner/selection blocked; source withdrawal is never policy reversal from404.

## Exact same-xid confirmation proof / sidecar

Existing writer is public.confirm_and_apply_trip_proposal(p_proposal_id uuid,p_idempotency_key text,p_digest text); call it unchanged. read_trip_proposal_v2/visible diff and existing immutable patch remain source of after-snapshot. New wrapper locks exact owner/Trip/proposal, verifies selected1..8 preparation receipts and field/item hashes, inserts private same-xid proof (owner/trip/proposal/revision/base/digest plus exact selected receipt IDs/version/sourceDigest), then calls old confirm. No GUC, forged v1 flag, body copy or new Trip writer.

Deferred sidecar on actual public.trip_events(proposal_applied) binds only a matching private same-xid proof and actual final trip_version_snapshots resulting_version=base+1. Ordinary old confirm without proof is ordinary Trip behavior and mints no support. Supported wrapper forces this new constraint sidecar before returning its binding receipt, within the same transaction; it does not broaden old confirm authority.

Source becomes invalid after selection: keep ordinary user confirmation, bind only minimal recheck_required/blocked marker, no revoked typed values or fake current. Wrong owner/base/proposal/item/digest stays a hard selection failure and cannot bypass old confirm. Explicitly chosen support never silently validates entire title/activity/plan. Lost ACK reads original exact confirm/support receipt, never repeats a Trip mutation.

## Locks / source recheck / lifecycle

Current owner root→mobile/session/account→Trip→proposal/snapshots→selected preparation/mapping/current publication/source→support/proof/receipt. Ops mapping review uses existing ops actor root/member→canonical/statement/source→mapping; never waits support then Trip. Current publication/source/reviewer/canonical hash requalifies at prepare, confirmation, read, impact and renew.

New preparation/support/proof/receipt rows use actual owner/trip/proposal/event anchors with cascades compatible with D3 explicit event/proposal-before-Trip deletion; no new FK blocks original deletion or retains private linkage after source owner/Trip removal. Confirmed user intent/content remains unchanged by source revocation.200 functions/sidecars default revoked, no automatic role/API/deploy activation. Native read DTO pipeline complete does not mean Native screen integration is done; expose backend status to its owner explicitly.

## Index/cache applicability

Actual online source consumers requery SQL current qualification; wiki lexical scorer consumes caller-provided eligible corpus and has no persistent index/cache backend. No fake eviction ACK, useless new cache or new search engine. Only a real retained consumer/read path can justify a future invalidation adapter.

Privacy inventory checkpoint: preparations retain only exact IDs/hash/link/scope/application/status metadata; no redundant typed_claim/source text copy. Current reads mint allowed typed values from current qualification, otherwise minimal recheck marker. New default-revoked owner metadata keyset helper is not automatically enrolled into D2 export delivery; that actual module/handler dependency remains partial, not falsely complete account export. Actual owner/Trip/event/proposal-before-Trip delete cascades require local PG evidence, not schema declarations alone.

## Actual #207 Ops authority bridge (same200 append, expected-body guard)

Dependencies: merged180 reviewed-set graph/outbox and exact lease/generation/digest authority, never owner JWT impersonation or a parallel queue.200 wrapper extends original180 impact_graph with exact existing support IDs whose stored sourceRefs actually reference the source; target is minimal supportId/version/hash/claimRefs, no owner/Trip/item text or typed values. All targets remain inside original hard1000+sentinel/cursor100/globalgraph CAS; no separate completion shortcut.

New bridge RPC apply_reviewed_trip_support_delivery_v1(p_delivery uuid,p_lease uuid,p_expected_attempt integer,p_expected_digest text) uses current_actor plus existing independent review/member revision/current source set, exact outbox consumer=trip_item_support and target.kind=trip_item_support. Lock actor→reviewed set/principal→outbox delivery→support row/source; metadata-only support recheck update, immutable support effect receipt and original outbox ACK commit together. No arbitrary owner enumeration, private typed read or confirmed Trip update. Old generation/lease cannot ACK/fail another, duplicate committed receipt is exact readback.

180 claim_source_impact_delivery_v1/read/helper/projection API changes only by guarded200 extension: validate expected body fingerprint/shape before delegating legacy knowledge consumer, no edit to180 historical file. Review outbox enrollment changes unsupported trip consumer to queued only for actual support targets; other unsupported index/cache/media/etc remain unsupported. Actual new target kind and consumer DTO must be enumerated strictly. Support deletion cleanup removes its new private ID/claimRefs from reviewed graph/item/effects, invalidates affected source review and old cursor/delivery, preserving unrelated public source audit. Source removal is audited metadata only; current owner support read independently requalifies knowledge-source TTL even before this effect.

Owner apply API is not this Ops bridge. Named worker explicitly selects trip_item_support and the approved bridge RPC; failed/unknown exact outbox read/fail uses existing reviewed-source privilege. Every new bridge entry defaultrevoked/noGRANT and no target invocation. Native/D2 delivery module enrollment remain separate known unfinished dependencies.
