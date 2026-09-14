# #359 slice 2 verification — dispatcher RPC + real LLM wiring

## Environment

Real local Supabase, project_id `vp-v4-ai-08`. Real GoTrue user created via
the admin API, signed in for a real password-grant session (JWT + real
`session_id`), matching the pattern the repo already established (raw SQL
inserts into `auth.users` don't work for real sign-in; the admin REST API
does).

Real Qwen API calls via `lib/server/jobs/wiki-generation-job.ts`, key
supplied by the operator this session, stored only in
`lib/server/jobs/.local/.env` (git-ignored, verified with
`git check-ignore -v`), never echoed or committed. Operator authorized a
小额探针 budget (≤¥1-equivalent token cap); actual usage (640 and 513 total
tokens across two calls) stayed far under that.

## Dispatcher RPC (`public.ops_wiki_generation_v1`)

All of the following called through a real signed JWT via `@supabase/supabase-js`, going through real PostgREST, not direct SQL:

| # | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 1 | Fresh claim | `kind: "claimed"` | PASS |
| 2 | Duplicate claim, same `(page_key, input_digest)`, job still `running` | `OPS_CONFLICT` | PASS |
| 3 | `complete` with wrong `expectedVersion` | `OPS_CONFLICT` | PASS |
| 4 | `complete` with correct `expectedVersion` | `kind: "succeeded"`, revision created, page version → 1 | PASS |
| 5 | Re-claim same `(page_key, input_digest)` after success | `kind: "already_succeeded"`, no new job | PASS |
| 6 | Same `operationId` + identical input, called twice | identical result both times (receipt replay) | PASS |
| 7 | Same `operationId`, different input | `OPS_CONFLICT` | PASS |
| 8 | `complete` on an already-terminal job | `OPS_CONFLICT` | PASS |
| 9 | Fresh job → `complete` with `failed` outcome | job closed with `error_code` | PASS |
| 10 | Re-claim after a `failed` job, same `(page_key, input_digest)` | reopens the **same job row** (identical `jobId`) as `running` | PASS |

## Real LLM calls (not fixture, not mocked transport)

Two separate real calls to `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`:

1. Standalone probe (museum admission/hours source text) — 640 total
   tokens, valid `{summary, gaps}` output, no fabricated facts beyond the
   source.
2. Full-loop probe (aquarium shark tank tour source text) — 513 total
   tokens, valid output, then fed through `claim` → `complete(succeeded)` →
   verified in the database: `wiki_pages.version = 1`,
   `wiki_generation_jobs.status = 'succeeded'`, `cost_tokens = 513`,
   `cost_unknown = false`, one `wiki_page_revisions` row at `version = 1`.

Neither call's system prompt, output, or key was ever logged or persisted
beyond the single test run; the destination receipts (`configured` →
`attempted` → `response_buffered`) were captured and confirmed correct
without ever containing the API key.

## The one real gap found by doing this for real

Running the full loop end-to-end surfaced that `wiki_page_revisions` has
**no column to hold the actual generated content** — only a ≤400-char
`change_note`. The real model output (`{summary, gaps}`) had nowhere
durable to go; the probe truncated it into `change_note` as a stopgap,
which is not a real solution. Recorded as a genuine schema gap in
`docs/contracts/wiki-generation-dispatch.md` and `artifacts/VPJ-75/unrun.md`
rather than worked around silently.

## Tests and checks

- `tests/contract/knowledge/wiki-generation-job.test.mjs` — 7/7 pass
  (injected-transport fixture tests; no real spend in CI).
- `node scripts/run-ci-suite.mjs contract` — 358/358 pass (7 new; 351
  before this slice, no regressions from touching the shared
  `provider-protocol.ts` file).
- `npm run typecheck` / `npm run lint` — clean.
- Scratch verification scripts (`scripts/vpj75-*.local.mjs`) used for the
  real RPC/LLM runs above were deleted after use — not committed.

## Cleanup

- Local test actor and its `knowledge_review_private.members` row existed
  only in the local disposable Supabase instance, wiped by
  `supabase db reset --local`.
- `lib/server/jobs/.local/.env` (real API keys) remains locally only,
  git-ignored, never committed.
