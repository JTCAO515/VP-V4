# #360 (VPJ-76) verification — search loop convergence + CJK retrieval fix

Fixes two real, distinct bugs found by the real-model probe in
`wiki-real-model-probe-20260915/verification.md`, then re-verifies both
fixes against a real model on the exact same real questions that
originally failed.

## Bug #1: the loop never told the model "you're not making progress"

`wiki-search-job.ts`'s duplicate-query detection only fired on an exact
(case-insensitive) string match. A real GLM probe showed the model
rephrasing its Chinese query every round (different wording, same intent)
without ever hitting that check, so it never received the "stop searching
and answer" signal the system prompt describes -- both real Chinese runs
in the original probe hit `budget_exhausted` without ever answering.

**Fix:** track which corpus `pageKey`s have been surfaced across *all*
rounds so far (`seenPageKeys`), independent of exact query-string matching.
A round whose results contain no page beyond what's already been seen is
now labeled distinctly from an exact duplicate ("every result was already
surfaced by an earlier round's search... even though the query wording
differs") and the next prompt tells the model rephrasing further is
unlikely to help. Separately, the final round's prompt now explicitly says
there is no round after it and that running out of rounds unanswered is
worse than answering with `partial`/`no_content`.

## Bug #2: the retrieval primitive silently returns nothing for CJK text

`search-index.ts`'s `tokenize()` used to `split(/\s+/)`. Chinese has no
spaces between words, so an entire Chinese passage became one giant token
that could never match a short multi-character query -- independent of bug
#1, and worse: it made the *first* real GLM retest of bug #1's fix return
`coverage: "no_content"` even though the corpus had the answer, because
the search genuinely found nothing.

**Fix:** CJK characters (`㐀-䶿`, `一-鿿`, `豈-﫿`)
are now tokenized as adjacent-character bigrams (the same lightweight
approach Lucene's `CJKAnalyzer` uses) instead of being swept into one
whitespace-delimited blob; non-CJK text keeps the original tokenization.
The exact-phrase bonus in `scoreEntry` is a no-op for CJK queries (their
terms are space-joined bigrams that never appear verbatim in unspaced
source text) -- documented as an accepted gap, not silently broken.

## Real re-verification (GLM-5.3-flash, maxOutputTokens: 2000)

Same two real Chinese questions that failed in the original probe,
against the same corpus:

| Question | Before (original probe) | After (both fixes) |
| --- | --- | --- |
| 在上海买地铁票可以用外国信用卡吗？(the corpus has the answer) | `budget_exhausted` after 3 rounds, never answered | **`answered`, `coverage: "partial"`**, 3 rounds, accurate summary, 3 citations all verbatim-verified against the real corpus text, 2 honest gaps (staffed counters, QR-payment app details -- neither invented) |
| 在重庆坐轻轨需要提前实名预约吗？(the corpus has nothing relevant) | `budget_exhausted` after 3 rounds, never answered | **`answered`, `coverage: "no_content"`**, 3 rounds, correctly reports nothing relevant was found, does not fabricate an answer or misuse the unrelated SIM-card/Shanghai-metro content it did retrieve |

Both real runs now converge to a real, honest terminal answer within the
round budget, instead of exhausting it. Full raw outcomes (including the
intermediate real queries issued) were reviewed by hand before writing
this summary; the probe script itself was deleted after use per this
session's key-handling discipline (see `wiki-real-model-probe-20260915/verification.md`).

## Fixture verification

- `tests/contract/knowledge/wiki-search-job.test.mjs` — 12/12 pass (2 new:
  the no-new-evidence-despite-rephrasing prompt, and the final-round
  prompt), all 10 pre-existing tests unaffected by the change.
- `tests/contract/knowledge/wiki-search-index.test.mjs` — 11/11 pass (4
  new: a real multi-word Chinese query matching the relevant Chinese
  passage, short-query ranking, an unrelated Chinese query returning
  nothing, and an explicit test documenting the accepted bigram-overlap
  coarseness -- sharing one common two-character word like 交通 produces a
  real, low-scoring, non-silent hit, not a bug to suppress).
- `node scripts/run-ci-suite.mjs contract` — 429/429 pass, 0 skipped, no
  regressions.
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean.

## What was NOT verified

- **Not a benchmark.** Two real re-verification runs, both against the
  same two questions and the same small corpus that exposed the original
  bugs. Not the frozen zh/en evaluation set VPJ-76 still requires.
- **Bigram CJK tokenization is coarse by design**, not a real segmenter --
  false-positive low-score matches on a shared common two-character word
  (documented in the new test) are expected behavior, not eliminated.
- **No English regression re-verified against a real model** -- only the
  fixture suite covers the English path after this change; the original
  real English success (from the prior probe) was not re-run against a
  real model after this change.
- **DeepSeek's stale model id (finding #1 from the prior probe) remains
  unfixed** -- out of scope here too, same reasoning as before.
