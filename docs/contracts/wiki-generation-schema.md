# VPJ-75 slice 1 (#359) — wiki page/revision/job data model

Status: accepted, schema and pure TS mirror only. No RPC, no worker, no LLM
call — this is the persistence and idempotency foundation a later slice
wires a real generation dispatcher onto. Follows VPJ-74's slicing pattern
(schema first, wiring later).

## Invariants

- `wiki_pages.page_key` is globally unique — one canonical page per key,
  ever. Callers derive it with `derivePageKey()` in
  `lib/server/knowledge/wiki/contract.ts`.
- `wiki_generation_jobs` is keyed `(page_key, input_digest)`, unique. A
  retried or resumed job for identical input **updates the same row**
  rather than inserting a new one — this is what makes "same input never
  rebuilds a page" true by construction, not by an application-level
  duplicate check.
- Job status is a real state machine, enforced by the database, not just
  application code:
  - `queued` ⇔ `started_at is null`.
  - A terminal status (`succeeded`/`failed`/`cancelled`) ⇔ `finished_at is
    not null`.
  - `error_code` is set if and only if `status = 'failed'`.
  - `cost_unknown = false` requires `cost_tokens is not null` — a settled
    cost always carries a number; an unsettled/crashed job may finish
    without ever learning its cost (`cost_unknown` stays `true`).
- `wiki_page_revisions` is unique on `(page_id, version)` — no silently
  overwriting or skipping a version number. `source_revision_ids` must be
  non-empty: **every revision must link to at least one source revision.**
- **A real finding from this slice's verification**: the first cut of the
  non-empty-array check used `array_length(source_revision_ids, 1) >= 1`.
  Postgres's `array_length()` returns `NULL` (not `0`) for an empty array,
  and a `NULL` result in a `CHECK` constraint is treated as passing — this
  actually admitted an empty array on a real local Postgres before the fix.
  Corrected to `cardinality(source_revision_ids) >= 1`, which returns `0`
  for an empty array. Re-verified: the same counterexample that previously
  succeeded now correctly fails.
- `config_digest`/`input_digest` are validated as 64-char lowercase hex
  (a SHA-256 digest shape) at both the database (`~ '^[0-9a-f]{64}$'`) and
  TS (`DIGEST` regex) layers — no free-form strings.
- Private schema (`knowledge_review_private`), same defense-in-depth stance
  as its existing tables: RLS enabled, all direct grants revoked from
  `anon`/`authenticated`/`service_role`. A future dispatcher RPC (security
  definer, following the existing `ops_review_workspace` pattern) is the
  only intended access path.

## Non-goals of this slice

- No generation dispatcher RPC, no LLM/model-gateway wiring, no actual
  worker process.
- No Ops diff-review UI.
- No Docling/parser integration.
- No contradiction/conflict handling logic between revisions.
- No expectedVersion-conflict RPC (the `version` column exists on
  `wiki_pages`; the optimistic-concurrency check on write is a later
  slice's dispatcher, following the same `expectedVersion` pattern already
  used in `ops_review_workspace_publication_v1`).

## Verification

- Migration applied via `supabase db reset --local` (full history, cold
  replay) and via `supabase db push --local` (incremental) — both succeed
  cleanly on this project.
- Real inserts against a local Postgres: one full happy-path row across
  all three tables, plus 7 counterexamples — queued-with-started_at,
  failed-without-error_code, succeeded-claiming-known-cost-without-tokens,
  duplicate `(page_key, input_digest)`, empty `source_revision_ids` (the
  finding above), duplicate `(page_id, version)`, and a malformed digest —
  all correctly rejected after the fix.
- `tests/contract/knowledge/wiki-schema.test.mjs` — 8/8 pass.
- `node scripts/run-ci-suite.mjs contract` — 351/351 pass (8 new, no
  regressions from the prior 343).
- `npm run typecheck` / `npm run lint` / `npm run docs:check` — all clean.
