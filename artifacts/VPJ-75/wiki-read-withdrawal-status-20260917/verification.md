# #359 surfacing a cited source's withdrawal status in `/ops/wiki` — 2026-09-17 (round 17)

Baseline: merged main `f5b468ba763203894d390b9f0904d36c421bf08f` (PR #432,
wiring `detectProposalConflicts` into the draft body and `/ops/wiki` UI).
Isolated git worktree `vp-v4-work-round17`, branch
`round17/vpj-75-359-next-slice-20260917`.

## Result and scope

`docs/contracts/wiki-source-withdrawal.md`'s "What this does not do" section
named this explicitly: "No `/ops/wiki` UI for withdrawing a source or
seeing withdrawal status — this is a database/RPC-level capability only."
This round addresses the "seeing withdrawal status" half only (the withdrawal
*action* itself, a write path, remains unbuilt — see
`docs/contracts/wiki-source-withdrawal-status-ui.md`'s "What this does not
do").

- New migration `supabase/migrations/20260917100000_vpj_75_359_wiki_read_withdrawal_status.sql`
  `create or replace`s `public.ops_wiki_read_v1` to add three already-existing
  `source_revisions` columns (`withdrawn_at`/`withdrawn_by`/`withdrawal_reason`,
  added by the prior slice's migration `20260916120000`) to each source
  object it already returns. Nothing else in the function changes; no other
  RPC is touched; no table, row, or write path changes.
- `lib/server/knowledge/wiki/read-model.ts`'s `WikiRead` type gains the
  matching `withdrawnAt`/`withdrawnBy`/`withdrawalReason` fields on
  `sources[]`.
- `app/ops/wiki/workspace.tsx` renders a bilingual `role="alert"` line under
  any source whose `withdrawnAt` is non-null, inside the existing "Sources
  and original location" `<details>` block for each revision. The note
  explicitly says an already-generated draft is not automatically retracted
  or hidden — it is advisory only, and every existing action (e.g. "prepare
  a statement from this version") remains available next to it.

This does not add a withdrawal action to `/ops/wiki`, cascading revocation
of an already-created revision, an automated scan/notification for newly
withdrawn sources, real-model verification, or multi-source page synthesis
— none of those were in scope and none are claimed done.

## Actual verification

- Real database round trip: `tests/integration/knowledge/wiki-draft.test.mjs`
  gained two new subtests, both against real native PostgreSQL 16 (Homebrew,
  `LC_ALL=C`, no Docker in this sandbox — same environment workaround
  recorded in every prior VPJ-75 slice):
  - `read-withdrawal-status migration rolls back cleanly and preserves prior
    receipt replay`: persists a real revision (via
    `runWikiGenerationJob` → `ops_wiki_generation_v1` `claim`/`complete`)
    that cites a fresh source **before** the new migration is applied,
    confirms the new fields are absent, applies the migration inside
    `begin;...rollback;`, confirms the fields are still absent (transactional
    reversibility), then applies it for real with `begin;...commit;` and
    confirms the fields now exist — and that every pre-existing field of an
    unrelated page's read output (the file's original `pageKey` fixture) is
    byte-identical to before the migration, proving this is a pure additive
    change to the read shape.
  - `read model surfaces a cited source's withdrawal status without
    altering the already-persisted revision`: calls
    `ops_source_revision_withdraw_v1` on the already-cited, already-persisted
    source, then re-reads via `ops_wiki_read_v1` and asserts (a) the withdrawn
    fields are populated with the real actor id, timestamp, and reason; (b)
    the revision's `version`, `draftContent`, and `validationStatus` are
    byte-identical before and after — no cascading revocation; (c) an
    unrelated page's sources still read `null` for all three fields,
    proving this is a genuine per-source lookup and not a page-wide or
    always-on flag.
  - Full file: 28/28 pass / 0 fail / 0 skip.
- Real browser verification via the repo's existing
  `VP_WIKI_BROWSER_FIXTURE=1` loopback fixture: built the real production
  bundle (`next build --webpack`), started it on port 3196, ran
  `tests/integration/knowledge/wiki-draft.test.mjs` with
  `VP_WIKI_BROWSER_FIXTURE=1` (28/28 body assertions pass before the fixture
  opens), then drove a real browser session against
  `http://127.0.0.1:3197/ops/wiki` (real Next.js SSR/CSR, real request
  handlers, real native PostgreSQL; auth is SQL-claims actor injection, not
  GoTrue):
  - Looked up `pageKey=source_summary:read-withdrawal-fixture`, expanded
    "来源与原文位置 (1)": the source shows
    "⚠ 此来源已于 2026/9/17 09:42:45 被撤回（原因：Withdrawn after the revision
    was already persisted, to prove the read model surfaces this without
    altering the revision.）。基于此来源已生成的草稿不会被自动撤销或隐藏，请人工
    核实其是否仍可信。" with `role="alert"` (confirmed via the accessibility
    tree, not just visible text), and "根据此版本整理声明" ("Prepare a
    statement from this version") remained a live link next to it.
  - Switched the language selector to English: the same source now shows
    "⚠ This source was withdrawn on 9/17/2026, 9:42:45 AM (reason: Withdrawn
    after the revision was already persisted, to prove the read model
    surfaces this without altering the revision.). Drafts already generated
    from it are not automatically retracted or hidden; verify manually
    whether they remain trustworthy." and "Prepare a statement from this
    version" remained present.
  - Looked up `pageKey=source_summary:synthetic` (a page whose sources were
    never withdrawn, expanded across two revisions): no `⚠` warning and no
    `role="alert"` element rendered anywhere in either revision's sources
    block — proving the warning only appears for an actually-withdrawn
    source, not unconditionally.
  - Fixture was cleanly stopped via `POST /fixture/stop` (0 fail on the
    underlying test process); the disposable database directory was removed
    by the test's own cleanup; the `next start` process on port 3196 was
    killed afterward.
- Full check suite on the final diff:
  - `pnpm lint` (`node scripts/lint.mjs`): pass, 311 files checked.
  - `pnpm typecheck` (`tsc --noEmit`): pass, no errors.
  - `next build --webpack`: pass (production build succeeded; used for the
    browser fixture above).
  - `pnpm test:contract`: 534/534 pass, 0 fail, 0 skip — unchanged from the
    prior round's baseline (this round adds no new contract-level unit,
    only the integration-level round trip above).
  - `pnpm evals`: 35/35 pass, no regression.
  - `pnpm test` (static-output + design foundation, run after the production
    build above so `.next/server/app/index.html` exists): 22/22 pass.
  - `pnpm test:security`: 149 pass / 0 fail / 1 skip — matches the most
    recent prior round's recorded clean baseline. (First attempt without
    disabling the Bash sandbox hit `listen EPERM: 127.0.0.1` on 3
    loopback-server tests in `tests/security/identity/native-redirects.test.mjs`
    — a sandbox network restriction, not a code regression; rerunning with
    the sandbox disabled for that one command reproduced the clean 149/0/1
    baseline.)
  - `pnpm test:integration` (generic suite, excludes the native-Postgres
    opt-in file run separately above): 23 pass / 0 fail / 76 skip —
    unchanged from baseline.
  - `pnpm docs:check`: pass.
  - `pnpm db:verify`: reports `database-baseline-present` / `not-configured`
    for all three RPC paths, identical to before this change — expected,
    since this round's migration is not applied to any Supabase project and
    the check itself is unrelated to the read shape.
  - `git diff --check`: pass, no whitespace errors.
  - Confirmed the working tree only contains this round's intended files
    before committing — running `pnpm evals` regenerates several unrelated
    `artifacts/**/*.json`/`*.md` files with fresh hashes/timestamps as a
    side effect of existing eval scripts (not caused by this diff); those
    were reverted with `git checkout --` before staging, so this PR's diff
    is scoped to the Wiki withdrawal-status-UI change only.

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
node node_modules/next/dist/bin/next build --webpack
node --test tests/static-output.test.mjs tests/design/web-06-foundation.test.mjs
node scripts/lint.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/docs-check.mjs
node scripts/db-verify.mjs
git diff --check

