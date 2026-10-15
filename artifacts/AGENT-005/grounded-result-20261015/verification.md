# AGENT-005 grounded result repair

2026-10-15 Asia/Shanghai. Related to #206; this package does not close the full Issue.

Base `ded26ad709027350433c78fc746fdd3d6aaff575`; source/test head `72b76c2e`.
Writer: this dedicated chat/worktree. Main management files remain read-only. Main additionally leased exactly two existing Wiki contract tests and the frozen eval harness: assertion.subjectId fixture construction plus explicitly versioned current-versus-legacy contract reporting. No scenarios, qrels, holdout truth or thresholds changed.

## Changes and observations

- Before: two real producer regressions fail: missing required claim still answered; complete OPS_CONFLICT still succeeded. See before.log. No algorithm copy or real network/provider/DB was used.
- Validate citation existence and verbatim span in the authorized corpus. Replace free model prose with complete published statement text, including conditions/exclusions. A wrong citation cannot inject prose. Server-owned exact subject/predicate/object triples determine required coverage, while background, missing and conflicts stay separate.
- Re-read current authorized corpus before display and compare publication/source chain, subject and full text. Controlled source removal tests represent upstream expired/revoked/missing/scope exclusion; they do not prove live SQL eligibility.
- A no-content model proposal gets bounded direct lookup, reserving one match per required claim before additional sources; maximum eight citations, each from an entry shorter than 4000 code units. Whole canonical text is at most 8*3999+7 units. NativeAskModels.swift and SavedAnswers.tsx have no 1200-unit decoder bound; 1200/300 belong to the model proposal validator. No public consumer wire changed and no condition is truncated to fit that model limit.
- Different wording for one triple is not classified as contradiction. An unlocalized model disagreement yields a generic partial-answer uncertainty alongside the independently authorized statements; no model disagreement prose or private text is forwarded, and no conflicting side is selected. This port has no authoritative contradiction resolution; no broader semantic contradiction-detection claim is made.
- Place corpus scene remains attraction. Neither grounded-ai-assist context nor this search input supplies the resolver's placeSubjectId, so a nonempty place corpus cannot establish required obligations; return existing user_input_missing. The internal input now accepts an optional already-resolved first-party placeSubjectId, explicitly authorized by Main: complete and partial obligations are verified against that exact subject. It never resolves a name or changes any consumer wire. A separate resolved grounded-turn/read-model path exists but cannot be called through this granted RPC interface. This is a safety tightening, not completed place support.
- Completion accepts only the exact current operation's {kind, jobId} receipt, without RPC.error. Rejection, throw, malformed/unknown ACK, wrong job/status return pending. Cancellation never displays success. No completion retry, compensating write, second ensure or additional model is performed to reconcile an ACK.
- Done replay validates stored answer shape and rechecks current provenance through the same final gate with read-only context/corpus calls. A stale source or legacy free summary cannot bypass the new gate; no model/complete runs on done replay.

## Actual checks

| Check | Result |
| --- | --- |
| Original two controlled production-function regressions | FAIL before, PASS after |
| Full tests/contract/knowledge plus dedicated regressions | PASS 212/212 (31 dedicated) |
| tests/security/knowledge | PASS 21/21 |
| pnpm typecheck | PASS |
| pnpm lint | PASS, 843 source files |
| pnpm docs:check | PASS |
| git diff --check against accepted QA base | PASS |
| claims + Wiki search/search safety/proposal safety eval suites | PASS 12/12 under grounded-result-contract/2; all 34 frozen scenarios match current contract; legacy verdict remains FAIL (six unresolved-place rows) |

Original knowledge contract run was 176/181 before the two leased old-test adaptations; that log is retained. Original eval failure was its synthetic-subject fixture, not matching the existing claim truth. After the single authorized fixture repair, the remaining original-contract failure was the unchanged optimistic place expectation. Main then explicitly authorized a versioned harness-contract adaptation: unresolved place fixtures with no claim set expect user_input_missing under the current contract, while each row preserves the original expected/match and the report retains legacyVerdict FAIL. No expectation is derived from the actual result. Other frozen expectations are unchanged, including the genuinely off-topic retrieval-miss corpus. Eval runs used a disposable copied eval tree with the actual lib linked read-only, so legacy artifact-generating tests did not rewrite other owners' evidence. The original 11/12 failure logs remain; current-contract PASS is reported separately from legacy FAIL.

Node v26.8.2, pnpm 9.15.9. Frozen offline install reused 108 packages, downloaded zero; no package/lock/global config changed. Existing GitHub account/keyring read and push succeeded; no credential contents recorded. Requested Sol/medium is not effective model/tier proof: effective/tier UNKNOWN.

## Boundaries and remaining work

The work_v1 SQL port exposes ensure/complete, without an original-operation read-only reconciliation endpoint. Across processes, later ensure may reclaim a stale job under existing SQL rules; this package does not establish exactly-once execution or change retry/cost semantics. Main must coordinate any future shared SQL seam. Current success/done and unknown-then-pending repeated polls are tested with one model and at most one completion.

Real identity/RLS/provider/session/database persistence, production/QA deployment, ECS, fees, credentials, Native/Web rendering and physical devices are UNRUN here. No production/DB/provider operation ran. Formal exact-head Standards/Spec review, applicable CI and normal protected merge belong to Main. Full #206 acceptance remains open.

Frozen place provenance check: cases.ts builds place cases with claims=[] and CorpusStatement has no subjectId; the synthetic-subject in the old RPC fixture is not a resolved entity. No resolved object was fabricated to make that eval green. Dedicated resolved-object positives/negatives are separate, explicit fixture premises.

Current eval artifact frozen-current-contract-results.json retains all 34 rows, 17/17 development/holdout, original denominators and fixture-only p50/p95/declared-token metrics. Its git commit identifies the tested source/harness head. No performance or cost claim extends beyond that fixture process.
