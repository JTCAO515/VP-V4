# Main review delta

Original formal source: 1b521b37. Original findings remain: Spec P1 (expiry before
disclosure), P2 (foreign/malformed Trip downgraded to unknown), P2 (expectation
unused); Standards P3 (duplicate submission DTO validation). The 1251881f delta
only added questionId and explicit identity attestation unknown; it fixed none
of these findings. Main delta review remains pending, not self-declared PASS.

Fix source: `85a1e1ebae8ed3ed5e0cd6ef2a1c6873a32b198d`.

- `qualifiedTurn` retains the existing parser's remaining lifetime, including
  parsing time, as a monotonic expiry. Final Trip/session/policy reads and report
  construction cannot extend it. Expired facts/gaps/comparisons are suppressed.
- Foreign Trip IDs and malformed envelope/content/version values fail closed
  before POST. Well-formed content with an absent trusted head version and
  legitimate PROVIDER_UNAVAILABLE remain unknown, as the task requires. A zero
  sentinel validates only content structure when head version is absent; it is
  never an observed version, count, comparison basis or report value.
- Frozen expectation now participates in explicit outcome/fact/source/gap field
  comparisons against current parsed observations. This uses the existing
  value comparator and emits matched/mismatched/unknown, not aggregate quality
  or a second scorer. H01's available grader accepts complete fixture assertions;
  absent full collection/identity/semantic oracle evidence cannot be fabricated
  into those four assertions. It therefore remains NOT_RUN, while real field
  mismatches are now visible. H04/H07 receive no invented grader.
- `parseAskSubmission` is the single closed DTO implementation. Both run
  admission and standalone transport execute it; run additionally checks policy
  binding and transport serializes its detached parsed DTO.

PASS: 20 direct tests, typecheck, lint/docs and diff check. Four new regression
tests cover source expiry during final Trip read, foreign/malformed Trip with
zero POST, each frozen-field mismatch and both DTO boundaries rejecting invalid
or accessor-bearing inputs without fetch/getter calls. Prior 16 tests remain
passing, including actual Native handlers over intercepted SDK transport.
Source expiry regression preserves a live run deadline while expiring source
lease; it is controlled qualification evidence, not real Staging.

No original recovery/shared/CI/package/production authority edits. No live
Auth/DB/provider/fees/ECS/production. Full H1/required mode and #264 acceptance
remain NOT_RUN; unknown collection, usage/cost/quota/key/context/identity proof
is not changed by matching metadata. Exact complete range must include initial
source 1b521b37, metadata 1251881f and fix 85a1e1eb plus all evidence commits.
