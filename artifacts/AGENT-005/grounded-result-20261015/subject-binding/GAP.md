# AGENT-005 subject binding: exact source gap and candidate, not runtime evidence

Base 22559396eec5cd47d3a4d3d2a2bd5e49d52c6c7c. Current branch codex/agent005-subject-binding-20261015, same leased WT. Original c216 branch preserved. No actual shared source/SQL/HTTP/Native/Web edits, migration execution or provider call.

## Existing authority (read from current source)

- `knowledge_review_private.place_subject(text,text)` (20260914040000) resolves exact reviewed bilingual names within a supplied city and rejects multiple subjects. Original `complete_grounded_place_work` stores its selected subject/resolution in `turn_private.grounded_turns`. It is not a canonical POI mapping and cannot upgrade client labels to a canonical identity.
- `trip_support_private.entity_mappings` (20261003200000) already links canonical_poi_id to statement_id, pinned revision/payload/source/canonical hashes and reviewed basis metadata. `mapping_basis` requalifies those against current publication, source, Ops membership and canonical row.
- `guide_place_v1/follow_up` (20261005080000) already persists owner/session/Trip/head/reference/canonical/source-proof metadata to `guide_private.bindings_v1` then calls the original `submit_grounded_turn`. `guide_private.place_complete_v1` derives the symbolic knowledge subject from that bound exact source set; `read_grounded_turn` is already wrapped with the current marked binding guard. Guide prompt-use qualification is mandatory; a generic PlaceActions Ask handoff does not grant it.

## Exact broken edges in the real path

1. Native `native-ai-assist-http.ts` and Web `/api/chat/grounded/ai-assist` call the existing runGroundedAiAssistJob with turnId only. Context RPC returns g.place_name but omits g.place_subject_id/place_resolution. No user selection can be made authoritative by adding a request subject field.
2. `grounded-ai-assist.ts` parseContext/call also drops subject. This file is outside the current three-source writer lease. The attached exact before/after/patch consumes only a turn-correlated matched subject from the owner-authorized context RPC; legacy unresolved places stay unresolved. It does not infer a mapping, add an authority boolean, or take client fields.
3. `grounded-ai-assist-job.ts` historical done branch currently rejects every place intent; after the same context contract is agreed it must pass the trusted stored subject through its existing revalidation path. This file is in this owner lease, but initial live completion cannot be fixed independently without edges 1/2.
4. Ordinary PlaceActions Ask (runPlaceAction lines131–138) returns `readyForProvider:false`, an exact current Trip/reference navigation handoff. Web ChatThreadWorkspace rereads owned Trip places but does not persist a turn/knowledge-subject binding; NativeAssistantConversationView's exploreInput turns the canonical/Trip/version into draft text. Neither is equivalent to Guide's existing proof-marked admission. Ordinary Ask does not have a server turn selection association, and title/model/text/URL parsing cannot fill it.

## Candidate package and Main/holder dependencies

`candidate-manifest.json` pins exact before/after hashes. `grounded-ai-assist.patch` is the minimal shared TS parser/call candidate. SQL before/after snippets are candidates for an append-only, expected-definition guarded migration; applied migrations must not be edited. Function ACLs/arguments remain unchanged. No candidate is claimed parsed/executed against PG.

Context candidate calls the existing original `read_grounded_turn` to preserve owner/session/consent/current source and Guide-marked qualification before returning the stored matched subject. That existing Guide read guard can invalidate its own expired proof metadata; this is inherited source behavior, not a newly claimed side-effect-free operation. Work RPC candidate requalifies context at ensure/complete, so a withdrawn selection cannot get a successful completion ACK simply because the model returned. Original claim token CAS/known ACK/unknown ACK/accounting semantics are preserved. Main must audit row-lock order and current frozen function registries with the SQL holder before applying; full shared validation is not established by these snippets.

For explicitly selected canonical Ask, the minimum already-existing legal admission is Guide follow_up with the original real policy/question/turn/task/op, current owned reference/Trip version and approved prompt-use proof. Consumers must retain that selection through the existing original call; calling it cannot be inferred from a generic navigation click. If Main selects a generic Ask admission instead, it needs an accepted structured server-side association of that exact selection with the original turn and current mapping proof; none exists in the current ordinary PlaceActions producer. This is a shared ingress/SQL/consumer seam, not another model wrapper. No new knowledge authority, schema or UI contract is invented here.

Current holder for these shared files/SQL is coordinated by Main; historical Git authors are not treated as write releases. Request exact lease for grounded-ai-assist.ts plus the chosen accepted context contract. Native/Web/HTTP/SQL/registry writers remain with Main until explicitly transferred.

## Verification scope

PASS: repository/branch/clean status, Node and dependencies present, official existing GitHub account has pull/push capability, source-chain inspection. Requested Sol/medium is not effective/tier proof: effective/tier UNKNOWN.

UNRUN: shared candidate source execution/typecheck, SQL fixture/ordinary authenticated role, Native/Web consumer execution, real Auth/source/provider/persistence/QA/device. No release, database, provider, new credential or permission action ran. #206 remains OPEN. No filler helper or replacement sample has been created.
