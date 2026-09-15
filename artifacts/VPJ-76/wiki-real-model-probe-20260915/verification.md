# #360 (VPJ-76) verification — real model probe, wiki_search_v1

Status: **real, non-fixture verification.** All five prior VPJ-76 slices
used an injected fixture transport; this is the first time `wiki_search_v1`
was driven by an actual model. JT supplied Qwen/DeepSeek/GLM API keys
directly to this session for this purpose. Keys stored only in
`lib/server/jobs/.local/.env` (git-ignored, confirmed with
`git check-ignore -v`), never committed, never echoed in any commit/PR/doc.
The one-off probe scripts used to run this are not part of the diff --
deleted after use, never committed.

## Environment / network constraint discovered

This sandbox's outbound network allowlist does **not** include
`dashscope.aliyuncs.com` (Qwen) -- a direct `curl` to it fails at the TLS
handshake stage (`SSL_ERROR_SYSCALL`) even through the configured proxy.
`api.deepseek.com` and `open.bigmodel.cn` (GLM/智谱) are both reachable.
Real verification below therefore uses DeepSeek and GLM; Qwen was not
reachable from this environment despite having a real key for it.

## Real finding #1: DeepSeek's configured model id is stale

`MODEL_PROFILES.deepseek_flash.providerModelId` in
`lib/server/model-gateway/index.ts` is `"deepseek-v4-flash"`. A real call
to `https://api.deepseek.com/chat/completions` with that exact model name
succeeds (HTTP 200, real tokens billed -- 552 input / 16 output in this
probe) but the response's own `model` field comes back as
`"deepseek-flash"`, not `"deepseek-v4-flash"`.
`normalizeResponse()`'s exact-match check (`value.model !==
PROTOCOL_MODELS[request.provider]`) correctly rejects this as
`MODEL_OUTPUT_INVALID` -- the *validation* is doing exactly what it's
supposed to do; the *configured model id* is what's out of date.

**Not fixed here.** `MODEL_PROFILES` is shared well beyond
`wiki_search_v1` (every DeepSeek call in this codebase uses it); changing
it is a cross-cutting decision outside this slice's scope, based on a
single real probe. Flagging for a maintainer to confirm and fix
separately, rather than editing shared model configuration as a side
effect of a wiki-search verification task.

## Real finding #2: GLM's reasoning output needs a much larger token budget than this slice defaulted to

First attempt used `maxOutputTokens: 400` (the value this slice's fixture
tests happened to use). Real GLM-5.3-flash calls came back with
`finish_reason: "length"` and an **empty** `content` field -- the model's
own `reasoning_content` (a large chain-of-thought block, observed up to
399 tokens on its own) consumed the entire token budget before any of the
required `{"action":...}` JSON was emitted. This reproduces and sharpens
the known issue already recorded in
`docs/contracts/wiki-generation-dispatch.md` ("GLM-5.3-Flash rejects
thinking: disabled ... Preserve its native default") -- that issue noted
GLM can't have thinking turned off; this probe shows the practical
consequence for a multi-round loop with a short `maxOutputTokens`: silent,
repeated `MODEL_OUTPUT_INVALID` failures that look like a protocol bug but
are actually a starved output budget.

Raw evidence (via a direct, non-`invokeProviderProtocol` HTTP call to
isolate the response from this slice's own validation logic):
```
finish_reason: "length"
message.content: ""
message.reasoning_content: "...one more search might be useful... I'll consider searching once more..." (399 reasoning tokens, 0 left for the actual JSON output)
```

**Fix applied (probe-only, not a code change):** raised `maxOutputTokens`
to 2000 for the real run below. This is a caller-side parameter, not a
hardcoded default anywhere in `wiki-search-job.ts` -- no code change was
needed, only a different value passed by the probe. A real product caller
of `runGroundedWikiSearch`/`runWikiSearchJob` with GLM needs to budget
similarly; this is now documented in `docs/contracts/wiki-agentic-search.md`.

## Real end-to-end success (GLM-5.3-flash, maxOutputTokens: 2000)

Question: *"How do I buy a metro ticket in Shanghai, and can I pay with a
foreign credit card?"* Corpus: 3 hand-written fixture entries (metro,
museum, SIM card), matching the fixture-test shape but never seen by the
model before this call.

- **Round 1** (real call): model returned `{"action":"search","query":"Shanghai metro ticket buy foreign credit card"}` -- `finish_reason: "stop"`, valid closed JSON, no reasoning-token starvation this time.
- Server-side `searchWikiCorpus` ran for real against that query, returning the `source_summary:metro` entry.
- **Round 2** (real call): model returned a valid `{"action":"answer",...}` --
  - `coverage: "answered"`
  - `summary`: accurately restates only what the retrieved passage says (paper ticket vs. rechargeable card, cash/QR accepted, foreign cards not accepted at machines) -- no fact outside the corpus text was introduced
  - `citations`: two entries, both `pageKey: "source_summary:metro"`, both quotes verified **verbatim substrings** of the actual corpus text (checked by hand against the fixture)
  - `gaps`: `["Whether staffed ticket counters accept foreign cards is not covered by the search results."]` -- a genuine, sensible gap, not a hallucinated one
- Real usage: round 1 usage not separately itemized by the wrapper (recorded ~688 tokens raw in the isolated single-call probe); full `runWikiSearchJob` run reported combined `usage: {inputTokens: 1350, outputTokens: 885, totalTokens: 2235}` across both real rounds.

This is the first real evidence that `wiki_search_v1`'s prompt contract
(`lib/server/model-gateway/prompt/wiki-search.ts`) is actually followable
by a real model, not just satisfiable by a scripted fixture: the model
searched before answering, cited real (not invented) passages, and flagged
a real, unaddressed gap instead of overclaiming coverage.

## Real finding #3: Chinese-language runs, over multiple candidate entries, tend to exhaust the round budget instead of answering

Two follow-up real GLM runs, both `locale: "zh"`, both against the same
2-entry corpus (SIM card + metro payment text), `maxRounds: 3`,
`maxOutputTokens: 2000`:

- **上海买地铁票能用外国信用卡吗** ("Can I use a foreign credit card to buy a
  Shanghai metro ticket") -- the metro entry directly answers this
  ("外国银行卡在自助售票机上不能使用" / "foreign bank cards cannot be used at
  self-service ticket machines"). Real queries issued: `上海地铁 购票 外国信用卡`
  → `上海地铁 外卡 支付` → `上海地铁 单程票 支付方式 信用卡`. All three rounds
  were genuine `search` actions, never an `answer` -- `budget_exhausted`
  after 3 rounds, 2181 real tokens spent, despite the corpus containing a
  directly relevant passage from round 1 onward.
- **重庆坐轻轨需要提前实名预约吗** ("Does Chongqing light rail need advance
  real-name booking") -- deliberately asked against a corpus with zero
  Chongqing/light-rail content, to see whether the model would correctly
  answer `no_content`. Real queries issued: `重庆轨道交通 购票 实名 预约` →
  `重庆轨道交通` → `重庆轻轨` -- also `budget_exhausted` after 3 rounds
  (2343 tokens), never reaching an `answer` action (correct or otherwise).

**Read on this, not a fix:** in both cases the model kept rephrasing its
query (different wording each round) rather than either answering from
what it already had, or reaching the same query twice and being told
"duplicate, no new search was run" by this loop's own duplicate-detection.
This loop's dedup check (`wiki-search-job.ts`) does exact
case-insensitive string matching -- a genuine limitation against a model
that varies its Chinese phrasing round to round without changing intent.
The system prompt (`wiki-search.ts`) already tells the model "if results
don't change between rounds, stop searching and answer" -- but from the
model's own vantage point each of its queries *was* different, so that
instruction never triggered. This is a real, reproducible quality gap
distinct from the earlier findings (those were protocol/config issues;
this is a prompt-and-loop-design issue that surfaces specifically when
there's more than one candidate corpus entry and/or the query is in
Chinese). Not fixed here -- flagging it honestly rather than tuning the
probe's corpus/prompt until it happened to succeed, which would have
hidden the finding instead of reporting it.

## What was NOT verified

- **Qwen was not reachable from this sandbox** (network allowlist, see
  above) -- the key JT provided for it was never exercised.
- **Four real questions total, all against GLM (DeepSeek failed on the
  stale model id before reaching any semantic behavior; Qwen unreachable):
  one English success, two Chinese `budget_exhausted` (finding #3, above),
  one earlier English underfunded-budget failure.** This is not the frozen
  zh/en evaluation set VPJ-76 still requires -- four anecdotes, not a
  benchmark, and the real success rate so far is 1 of 4 (25%), not
  something to read as "the loop works," any more than finding #3 alone
  means "it doesn't" -- both are real, both matter, neither is the whole
  picture.
- **The two Chinese real runs never actually answered** (see finding #3)
  -- VPJ-76's "at least one zh/en answered/partial pair" requirement is
  not yet met on the zh side by this session's real evidence.
- **No adversarial/prompt-injection real input was tested.**
- **No multi-source or contradictory-source real scenario was tested** --
  the corpus only ever had one relevant entry for the question asked.
- **No real published-Wiki content was used** -- the corpus was a
  hand-written fixture, not `buildPublishedWikiCorpus`'s real
  `knowledge_read_v1` output (that would need a real authenticated
  Supabase session, not available in this sandbox -- same limitation as
  every other slice this session).
- **Cost was not reconciled against either provider's billing console** --
  token counts above are real (from each response's own `usage` field);
  actual RMB/USD cost is not independently confirmed, same caveat as every
  other real-provider probe recorded in this repo's history.
