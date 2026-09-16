# VPJ-75 slice 2 (#359) — generation dispatcher + real LLM wiring

Status: historical slice 2 evidence follows. Slice 3 extends completion with full
body persistence and an Ops reader; see [draft persistence](wiki-draft-content.md).

Slice 2 supplied the first real end-to-end path. `public.ops_wiki_generation_v1`
is a claim/complete dispatcher RPC over slice 1's schema, and
`lib/server/jobs/wiki-generation-job.ts` is the first real LLM call in this
codebase for wiki generation — verified against the real Qwen API, not a
fixture, under operator authorization for real spend.

## Why claim/complete, not one RPC

Postgres cannot make an outbound HTTPS call. The dispatcher can only
reserve a job (idempotently) and record its outcome; the actual model call
happens in the application between those two RPC calls:

1. `{action: "claim", ...}` — reserves `(page_key, input_digest)`, returns
   a `jobId` and the page's `expectedVersion`. Reusing the exact same
   `operationId` replays the stored receipt (no duplicate reservation).
   Calling `claim` again for a `page_key` whose input has already
   `succeeded` returns `already_succeeded` immediately — no new job, no new
   LLM call.
2. The application calls `runWikiGenerationJob()` (real HTTP to the
   provider) completely outside the database.
3. `{action: "complete", jobId, outcome: {...}}` — reports the outcome.
   `succeeded` requires `expectedVersion` to still match the page's current
   `version`; a concurrent edit between claim and complete is rejected as
   `OPS_CONFLICT`, not silently overwritten. `failed`/`cancelled` close the
   job without touching `wiki_pages`/`wiki_page_revisions` at all.

## Real bug avoided by explicit state checks

A job stuck in `running` — worker crashed between claim and complete — is
**not silently reclaimable**. Attempting to `claim` the same
`(page_key, input_digest)` while a job is `running` raises `OPS_CONFLICT`
rather than starting a second concurrent attempt. This makes a crashed
worker visible (the job just sits in `running`) instead of allowing two
processes to race on the same generation. **A staleness sweep to actually
reclaim a truly-dead `running` job is not built in this slice** — see
Non-goals.

**Update 2026-09-15**: reclaim is now built, with a fencing token to
close the race a naive "just let claim proceed after a timeout" fix would
have (a late completion from the original, now-superseded holder). See
[wiki-job-reclaim.md](wiki-job-reclaim.md).

## Real verification performed

All of the following used a real local Supabase instance (real GoTrue
user, real signed JWT, real PostgREST) and, for the LLM call, the real
Qwen API — under explicit operator authorization for real spend, with the
API key stored only in a local, git-ignored file
(`lib/server/jobs/.local/.env`), never committed or echoed:

- claim → complete(succeeded) → revision created at version 1.
- Duplicate claim for the same `(page_key, input_digest)` while the first
  is `running` → `OPS_CONFLICT`.
- `complete` with a stale `expectedVersion` → `OPS_CONFLICT`.
- `complete` with the correct `expectedVersion` → succeeds.
- Re-`claim` after success → `already_succeeded`, no new job or LLM call.
- Idempotent replay: identical `operationId` + input twice → identical
  result (receipt replay, not a second write).
- Same `operationId`, different input → `OPS_CONFLICT` (receipt mismatch).
- `complete` on a job that is not `running` (already terminal) →
  `OPS_CONFLICT`.
- Fresh job → `failed` outcome → job closed with `error_code`.
- Re-`claim` after a `failed` job (same page_key/input_digest) → reopens
  the **same job row** as `running` again (retry, not a new row) — proven
  by the identical `jobId` across claim/fail/re-claim.
- **Two real Qwen calls** through `runWikiGenerationJob()` (not a mocked
  transport): both returned a validated `{summary, gaps}` JSON object, no
  hallucinated facts beyond the supplied source text, real token usage
  (640 and 513 total tokens respectively — well under the operator's
  小额探针 cap), and a real `wiki_page_revisions` row was created end-to-end
  through claim → real call → complete.

## Non-goals of this slice

- ~~No stale-`running`-job reclaim/sweep~~ **DONE 2026-09-15**, see
  [wiki-job-reclaim.md](wiki-job-reclaim.md).
- **No structured statement/relation extraction.** The model only produces
  `{summary, gaps}` — no subject/predicate/object statements, no linking
  individual claims to spans. `statement_refs` exists in the schema but
  nothing populates it yet.
- **No durable storage of the generated draft content itself.**
  `wiki_page_revisions.change_note` is a ≤400-char human-facing note, not
  the actual draft body — the real Qwen probe's full `{summary, gaps}`
  output was only ever held in the RPC caller's memory and a truncated
  echo went into `change_note`. **This is a real schema gap found while
  running the full loop for real**, not by design: slice 1's schema has no
  column to durably store what the model actually produced. A follow-up
  slice needs a `draft_content jsonb` (or similar) column before any Ops
  review UI can show a real generated draft.
- **No Ops diff-review UI** — nothing surfaces a claimed/completed job to
  a human reviewer yet.
- **No multi-source synthesis, contradiction handling, or Docling
  integration** — unchanged from slice 1's non-goals.
- **No production route/dispatch schedule** — `ops_wiki_generation_v1` is
  callable but nothing invokes it outside this slice's manual verification.
- ~~No withdrawn-source dispatch barrier~~ **DONE 2026-09-16**, see
  [wiki-source-withdrawal.md](wiki-source-withdrawal.md). A source withdrawn
  before `claim` is never claimed (never dispatched to the real provider); a
  source withdrawn between `claim` and `complete` blocks that completion
  from being persisted (never published as a draft revision).

## Real cost

Two real Qwen calls, 640 + 513 total tokens. Actual RMB cost was not
independently reconciled against Qwen's billing console (same "price
unknown" caveat as every other real-provider probe in this session) — the
operator authorized a 小额探针 (≤¥1-equivalent token cap) budget, and the
actual token counts observed are far under that authorized cap.
