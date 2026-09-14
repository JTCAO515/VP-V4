# VPJ-75 slice 3 (#359) — durable draft content storage

Status: implemented and verified against a real (standalone, non-Docker)
local Postgres 16 instance, including a real round trip through
`ops_wiki_generation_v1` as an authenticated actor. **Not yet pushed or
opened as a PR** — see the Environment note below for exactly what that
means and what a session with GitHub access still needs to do.

## The gap this closes

Slice 2's real end-to-end run (`docs/contracts/wiki-generation-dispatch.md`,
"Non-goals") found that `wiki_page_revisions` had no column to durably hold
the model's actual `{summary, gaps}` output — only a ≤400-char `change_note`
survived past the RPC caller's memory. A real Qwen response was generated
and then effectively discarded once the process exited.

## What changed

`supabase/migrations/20260915090000_vpj_75_359_wiki_draft_content.sql`:

- Adds `wiki_page_revisions.draft_content jsonb not null`.
- Backfills any already-applied row from `change_note` (so the column can
  go `NOT NULL` without breaking existing revisions); a backfilled row has
  an empty `gaps` array because slice 2 never captured gaps durably.
- Adds `wiki_page_revisions_draft_content_shape` CHECK, reusing the
  existing `knowledge_review_private.closed_object()` helper (same one the
  RPC input validation already uses) so the constraint logic doesn't drift
  from the RPC's own validation: exactly `{summary, gaps}`, `summary` 1–600
  chars, `gaps` an array of at most 5 entries. Per-string bounds on each
  gap stay an application-layer concern — Postgres has no per-array-element
  CHECK.
- `create or replace function public.ops_wiki_generation_v1` (same function,
  new migration — the applied `20260914120000` migration is not edited):
  the `complete`/`succeeded` branch now requires `outcome.draftContent`
  (added to the closed-object key list), validates its shape identically to
  the new column CHECK, and inserts it into `wiki_page_revisions.draft_content`
  alongside the existing `change_note`.

`lib/server/knowledge/wiki/contract.ts`: `WikiPageRevision.draftContent`
added as a required field, typed as `WikiGenerationDraftOutput` (imported
from `lib/server/model-gateway/prompt/wiki-generation.ts` — the same type
`isValidWikiGenerationDraftOutput` already validates model output against).
`isValidWikiPageRevision` now rejects a revision missing `draftContent` or
carrying anything outside the closed `{summary, gaps}` shape.

`tests/contract/knowledge/wiki-schema.test.mjs`: existing revision fixtures
updated to include `draftContent`; new test asserts `draftContent` is
required and stays closed (no caller can smuggle extra fields, and a
missing `gaps` key fails).

## What this slice deliberately does not do

- **No caller wiring.** Nothing in this slice changes what
  `wiki-generation-job.ts`'s caller sends to `ops_wiki_generation_v1` — that
  wiring (constructing `outcome.draftContent` from the job's real output at
  the call site) does not exist as a standalone module yet; slice 2's
  verification exercised the RPC directly. The next slice to touch this
  (Ops diff review UI) is the first consumer that needs a real
  claim→run→complete caller, and should wire `draftContent` through then
  rather than inventing an unused wiring module now.
- **No Ops diff-review UI.** Still nothing shows a revision's
  `draft_content` to a human reviewer — this slice only makes the data
  reachable.
- **No stale-`running`-job reclaim/sweep, statement extraction, Docling
  integration, or contradiction handling** — unchanged from slice 2's
  non-goals; still open per `artifacts/VPJ-75/unrun.md`.

## Environment note

This slice started in a sandbox without `node`, `pnpm`, `docker`, the
Supabase CLI, or push credentials for this repository's GitHub remote.
`node`/`pnpm`/`gh` were installed via Homebrew during this session, closing
most of that gap:

- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all pass, run for
  real.
- `pnpm test:contract` — 359/359 pass, 0 skipped, 86 test files, run for
  real (includes the updated `wiki-schema.test.mjs`).
- The migration was applied — and verified with real INSERT/UPDATE/RPC
  calls, including deliberate counterexamples and a real
  `ops_wiki_generation_v1` claim→complete round trip as an authenticated
  actor — against a real, standalone (non-Docker) local Postgres 16
  instance with a minimal hand-built `auth` schema stand-in. This is
  **not** the project's own `supabase db reset --local` flow (no Docker
  available), and not real GoTrue/PostgREST. See
  `artifacts/VPJ-75/359-wiki-draft-content-slice3-20260915/verification.md`
  for exactly what that means and its limits.

Still not done: the branch has not been pushed and no PR has been opened —
this sandbox has `gh` installed now but no stored credentials for
`github.com/JTCAO515/VP-V4`. A session with real Supabase CLI/Docker access
should still re-run this against the project's actual local stack before
treating it as equivalent to slice 1/2's evidence bar.