# Browser fixture (separate terminal for the server):
node node_modules/next/dist/bin/next start -p 3196 &
LC_ALL=C VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@16/bin \
  VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
  VP_WIKI_BROWSER_FIXTURE=1 node --test tests/integration/knowledge/wiki-draft.test.mjs
# once BROWSER_FIXTURE_READY prints, open http://127.0.0.1:3197/ops/wiki
# and look up pageKey source_summary:read-withdrawal-fixture
curl -X POST http://127.0.0.1:3197/fixture/stop
```

`VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE` point at Homebrew's native
`postgresql@16` binaries and a `pg` npm package installed into a scratch
directory in a prior round (this sandbox has neither Docker nor a
pre-installed `@embedded-postgres` package, same environment condition
recorded in every prior round's verification doc).

## Remaining scope

UNRUN, unchanged from before this round: a withdrawal *action* in
`/ops/wiki` (this round only added the read-only display); cascading
revocation of an already-created `wiki_page_revisions` row whose cited
source is withdrawn after that revision was created; automated
scanning/notification of newly-withdrawn sources against in-flight or
already-generated pages; real-model verification of injection resistance;
true multi-source page *synthesis* (combining several sources into one
narrative, as opposed to evidence-binding, which was already covered);
real per-call RMB cost reconciliation; Docling/parser integration. #359
remains OPEN; this PR advances it but does not complete it.

Rollback: revert the migration file (a pure `create or replace function`
restoring the immediately-prior `public.ops_wiki_read_v1` definition from
migration `20260914130000`), the three added fields in
`lib/server/knowledge/wiki/read-model.ts`, the `sourceWithdrawalNote`
helper and its one render site in `app/ops/wiki/workspace.tsx`, and the two
new integration-test subtests. No other migration, RPC, or existing field
is touched, so rollback has no data-shape implications for anything else.
