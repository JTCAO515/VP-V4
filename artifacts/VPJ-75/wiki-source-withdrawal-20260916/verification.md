# #359 withdrawn-source dispatch barrier — 2026-09-16

Baseline: merged `origin/main` at `947485d` (PR #430,
`codex/vpj-75-359-proposal-conflicts-safety-20260916`, the structural
conflict-detection + bilingual safety-materials slice). Isolated git
worktree `vp-v4-work-round15`, branch
`round15/vpj-75-359-next-slice-20260916`. No other in-flight worktree's
files were touched.

## Result and scope

Picked from `artifacts/VPJ-75/unrun.md` and
`docs/handoff.json`'s `nextAction`, which named this item explicitly:
"the withdrawn-source dispatch barrier." VPJ-75's own acceptance criteria
(`docs/program/2026-09-05/issue-bodies/VPJ-75.md`) require "拒权或来源撤回后
不继续外发/发布" (after denial or source withdrawal, stop continuing to
dispatch/publish); every earlier VPJ-75 slice's verification doc recorded
"source withdrawal-before-provider dispatch" as explicitly UNRUN. This slice
closes that specific gap and no other. It does not touch
`detectProposalConflicts` wiring, multi-source page synthesis, or any
real-model call — those remain separately UNRUN as before.

`knowledge_review_private.source_revisions` gains `withdrawn_at`/
`withdrawn_by`/`withdrawal_reason` and a new RPC,
`public.ops_source_revision_withdraw_v1`, to set them (Ops-authenticated,
idempotent by receipt and by state). `public.ops_wiki_generation_v1` — the
one real dispatcher in this codebase, shared by both the plain
wiki-generation job and the statement-proposal job — now refuses `claim`
for a job citing an already-withdrawn source (never dispatches to the real
provider) and refuses `complete(succeeded)` if a cited source was withdrawn
during the claim-to-complete window (never persists the draft).
`complete(failed)`/`complete(cancelled)` are deliberately not blocked, so a
job stuck on a withdrawn source still has a graceful close. Full design
rationale: `docs/contracts/wiki-source-withdrawal.md`.

This is a database/RPC-level capability only — no `/ops/wiki` UI change,
no cascading revocation of a revision that already cited a source before it
was withdrawn, no automated background scan. See "What this does not do" in
the contract doc for the complete list.

## Verification

- Native PostgreSQL 16 (Homebrew `postgres`/`pg_ctl`/`initdb` at
  `/opt/homebrew/bin`, not Docker — no Docker available in this sandbox,
  same harness every prior VPJ-75 slice used):
  `tests/integration/knowledge/wiki-draft.test.mjs`, all 25 tests
  PASS/0fail/0skip, including 5 new: the new migration's rollback-then-
  commit preserves prior receipt replay; the withdraw RPC's real
  actor-authorization (`OPS_FORBIDDEN` for a non-member), idempotent
  replay and idempotent-by-state re-withdrawal (does not overwrite the
  original reason), `OPS_NOT_FOUND` and `INVALID_INPUT`; `claim()` rejects
  a source withdrawn before claim and creates neither a `wiki_pages` nor a
  `wiki_generation_jobs` row for it; `complete(succeeded)` rejects a source
  withdrawn during the real claim-to-complete window (using the actual
  `runWikiGenerationJob` fixture-transport call, not a shortcut), leaves
  the job `running` (same idiom as the existing stale-`expectedVersion`
  `OPS_CONFLICT`), and a subsequent `complete(cancelled)` on that same job
  still succeeds; the identical barrier reproduced end-to-end through the
  real `runWikiStatementProposalJob` worker path for the structured
  `wiki-draft/2` payload, proving the barrier is not specific to the plain
  `{summary,gaps}` schema.
- `pnpm test:contract`: 530/530 PASS, no regressions (this slice added no
  new contract-suite files; its new tests live in the integration suite,
  which needs a real database).
