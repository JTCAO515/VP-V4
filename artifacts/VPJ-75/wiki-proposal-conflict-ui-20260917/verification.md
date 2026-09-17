# #359 wiring `detectProposalConflicts` into the persisted draft body and `/ops/wiki` UI — 2026-09-17

Baseline: merged main `1dfa974e98198337bf6a641b92030a1475054a98` (PR #431, the
withdrawn-source dispatch barrier). Isolated git worktree
`vp-v4-work-round16`, branch `round16/vpj-75-359-next-slice-20260917`.

## Result and scope

`docs/handoff.json`'s `nextAction` and `artifacts/VPJ-75/unrun.md` both
named "wiring `detectProposalConflicts` into the persisted draft body and
the `/ops/wiki` UI" as the next concrete, bounded gap after the prior
round's structural-conflict-detection slice shipped the function unwired.
This round wires it: a new pure `conflictsByProposal` helper
(`lib/server/knowledge/wiki/proposals.ts`) reshapes the flat conflict list
into a per-proposal-index lookup, and `app/ops/wiki/workspace.tsx` renders a
bilingual `role="alert"` warning next to every conflicting proposal, in both
the current revision's proposal list and each historical revision's detail
view. This is client-side-only: no new fetch, no new field, no migration, no
change to `ops_wiki_read_v1` or `handleWikiRequest`'s existing "returns the
RPC payload verbatim" contract.

This does not add semantic contradiction detection, real-model verification
of whether the model correctly describes a conflict, multi-source page
synthesis, or cascading revocation of an already-created revision whose
source is withdrawn later — none of those were in scope and none are
claimed done.

## Actual verification

- New unit coverage: `tests/contract/knowledge/wiki-proposals.test.mjs`
  gained 4 tests for `conflictsByProposal` (empty input, pairwise symmetry,
  three-way accumulation preserving order, and agreement with a real
  `detectProposalConflicts` output on a three-proposal draft).
