# VPJ-16: precise saved-answer claim gaps

Related to #206; bounded S2 Web consumer slice, based on main `7a05827`.

## Behavior and scope

Before: a revalidated railway/payment/SIM partial answer retained its supported facts but
discarded the missing claim IDs and all reason codes. The page only said other details were
unanswered. Even a known withdrawn or conflicting publication looked like an unspecified gap.
After: the server browser projection preserves validated claim IDs/reasons, and the actual
SavedAnswers component renders bilingual concrete gaps beside reliable text, qualifications
and source links. Existing domain guidance supplies the next verification step. Complete
evidence still displays without a gap or refusal. No automatic human-service promise.

Overall coordinated the adjacent lib/grounded files and SavedAnswers insertion; no edits to
Wiki search, workers, provider endpoints, native/shared DTOs or global planning/handoff.
No schema, permissions, Trip, database, real account or production changes. Rollback: revert
this PR; optional browser-only field is additive and not persisted.

## Verification

- PASS: parser contracts 13/13, including partial facts/conditions/sources retained; original
  outcome preserved; complete evidence; rejected provider/policy/input/capability gap codes.
- PASS: actual component SSR test for zh/en concrete gaps + reliable facts/sources; no false
  blocked notice or AI-assist offer; complete answer has no partial/gap notice.
- PASS: existing saved-answer lifecycle tests 4/4 (expiry, refresh, owner changes and late replies).
- PASS: Browser component fixture at 1280x800 and 390x844, zh/en, no horizontal overflow;
  source disclosure opens; browser error/warning logs empty. Rendered production component
  with controlled React state and existing module CSS; not a live authenticated route.
- PASS: lint and TypeScript.
- First full contract run: FAIL 590/591; unchanged provenance-request auth test exceeded its
  25ms lifetime while a build was running, returning 503 instead of 401. Resource
  contention is suspected, not proven. Isolated diagnostic
  including provenance (6), lifecycle (4) and component (1): PASS 11/11. No unrelated code or
  deadline changed. Final-head CI is recorded in the PR; no unrelated local full-suite rerun.
- PASS: production build, docs check and diff whitespace check. Final full-contract result:
  see final PR CI checks.

## Explicit acceptance limits

UNRUN: authenticated Staging/Web observation with real published evidence, fresh provider
calls, native/device acceptance and whole S2/#206 acceptance. Shared Staging was not written;
provider calls and spend are zero. Historical place-v7 remains paused and was not accessed or
rerun. PR416 MIRACL/BIPIA evidence remains its original separate scope. #206 stays open.

## Reproduction

`node --experimental-strip-types --test tests/contract/knowledge/grounded-web-read.test.ts tests/contract/knowledge/saved-answer-gaps.test.mjs tests/contract/knowledge/saved-answer-refresh.test.mjs`

For the synthetic visual fixture, create a disposable directory and set
`VPJ16_RENDER_DIRECTORY` to that directory while running `saved-answer-gaps.test.mjs`, then
serve its generated en.html/zh.html on loopback. Fixture refresh is intentionally inert;
lifecycle behavior is exercised by the separate deterministic production-effect harness.