- `pnpm test:security`: 149 pass/0 fail/1 skip.
- `pnpm test:integration`: 23 pass/0 fail/76 skip (generic env-gated
  skips, same shape as every other round in this thread; the new
  native-Postgres wiki test itself is one of the 76, skipped in this run
  because `VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE` were not set for that
  invocation -- it was run separately, directly, with those set, as listed
  above).
- `pnpm evals`: 35/35 PASS, no regressions.
- `pnpm test` (static-output + design): 22/22 PASS.
- `pnpm lint` (311 files), `pnpm typecheck`, `pnpm build --webpack`,
  `pnpm docs:check`, `git diff --check`: all PASS. No TypeScript file was
  changed by this slice -- the barrier is pure SQL in a new migration,
  applied through the existing `ops_wiki_generation_v1` RPC that
  `lib/server/jobs/wiki-generation-complete.ts` already calls unmodified.
- `pnpm db:verify`: reports the local AI-08 baseline present and standard
  connection paths not-configured -- this is not real Supabase/GoTrue
  evidence, same caveat as every other round. The designated shared
  Staging project has not been touched; this migration has not been
  applied there.

Commands:

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm docs:check
git diff --check
pnpm test:contract
pnpm test:security
pnpm test:integration
pnpm evals
pnpm test
pnpm db:verify
LC_ALL=C VP_WIKI_PG_BIN=/opt/homebrew/bin \
  VP_WIKI_PG_MODULE=<local pg npm client>/lib/index.js \
  node --test tests/integration/knowledge/wiki-draft.test.mjs
```

Notes on the local harness: this sandbox has neither Docker nor the
`@embedded-postgres` package prior rounds referenced pre-installed. Native
`postgres`/`pg_ctl`/`initdb` (Homebrew `postgresql@16`) were used directly
as `VP_WIKI_PG_BIN` instead -- the test harness only needs those two
binaries on that path, and it starts/stops/`initdb`s its own disposable,
non-Docker instance exactly as the harness always has. A local `pg` npm
client package was installed into a scratch directory outside the repo for
`VP_WIKI_PG_MODULE` (not added to `package.json`, matching how prior
rounds also kept this test-only native-PG tooling out of the app's real
dependency tree). Starting a bare `initdb`+`pg_ctl` instance on this
machine additionally required `LC_ALL=C` -- without it, `postmaster became
multithreaded during startup` (a real, reproducible macOS/locale-related
Postgres startup failure, not something this slice introduced) prevented
the server from starting at all.

## Findings and limits

No implementation bug was found or fixed while building or verifying this
slice -- unlike several prior VPJ-75 slices, this one did not surface a new
defect in already-shipped code. The one real environment issue encountered
(`postmaster became multithreaded during startup` without `LC_ALL=C`) was a
local test-harness/OS environment condition, not a codebase defect, and did
not require a code change.

UNRUN: this barrier has not been exercised against the real, designated
shared Staging project (no migration applied there), a real GoTrue session,
or a real LLM call -- consistent with every other VPJ-75 slice run in this
sandbox. No `/ops/wiki` UI surfaces withdrawal or lets an Ops reviewer see
that a page's cited source has since been withdrawn (cascading revocation
is explicitly out of scope, see the contract doc). The claim-to-complete
race is reproduced by withdrawing the source between a real (fixture-
transport) provider call and the `complete` RPC call, not by withdrawing
literally mid-HTTP-request against a real network call. No real killed OS
process. Real per-call RMB cost reconciliation, multi-source page
synthesis, `detectProposalConflicts` UI wiring, and Docling integration
remain exactly as UNRUN as before this slice -- none of those were in
scope here.

Rollback: disable by not calling the new RPC and not citing a withdrawn
source; the migration is additive-only (new nullable columns, new
function, `create or replace` on the existing dispatcher preserving its
prior behavior for every non-withdrawn-source path) and rolls back cleanly
as verified above. #359 remains open; this slice does not close it.
