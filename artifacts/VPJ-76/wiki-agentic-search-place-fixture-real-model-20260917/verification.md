# VPJ-76 (#360) verification — round 24: place-fixture naming + real Qwen re-run

Closes `artifacts/VPJ-76/unrun.md` item (b) from the 2026-09-16 real-model
pass's recommended follow-up work: "name the specific place in the
place-fixture corpus text so the place-question retrieval gap (category 4)
can be re-tested and actually diagnosed."

## What changed (fixture data only, no production code)

`evals/wiki-agentic-search/cases.ts` (`versions.corpus` bumped
`wiki-agentic-search-eval/1` → `/2`): the three place-question
`QUESTION_TEXT` entries (`place_address`, `place_opening_hours`,
`place_address_and_hours`) and the `place_address`/`opening_hours`
`STATEMENT_TEXT` entries previously used a generic, nameless placeholder
("这个景点"/"the named attraction", "该场馆"/"the venue's") — the only
question family in this eval that never named its own real concept in
either the question or the corpus text. They now consistently name a
wholly synthetic, fictional attraction, "Cloudscape Pavilion" / 云境阁,
across both the question and the corpus statement text, matching every
other question family's own convention (e.g. rail/payment/connectivity
statements name their real concepts instead of an underscored
placeholder — see that file's existing comment on `STATEMENT_TEXT`).
`evals/wiki-agentic-search/wiki-agentic-search.evals.test.ts`'s
`intentFor()` `placeName` was updated to match, for readability, even
though `grounded-search.ts` does not read `intent.placeName` anywhere
today (confirmed by reading that module and `wiki-search-job.ts`; the
only thing a real model actually receives is `input.question`, the free
text).

