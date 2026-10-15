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

## Authorized source follow-up, 89334409

The leased original job done branch now consumes a matched, exact-turn, syntactically valid subject only from its owner-authorized context RPC, then uses the existing current-evidence replay gate. It does not resolve a title or create an admission/binding wrapper. Dedicated source tests first reproduced initial and done failures; after this source edit, the done positive and old-turn/ambiguous/unavailable/invalid-subject/client-forgery negatives pass without a model or evidence read on denial.

Actual affected execution: 54 tests, 53 PASS / 1 FAIL. The remaining initial-call FAIL is the unchanged unleased grounded-ai-assist.ts dropping the context subject. The context fields in these fixtures are explicitly prerequisites for the proposed owner-RPC projection, not proof current SQL emits or requalifies them. typecheck and lint PASS for actual repo source. Shared TS/SQL candidate files remain NOT_APPLIED/UNRUN. This is not a completed canonical Ask user flow or a merge-ready delivery.

Push 89334409 first failed with LibreSSL SSL_connect: SSL_ERROR_SYSCALL github.com:443. Same-origin ls-remote then proved remote remained6332b53b, allowing one normal push retry without identity/proxy/credential changes. This transport failure is retained as an observation, not treated as an authorization rejection or hidden successful write.

## Initial + done source completion under explicit shared-file lease

Main granted exactly lib/server/knowledge/wiki/grounded-ai-assist.ts at before Git blob 6dc20e0e79a83f69b54b46915f420cb33d86dc1b. The before blob matched and the file was clean before editing. Actual source commit 33df7b39 supersedes the earlier NOT_APPLIED TS-only candidate; SQL candidates are still NOT_APPLIED/UNRUN and Main retains the sole migration/ACL/registry writer.

The existing parseContext now serves initial and done, requiring owner-context exact turn, matched resolution and valid fixed-question subject for a supplied placeSubjectId. It does not accept a client/model/label as subject authority. The job passes explicit execution config fields into replay rather than spreading arbitrary caller fields, so runtime client extras cannot fill a missing server subject. The newly introduced replay-spread regression was first observed FAIL and then repaired; replay-authority-before.log/raw archive preserves it.

All selected production-function regressions now PASS 73/73 (38 prior direct + existing initial/job contracts + 20 subject-binding cases), including initial/done normal resolution, exact turn, ambiguity, unavailable/revoked context, malformed/cross-intent subject, client spoofing, wrong entity, scoped city exclusion, zh/en source conditions/exclusions, and completion unknown/error. initial-after.log is controlled C0 transport execution of real producer functions; it is not a real DB/auth/HTTP/browser/provider run. Repo source typecheck/lint/diff PASS. SQL projection/complete requalification, ordinary authenticated role and actual canonical Ask admission remain pending, so Draft710 remains NOT merge-ready and #206 OPEN.

## Final bounded SQL implementation and current CI seam

SQL-VERIFICATION.md and pg17/ are the current package evidence. The single Main-assigned append is implemented, and actual native PG17.11 full-history + append validation passes16/16 with0skip. It changes exactly the two declared existing prosrc bodies, preserves265 tables/catalog/permissions, and leaves all nine applicable guards TRUE. The earlier shared SQL before/after snippets are historical candidates, not the authoritative append implementation. No shared target migration was run.

The gated PG runner moved out of contract into the newly leased tests/integration/knowledge/agent-grounded-subject/subject-binding-postgres.test.mjs. Default owned contract discovery is58PASS/0skip; the unchanged broader TS73 proof is reused. The PG runner supports the existing VP_WIKI_PG_BIN/MODULE and the explicit AGENT005 overrides, uses a short private nonce on both Mac and Linux, and separates evidence by backend major version.

A real PG16.15 attempt fails the old assistant-events frozen MAINTAIN table-ACL pin before reaching this append. Its failure is retained, and no historical guard was loosened. Main owns PG17 CI installation/registration (or a proper pinned17.6 container runner), shared current-contract documentation and final review/CI/protected merge. Draft710 is not claimed CI-complete. Generic canonical Ask admission and #206 remain open; ordinary Guide ingress remains denied with no fixture grants. Target17.6/GoTrue/real provider/Native-Web clients are still UNRUN.