- Real database round trip: `tests/integration/knowledge/wiki-draft.test.mjs`
  was extended so the existing statement-proposal fixture now includes a
  second, deliberately conflicting proposal (same `subjectId`/`predicate`/
  `scene`, overlapping city, different `objectId`). A new assertion runs
  after the real `runWikiStatementProposalJob` → real
  `ops_wiki_generation_v1` `complete()` → real native PostgreSQL process
  restart → real `ops_wiki_read_v1` readback, proving the round-tripped
  `draftContent` (through jsonb storage and HTTP JSON serialization) still
  drives `detectProposalConflicts`/`conflictsByProposal` to the exact
  expected result. Full file: 26/26 pass/0 fail/0 skip (native Homebrew
  PostgreSQL 16, `LC_ALL=C`, per the same local-environment workaround
  documented in the prior round's verification).
- Real browser verification via the repo's existing
  `VP_WIKI_BROWSER_FIXTURE=1` loopback fixture: built the real production
  bundle (`next build --webpack`), started it on port 3196, ran
  `tests/integration/knowledge/wiki-draft.test.mjs` with
  `VP_WIKI_BROWSER_FIXTURE=1` (25/25 body assertions pass before the fixture
  opens), then used a real browser session against
  `http://127.0.0.1:3197/ops/wiki` (real Next.js SSR/CSR, real request
  handlers, real native PostgreSQL; auth is SQL-claims actor injection, not
  GoTrue). Looked up `pageKey=source_summary:proposal_fixture`:
  - Chinese (default locale): both proposals show
    "⚠ 与提案 #2 冲突（对象不同），需人工核实，不会自动合并或丢弃任一方。" and
    "⚠ 与提案 #1 冲突（对象不同），需人工核实，不会自动合并或丢弃任一方。"
    respectively, in the current-revision proposal list.
  - Expanding "此版本的声明提案 (2)" in the historical-revision detail block
    shows the same conflict pair with the shorter in-detail copy
    ("⚠ 与提案 #2 冲突（对象不同）").
  - Switching the language selector to English re-renders the same page with
    "⚠ Conflicts with proposal #2 (different object); needs manual review,
    neither is auto-merged or dropped."
  - The "Verify and edit this proposal" / "核对并编辑此提案" link remained
    present next to each flagged proposal — the conflict is advisory, not
    blocking.
  - Fixture was cleanly stopped via `POST /fixture/stop` after the check;
    the disposable database directory was removed by the test's own
    cleanup; the `next start` process on port 3196 was killed afterward.
- Full check suite on the final diff:
  - `pnpm lint` (`node scripts/lint.mjs`): pass, 311 files checked.
  - `pnpm typecheck` (`tsc --noEmit`): pass, no errors.
  - `next build --webpack`: pass (production build succeeded; used for the
    browser fixture above).
  - `pnpm test:contract`: 534/534 pass (baseline 530 + 4 new
    `conflictsByProposal` tests), 0 fail, 0 skip.
  - `pnpm evals`: 35/35 pass, no regression.
  - `pnpm test` (static-output + design foundation): 22/22 pass.
  - `pnpm test:security`: 149 pass / 0 fail / 1 skip — matches the most
    recent prior round's (PR #431, withdrawn-source barrier) recorded clean
    149/0/1 baseline; no new failures introduced by this diff.
  - `pnpm test:integration` (generic suite, excludes the native-Postgres
    opt-in file run separately above): 23 pass / 0 fail / 76 skip —
    unchanged from baseline.
  - `pnpm docs:check`: pass.
  - `git diff --check`: pass, no whitespace errors.
  - `pnpm db:verify`: reports `database-baseline-present` /
    `not-configured` for all three RPC paths, identical to before this
    change — expected, since this round touches no
    `supabase/migrations/**` file and does not connect to any Supabase
    project.

All provider/model calls anywhere in this diff's tests are scripted
fixtures or absent; this round made zero paid calls. Auth in both the
native-PostgreSQL test and the browser fixture is the repository's existing
SQL-claims actor injection, not real GoTrue/JWT.

## Reproduction

```sh
LC_ALL=C VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@16/bin \
  VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
  node --test tests/integration/knowledge/wiki-draft.test.mjs
node scripts/run-ci-suite.mjs contract
node scripts/run-ci-suite.mjs evals
node scripts/run-ci-suite.mjs security
node scripts/run-ci-suite.mjs integration
node --test tests/static-output.test.mjs tests/design/web-06-foundation.test.mjs
node scripts/lint.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
node scripts/docs-check.mjs
node scripts/db-verify.mjs
git diff --check

# Browser fixture (separate terminal for the server):
node node_modules/next/dist/bin/next start -p 3196 &
LC_ALL=C VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@16/bin \
  VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
  VP_WIKI_BROWSER_FIXTURE=1 node --test tests/integration/knowledge/wiki-draft.test.mjs
# once BROWSER_FIXTURE_READY prints, open http://127.0.0.1:3197/ops/wiki
# and look up pageKey source_summary:proposal_fixture
curl -X POST http://127.0.0.1:3197/fixture/stop
```

`VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE` point at Homebrew's native
`postgresql@16` binaries and a `pg` npm package installed into a scratch
directory in a prior round (this sandbox has neither Docker nor a
pre-installed `@embedded-postgres` package, same environment condition
recorded in the prior two rounds' verification docs).

## Remaining scope

UNRUN, unchanged from before this round: real-model verification of whether
a model's own `gaps` field correctly narrates a detected conflict (the
detection itself is structural, not semantic, by design); true multi-source
page *synthesis* (combining several sources into one narrative, as opposed
to evidence-binding, which was already covered); cascading revocation of an
already-created `wiki_page_revisions` row whose cited source is withdrawn
after that revision was created; automated scanning of in-flight jobs
against newly-withdrawn sources; real per-call RMB cost reconciliation;
Docling/parser integration. #359 remains OPEN; this PR advances it but does
not complete it.

Rollback: revert `conflictsByProposal` in `lib/server/knowledge/wiki/
proposals.ts`, the two render sites in `app/ops/wiki/workspace.tsx`, and the
`.conflict` CSS rule in `app/ops/review/workspace.module.css`. No migration,
no RPC, no read-model field changed, so rollback has no data-shape
implications. The extended integration-test fixture (second proposal) can
be reverted independently without affecting any other assertion in that
file, since every other assertion in it still only references proposal
index 0.
