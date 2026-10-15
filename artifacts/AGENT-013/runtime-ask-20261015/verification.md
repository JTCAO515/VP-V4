# H1 runtime Ask scoped delivery — 2026-10-15

Accepted base: `ded26ad709027350433c78fc746fdd3d6aaff575`.
Current final source/test head: `85a1e1ebae8ed3ed5e0cd6ef2a1c6873a32b198d`.
Current evidence: `review-fix-checks.log.gz`, 20 direct tests and typecheck/lint/docs
PASS. See `review-fix.md` for the source delta and retained original findings.
Historical snapshots: initial 1b521b379fc64eb085e272438d9cd10630282404;
metadata delta 1251881fdc06286868abb048c8dfb851c5c71e38. `local-checks.log.gz`
belongs only to that 1251881f source snapshot (16 tests/typecheck), not current 85a1e1eb.
Source commits are 1b521b37, 1251881f and 85a1e1eb; documentation/evidence commits
between and after them do not substitute for source validation. Include all
commits in the accepted-base to final-head range.
Original `3e98bf4f` recovery branch and PR704 were preserved. The clean original
WT was switched to new `codex/agent013-runtime-ask-20261015` from accepted QA.
New owned source is only `evals/harness/runtime-ask/**`, its contract test scope
and this artifact directory. No shared/old recovery, registry, production port,
CI/package/worker/SQL/config or HANDOFF edits.

Equivalence audit: `recorded/h04-readonly.ts` consumes operator records and states
originAuthentication NOT_VERIFIED; `harness.evals.test.ts` has two fixture seeds
and ten NOT_RUN. Existing grounded integration runners provision their own
runtime/DB and are not an equivalent reusable authorized-current-context Harness
API. NativeAskStore uses v4 policy/turns/events and NativeSession credentials;
the new module drives these exact endpoint semantics without replacing them.

Actual local facts: Node v26.8.2 and existing pnpm dependencies available;
Git/normal push and GitHub current-user read succeeded as JTCAO515. No real
Native/provider credential was acquired, emitted or persisted. Approval profile
is disabled, but live/fees/DB/ECS/production were not authorized or run. Official
model request Sol/medium; effective model/tier not exposed, UNKNOWN.

Current 85a1e1eb PASS: 20 direct tests (0 FAIL/SKIP/CANCEL), TypeScript, source lint
(843 files), docs baseline and diff checks. H01/H04/H07 invoke the driver with original DTO/IDs
and existing grounded parsers. One test runs actual Native identity/text/events
handlers over intercepted SDK transport and existing `nativeFixture` ephemeral
synthetic keys. These are controlled tests, not actual Auth/database/provider
observations or a second worker/model producer. Tests preserve required-mode
and full acceptance NOT_RUN. Main's source-equal integration additionally ran
57 combined tests (these 20 + 37 grounded) and typecheck PASS; that is reported
Main evidence, not a locally rerun 57-test claim. Original formal source findings
were resolved at 85a1e1eb; the remaining shared Standards/Spec P3 concerns stale
evidence documentation and awaits Main's exact documentation-delta review.

Resolved local failures retained: the first blocked/technical_failure test used
a completed SSE terminal state for unavailable/failed output; the production
validator rejected it. The fixture now uses its declared actual Turn state,
with no parser weakening. Typecheck twice exposed DOM nullable signal vs
NextRequest's optional signal; the fixture now passes `signal ?? undefined`.
No global config/cast workaround or production DTO change was used.

Unknown ACKs are followed only by original events/history reads. At every read,
current subject/session/epoch is matched; policy/notice is rechecked before
submit and after final history/Trip. Source projection unavailability suppresses
earlier content. Reports retain only actual request/response hashes/status/size,
binding IDs and currently parsed fact/source/gap IDs, never raw request/answer,
Trip body, notice, source URLs/locators/publisher or secrets.

Full Trip collection invariance, actual usage/cost/quota, original key readback
and actual context attestation are unknown. A valid selected Trip can be compared
without claiming collection completeness. The existing H01 fixture grader is
used only with incomplete evidence and returns NOT_RUN; no H04/H07 scorer,
threshold, seed or holdout change. Frozen expectations are compared with current
observable outcome/fact/source/gap fields, not retrospectively adjusted to results.
These comparisons do not prove semantic quality or whole H1. No target H1, Web/device, restart, complete
parent #264 or production acceptance claim. Main owns exact-head review/CI,
ordinary QA merge and any separately leased shared entry hookup.

Final 85a1e1eb check output is retained unchanged in `review-fix-checks.log.gz`.
The historical 125/16 log remains unchanged as `local-checks.log.gz`. Exact full commit
range is accepted QA base ded26ad709027350433c78fc746fdd3d6aaff575 through this
branch's final PR head; include every commit, including metadata 1251881f and source 85a1e1eb.