**Why this, not a production-code fix:** in the real product,
`runGroundedWikiSearch`'s `question` input is the traveler's own raw
input text (`grounded-ai-assist.ts`'s `context.inputText`), which
presumably already names the actual place a traveler is asking about —
this eval's own templated `QUESTION_TEXT` never did, which is the eval's
own fixture-realism gap, not a defect in `grounded-search.ts` or
`search-index.ts`. Fixing the fixture text is the narrow, correct-scope
fix; changing `intent.placeName` to actually reach the search prompt
would be a real production-code change to a shared module, out of this
round's scope and not what unrun.md's item (b) asked for.

## Fixture-mode regression check

`node --experimental-strip-types --test evals/wiki-agentic-search/wiki-agentic-search.evals.test.ts`
after the `cases.ts` edit: still **34/34 PASS** (`artifacts/VPJ-76/wiki-frozen-eval-20260915/results.json`
regenerated with the new content, `verdict: "PASS"`, no other metric
changed materially — fixture transport is scripted and does not care
about the specific wording, only that it exists and is a real string).

## Provider choice for this round's real-model pass: Qwen, not GLM

Re-checked directly (not assumed) before running, per this round's own
task instructions:

- **GLM: real HTTP 429, zero balance, reconfirmed this round.** A direct
  minimal real HTTP call (`POST open.bigmodel.cn/api/paas/v4/chat/completions`,
  `model: "glm-5.3-flash"`) returned `{"error":{"code":"1113","message":"余额不足或无可用资源包,请充值。"}}`
  — the exact same real "insufficient balance" response prior rounds
  recorded, reconfirmed fresh rather than assumed.
- **Qwen: real, usable balance**, consistent with round 22's own
  finding. This run is 32 real, billed HTTP calls to
  `dashscope.aliyuncs.com` (`qwen3.7-plus-2026-05-26`, resolved
  automatically by `provider-protocol.ts` from `provider.provider ===
  "qwen"` — this script never hardcodes a model id).

New script: `scripts/eval/run-wiki-agentic-place-fixture-real-model.mjs`
(a new file, not an edit to the existing GLM-era
`run-wiki-agentic-real-model.mjs`, so that script's own 2026-09-16 GLM
run stays an intact, reproducible historical record). Same
fixture-RPC/real-model-transport convention every other real-model
script in this repo already uses; skips `provider_failure`/
`budget_exhausted` (mechanism-only, cannot be forced against a real
model, already covered by the fixture pass).

## Result: 84.4% overall (27/32), 6/6 on place questions specifically

| Metric | This run (Qwen, named place) | 2026-09-16 run (GLM, generic place) |
| --- | --- | --- |
| Overall accuracy | 84.4% (27/32) | 65.6% (21/32) |
| **Place-question accuracy** | **6/6 (100%)** | **2/6 (33%)** |
| Coverage rate | 90.6% | 75% |
| p50 / p95 elapsed | 4358.8ms / 7039.1ms | 11.8s / 25.4s |
| Total real usage tokens | 52,980 | 59,474 |

**The specific gap this item targeted is closed:** every one of the 6
place-question scenarios (`place_address`, `place_opening_hours`,
`place_address_and_hours`, zh+en) now matches ground truth — the prior
run's asymmetric `retrieval_miss` result on the address/hours-only
scenarios is gone. This is real, direct evidence that a fixture corpus
naming the specific place a question asks about materially helps a real
model connect a generic-sounding question ("where is this attraction")
to the right passage, supporting hypothesis (a) from the 2026-09-16
write-up over hypothesis (b) (pure provider variance) for at least the
address/opening-hours-only cases.

**Not a controlled single-variable comparison** — this run also switched
provider (GLM → Qwen) because GLM no longer has real balance, so the
overall 65.6%→84.4% jump cannot be attributed to the fixture change
alone. The place-question-specific 2/6→6/6 change is the load-bearing
number here, not the aggregate.

## Raw-response capture (unrun.md item (c), script-layer only)

Every row in `results.json` carries `rawResponseStatus`/`rawResponseText`
— the real HTTP response this run received — via a `deps.fetch` capturing
wrapper (the same pattern `run-wiki-statement-proposals-injection-real-model.mjs`
established in round 22). This run happened to hit zero
`MODEL_OUTPUT_INVALID` outcomes (every mismatch below is either a real
`retrieval_miss` or a real, honestly-partial `answered`, not a schema
rejection), so the capture is proven working (a real 200 response body
recorded for all 32 scenarios) but not yet exercised against the actual
failure mode it exists to diagnose. This is a script-level addition only
— `provider-protocol.ts` itself, the shared module every production/eval
caller goes through, is unchanged; unrun.md's own original phrasing
flagged that as needing separate, careful review, and this round did not
attempt it.

## The 5 remaining mismatches — root-caused from the real, captured response

None are place questions; all match categories already named in the
2026-09-16 write-up as genuine tuning signal or real single-run
variance, not defects:

- **`rail_boarding_documents-en`** (expected `answered`, got
  `retrieval_miss`): the real model's raw response (captured, `status:
  200`) explicitly says `"coverage": "no_content"`,
  `"summary": "No relevant information was found..."` — a real,
  deliberate model judgment, not a schema failure or thrown error. The
  `zh` sibling case (same corpus, same claims) answered correctly with
  both required documents covered, so this is real single-call/locale
  variance on one case, not a systemic corpus issue — consistent with
  the "real single-provider variance" hypothesis the 2026-09-16 write-up
  already named as a non-exclusive cause for this category. Not re-run
  in this pass (a second real call would cost further budget for a
  single flagged case without separate authorization).
- **`payment_card_and_cash-{zh,en}`** (3 required claims, 2/3 covered)
  and **`payment_getting_started-{zh,en}`** (4 required claims, 1/4
  covered): all four are `tunedMaxRounds`-eligible multi-claim
  questions that used only 3 of their available (raised) round budget
  and then chose to answer with honest partial coverage rather than
  continue searching — visible directly in the captured raw response
  (`"coverage": "partial"`, real `gaps` naming exactly what was missing,
  e.g. "未列出除支付宝和微信外的其他潜在支付方式"). This is the same
  category-3 behavior the 2026-09-16 pass already documented and the
  round-23 `tunedMaxRounds` fix already raised the *ceiling* for
  (confirmed working as designed — `payment_getting_started`, 4 claims,
  did get 3+ rounds here, more than the un-tuned floor of 2) — the
  model's own choice to stop searching before using its full raised
  budget is a prompt/behavior tuning question, not a mechanism defect,
  and out of this round's narrow fixture-focused scope.

## What this confirms, and what remains open

The pipeline's safety properties held across all 32 real calls: no
fabricated citation, no crash, no taxonomy bypass — every non-match was
either a real, honestly-reported partial/no-content judgment (visible
verbatim in the captured raw response) or a single-case locale-variance
retrieval miss. #360 remains OPEN — its own final acceptance line still
requires a real end-to-end iOS/Web readback with a live provider
credential configured in an actual deployment, which no environment has;
this round adds real-model evidence for the search mechanism, not a
production deployment.

Not done this round: a re-run of the un-tuned `run-wiki-agentic-real-model.mjs`
against Qwen for a true single-variable (provider-only) comparison; any
attempt to change the model's own tendency to stop early on multi-claim
questions; extending raw-response capture into `provider-protocol.ts`
itself.
