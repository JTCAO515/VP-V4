# VPJ-16 saved Web answer: temporary recheck failure

Related to #206. S2 bounded Web consumer correction from main `f7ec21a4`.

## Observed defect and change

`parseGroundedHistory` already accepts an authorized saved Turn whose current factual
projection is `unavailable` with `knowledge: null`. Its Web notice previously called this
`blocked` (or the payment, SIM or place blocked variants), telling the traveler that no
supported answer exists. That conclusion does not follow from a failed recheck and differs
from the native saved-answer notice. The Web notice now says the evidence cannot currently
be rechecked, hides facts and asks the user to refresh later. Actual current `blocked` and
partial claim-gap notices remain separate.

The change is limited to Web copy and notice selection. It adds no source access, model call,
database write, schema, provider permission or production activation. Rollback: revert this PR.

## Checks

- PASS: 15/15 affected read-model and actual SavedAnswers component contract tests. The
  bilingual unavailable fixture shows the retry notice without facts, gap language or the
  AI-assist entry; existing complete and partial cases stay covered.
- PASS: `pnpm lint`, `pnpm typecheck`, `git diff --check`.
- UNRUN: authenticated Staging/browser and fresh-provider observation. No shared database
  writes or worker calls were made. This fixture is a consumer regression check, not whole
  #206 or S2 acceptance.

Reproduce: `node --experimental-strip-types --test tests/contract/knowledge/grounded-web-read.test.ts tests/contract/knowledge/saved-answer-gaps.test.mjs`.
