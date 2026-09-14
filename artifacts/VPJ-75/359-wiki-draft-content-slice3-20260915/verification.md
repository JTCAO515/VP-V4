# #359 slice 3 verification — durable draft content storage

## Environment

This sandbox originally had no `node`/`pnpm`/`docker`/Supabase CLI and no
GitHub push credentials. `node`, `pnpm` and `gh` were installed via
Homebrew (`brew install node pnpm gh`) during this session. **Docker is
still not available**, so the project's own `supabase db reset --local` /
`supabase start` flow (what slice 1/2 used, giving them real GoTrue +
PostgREST) could not be run.

Instead, `postgresql@16` was installed via Homebrew and run as a standalone
local instance (`initdb` + `pg_ctl`, isolated data dir, port 55432, no
service registered — stopped again once this verification finished). On
top of that, a minimal hand-built stand-in for what Supabase's Docker image
normally pre-provisions was created: schema `auth` with `auth.users`/
`auth.sessions` tables shaped like Supabase's, `auth.uid()`/`auth.jwt()`
functions reading the same `request.jwt.claim.sub` / `request.jwt.claims`
GUCs PostgREST sets (matching Supabase's real definitions), and the
`anon`/`authenticated`/`service_role` roles the migrations grant to. **This
is not a real Supabase project** — no GoTrue, no PostgREST, no Realtime,
no Storage. It is real Postgres 16 executing real SQL, with a JWT claim
simulated by directly setting session GUCs instead of a real signed token
going through real HTTP. Where that distinction matters, it is called out
below.

All 54 migrations in `supabase/migrations/` (the full real history, ending
with this slice's own `20260915090000_vpj_75_359_wiki_draft_content.sql`)
were applied in order against this instance and succeeded with zero errors
— this is a real, meaningful check that the new migration doesn't conflict
with anything in the actual applied schema, not a hand-review claim.

## What was actually verified (real Postgres, not fixture)

All of the following ran as real SQL against the instance above, inside
transactions rolled back afterward so nothing was left behind.

### Direct CHECK constraint tests (bypassing the RPC, testing the column constraint itself)

| # | Scenario | Expected | Result |
| --- | --- | --- | --- |
| T1 | `draft_content = {"summary": "...", "gaps": []}` | INSERT succeeds | PASS |
| T2 | `draft_content` missing `gaps` key | CHECK violation | PASS |
| T3 | `draft_content` has an extra key beyond `summary`/`gaps` | CHECK violation | PASS |
| T4 | `summary` is an empty string | CHECK violation | PASS |
| T5 | `gaps` array has 6 entries (max is 5) | CHECK violation | PASS |
| T6 | `gaps` is a JSON object, not an array | CHECK violation | PASS |

### Backfill correctness (T7)

Simulated a pre-slice-3 row by temporarily dropping the `NOT NULL`/CHECK,
inserting a row the old way (`draft_content = null`, `change_note =
'pre-slice-3 legacy row'`), then re-running this migration's exact backfill
`UPDATE` and re-adding the constraints. Result: the row's `draft_content`
became `{"gaps": [], "summary": "pre-slice-3 legacy row"}` — matches the
migration's intent exactly, and passes the shape constraint once re-added.

### Real RPC round trip through `public.ops_wiki_generation_v1` (T8–T11)

Ran as role `authenticated` with a simulated signed-in session (real row in
`auth.users`/`auth.sessions`, real row in
`knowledge_review_private.members` with `active = true`, `request.jwt.claim.sub`
and `request.jwt.claims` GUCs set to match) — i.e. through
`knowledge_review_private.current_actor()`'s real logic, not bypassed.

| # | Scenario | Expected | Result |
| --- | --- | --- | --- |
| T8 | `claim` for a fresh `(pageKey, inputDigest)` | `kind: "claimed"` | PASS |
| T9 | `complete(succeeded)` **without** `outcome.draftContent` | `INVALID_INPUT` | PASS — raised at the exact new validation line added this slice |
| T10 | `complete(succeeded)` **with** a valid `draftContent` | `kind: "succeeded"`, revision created | PASS |
| T11 | Read back the persisted row | `draft_content` matches exactly what was sent | PASS — `{"gaps": ["gap one"], "summary": "Real RPC round trip draft."}` |

This proves the new `outcome.draftContent` validation branch in
`ops_wiki_generation_v1` (added this slice) actually rejects a missing
`draftContent` and actually persists a valid one into the new column,
through the real function, not by inspection.

## What was NOT verified

- **No real GoTrue/PostgREST.** The signed-in session was simulated by
  setting `request.jwt.claim.sub`/`request.jwt.claims` directly rather than
  a real password-grant login producing a real JWT that a real PostgREST
  instance validates. `current_actor()`'s SQL logic ran for real; the HTTP
  auth layer in front of it did not.
- **`pnpm test:contract` (359/359) and `pnpm lint`/`pnpm typecheck`/
  `pnpm docs:check` all pass** with this slice's TS changes (`contract.ts`,
  `wiki-schema.test.mjs`) — run for real in this session. These do not
  exercise the database at all (pure `node:test` unit tests); the DB checks
  above are what actually exercised the new migration.
- **No real LLM call** in this slice — that was slice 2's scope, unchanged
  here.
- **No caller wiring.** Nothing calls `ops_wiki_generation_v1` with a real
  `draftContent` from `runWikiGenerationJob()`'s actual output outside this
  manual verification script — see
  `docs/contracts/wiki-generation-draft-content.md`'s "what this slice
  deliberately does not do".
- **Branch not pushed.** `feat/vpj-75-359-wiki-draft-content` exists in a
  local clone in this sandbox. `gh`/`git` are now installed but this
  sandbox has no credentials for `github.com/JTCAO515/VP-V4` — push and PR
  creation need to happen from a session that does (see the operator
  hand-off note for exact commands).

## Cleanup

The standalone Postgres instance and its data directory were stopped and
removed at the end of this session; nothing was left running.
