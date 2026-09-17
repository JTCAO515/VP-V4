# #359 a `/ops/wiki` write action to actually withdraw a source — 2026-09-17 (round 18)

Baseline: forked from main `8f3f8ce` (PR #434, round 17's read-only
withdrawal status wiring). Isolated git worktree `vp-v4-work-round18`,
branch `feat/vpj-75-ops-source-withdraw-ui-20260917`. Later merged
`origin/main` `07775ad` (PR #435, unrelated `docs:check`/`CONTEXT.md`
tooling merged by a separate session while this PR's CI was in flight —
see the CI-fix entry below) with no conflicts.

## Result and scope

`docs/contracts/wiki-source-withdrawal.md` and
`docs/contracts/wiki-source-withdrawal-status-ui.md` both named the same
remaining gap in their own "What this does not do" sections, and
`docs/handoff.json`'s `nextAction` named it as the next step explicitly: "a
write-path `/ops/wiki` UI action to actually withdraw a source (this round
only surfaced status, read-only)". This round fills that gap. It does not
add cascading revocation of an already-generated revision, an automated
scan/notification of newly-withdrawn sources, real-model verification, or
multi-source page synthesis — none of those were in scope and none are
claimed done.

- **No new migration, no new RPC.** `ops_source_revision_withdraw_v1`
  already existed (migration `20260916120000`) with real authentication,
  membership, receipt-based idempotency and idempotent-by-state handling
  already verified by that slice's own tests. This round only adds the HTTP
  and UI path that calls it.
- `lib/server/knowledge/wiki/http-wiki.ts`: `handleWikiRequest` now accepts
  `POST` in addition to the existing `GET`. The GET branch is unchanged
  (verified byte-for-byte by re-running the pre-existing GET contract tests
  unmodified — all pass). The new POST branch requires `sameOrigin`
  (`OPS_FORBIDDEN` before any body read or RPC dispatch), bounds and
  validates the JSON body against a closed `{action:"withdraw_source",
  operationId, sourceRevisionId, reason}` shape, and calls
  `ops_source_revision_withdraw_v1` with exactly the three RPC fields.
- `app/api/ops/wiki/route.ts` gains a `POST` export using the same
  `isSameOriginMutation` guard `/api/ops/review`'s existing POST route uses.
- `app/ops/wiki/workspace.tsx` gains `SourceWithdrawForm`: a two-step,
  explicit-reason control (toggle button → reason input + its own separate
  confirm submit + cancel), deliberately **not** a native `window.confirm()`
  dialog — matching the existing `revoke_statement` idiom in
  `app/ops/review/workspace.tsx` ("a note plus its own submit is the
  confirmation"). Rendered only for a source that is neither already
  withdrawn nor missing. On success it re-reads the current page; the
  previously-built (round 17) advisory `role="alert"` note then renders and
  the withdraw control disappears for that source, matching the same
  `!source.withdrawnAt` condition that already governed the note.

## Actual verification

- Real database + real HTTP-handler round trip:
  `tests/integration/knowledge/wiki-draft.test.mjs` gained one new subtest
  against real native PostgreSQL 16 (Homebrew, `LC_ALL=C`, no Docker in this
  sandbox — same environment workaround every prior VPJ-75 slice has used),
  calling `handleWikiRequest` itself (the exact function the API route
  calls), not the RPC directly:
  - A `POST` with `sameOrigin: false` is rejected `OPS_FORBIDDEN` before any
    RPC call.
  - A real outsider actor's `POST` (a real `auth.users`/`auth.sessions` row
    with no `knowledge_review_private.members` row) is rejected
    `OPS_FORBIDDEN` by the RPC's own real `current_actor()` check, and the
    real database row is confirmed untouched (`withdrawn_at` still `null`)
    afterward.
  - A real author's `POST` succeeds (200), and the real database row is
    updated with the real actor id and reason.
  - A subsequent real `GET` through the same `handleWikiRequest` (the exact
    read path an operator's next page load uses) surfaces the withdrawal —
    proving the write and read paths compose correctly, not just that the
    RPC ran in isolation.
  - A replay `POST` under a **new** `operationId` does not overwrite the
    original reason — the same idempotent-by-state guarantee the RPC's own
    test already proved, now proven through the actual HTTP handler an
    operator's browser calls.
  - Full file: 29/29 pass / 0 fail / 0 skip (28 before this round + 1 new).
- Contract-level tests (mocked RPC, no database):
  `tests/contract/ops/wiki-request.test.mjs` gained 6 new tests covering:
  non-same-origin rejection before RPC creation; a query string, missing/
  wrong content-type, unparseable body, and 7 distinct malformed-shape
  bodies (extra field, wrong action, non-UUID ids, empty/whitespace/
  over-length reason) all rejecting `INVALID_INPUT`; failed authentication
  never dispatching the RPC; a valid withdrawal calling
  `ops_source_revision_withdraw_v1` with exactly the three stripped fields;
  known RPC errors (`OPS_FORBIDDEN`/`OPS_NOT_FOUND`/`OPS_CONFLICT`/
  `INVALID_INPUT`) mapping to their documented HTTP status, with an unknown
  error becoming `OPS_ACK_UNKNOWN` (mutation semantics, not
  `OPS_UNAVAILABLE`); and an oversized body rejected without ever finishing
  the read. All 7 pre-existing GET tests in the same file still pass
  unmodified, proving the GET behavior is byte-for-byte unchanged. Full
  file: 13/13 pass.
- Real browser verification via the repo's existing
  `VP_WIKI_BROWSER_FIXTURE=1` loopback fixture: built the real production
  bundle (`next build --webpack`), started it on port 3196, ran
  `tests/integration/knowledge/wiki-draft.test.mjs` with
  `VP_WIKI_BROWSER_FIXTURE=1` (29/29 body assertions pass before the fixture
  opens), then drove a real browser session against
  `http://127.0.0.1:3197/ops/wiki` (real Next.js SSR/CSR, real request
  handlers, real native PostgreSQL; auth is SQL-claims actor injection, not
  GoTrue) with the Claude Browser tool:
  - Looked up `pageKey=source_summary:proposal_fixture` (a page whose cited
    source was never withdrawn by any test, chosen specifically so the
    withdraw control would be live), expanded "来源与原文位置 (1)": the
    "撤回此来源" ("Withdraw this source") button was present.
  - Clicked it: a reason input plus a separate "确认撤回" ("Confirm
    withdrawal") and "取消" ("Cancel") appeared — no native `confirm()`
    dialog. Typed a real reason, clicked "确认撤回".
  - The page re-read itself and now showed: "⚠ 此来源已于 2026/9/17
    10:15:16 被撤回（原因：Real-browser withdrawal verification for VPJ-75
    round 18.）。基于此来源已生成的草稿不会被自动撤销或隐藏，请人工核实其是
    否仍可信。" with `role="alert"` (confirmed via the accessibility tree
    `find`, not just visible text) — the round-17 advisory note, now driven
    by this round's real write action instead of a directly-inserted test
    row. The withdraw button/form no longer appeared for that source (an
    `interactive`-filtered accessibility read of that section showed no
    controls), and the two "核对并编辑此提案" ("Verify and edit this
    proposal") links for the page's statement proposals remained present
    and unaffected — no cascading hide of anything else on the page.
  - Switched the language selector to English: the same note rendered as
    "⚠ This source was withdrawn on 9/17/2026, 10:15:16 AM (reason:
    Real-browser withdrawal verification for VPJ-75 round 18.). Drafts
    already generated from it are not automatically retracted or hidden;
    verify manually whether they remain trustworthy." with `role="alert"`.
  - Fixture was cleanly stopped via `POST /fixture/stop`; the `next start`
    process on port 3196 was killed afterward; both ports confirmed free.
  - Real-browser automation note: the headless tab intermittently reset to
    its initial empty-list state between separate tool round-trips (visible
    as `ERR_CONNECTION_REFUSED` console entries and a full remount back to
    `load(null)`) — a tooling/environment timing artifact of this sandbox's
    browser automation, not a defect in the page: batching the click →
    fill → submit sequence into fewer, faster tool calls (with the tab kept
    fronted) reproduced the flow cleanly and repeatably. Recorded here for
    the next round rather than silently omitted.
- CI caught a real gap in local verification: `pnpm test:unit` was not run
  locally before the first push, and GitHub's required `deterministic-pr-gates`
  job failed it -- `tests/unit/governance/direct-issue-queue.test.mjs`
  asserts `docs/handoff.json`'s `lastUpdated` field matches
  `/^\d{4}-\d{2}-\d{2}$/` (a date-only string), and this round's first edit
  had written `"2026-09-17 (round 18)"` into that field. Fixed by reverting
  `lastUpdated` to the plain `"2026-09-17"` date (the `(round 18)` context
  belongs in `status`/`owner`, which are free text, not `lastUpdated`).
  `pnpm test:unit` then passed 100/100 locally, and the full check suite
  below was rerun after the fix.
- A second CI attempt then failed `pnpm docs:check` with "CONTEXT.md is
  stale" -- main had advanced past this branch's fork point (PR #435,
  "keep handoff views current and narrow planning-only CI", merged after
  this branch was created) and added a new `docs:check` step that renders
  `CONTEXT.md`/`HANDOFF.md` from `docs/handoff.json` and fails if they are
  out of sync. Merged `origin/main` into this branch (no conflicts) and ran
  `node scripts/vpj-program.mjs render-handoff` as the error message
  instructed, which regenerated `CONTEXT.md`/`HANDOFF.md` from this round's
  already-correct `docs/handoff.json` content -- a pure derived-file
  regeneration, not a new hand-written claim. `pnpm docs:check` then passed,
  and the full check suite below was rerun a third time against the merged
  tree to confirm no regression from picking up main's other changes.
- Full check suite on the final diff:
  - `pnpm lint` (`node scripts/lint.mjs`): pass, 311 files checked.
  - `pnpm test:unit`: 106/106 pass, 0 fail, 0 skip (rose from 100 to 106
    after merging main, which added new unit test files for the
    `docs:check` tooling itself; unrelated to this PR's own changes).
  - `pnpm typecheck` (`tsc --noEmit`): pass, no errors.
  - `next build --webpack`: pass (production build succeeded; used for the
    browser fixture above).
  - `pnpm test:contract`: 540/540 pass, 0 fail, 0 skip (534 baseline + 6 new
    POST contract tests, no regression).
  - `pnpm evals`: 35/35 pass, no regression.
  - `pnpm test` (static-output + design foundation, run after the
    production build above so `.next/server/app/index.html` exists): 22/22
    pass.
  - `pnpm test:security`: 149 pass / 0 fail / 1 skip — matches the
    documented clean baseline.
  - `pnpm test:integration` (generic suite, excludes the native-Postgres
    opt-in file run separately above): 23 pass / 0 fail / 76 skip —
    unchanged from baseline.
  - `pnpm docs:check`: pass.
  - `pnpm db:verify`: reports `database-baseline-present` / `not-configured`
    for all three RPC paths, identical to before this change — expected,
    since this round adds no migration and touches no `supabase/migrations/**`
    file.
  - `git diff --check`: pass, no whitespace errors.
  - Confirmed the working tree only contains this round's intended files
    before committing — `pnpm evals` regenerates several unrelated
    `artifacts/**/*.json`/`*.md` files with fresh hashes/timestamps as a
    side effect of existing eval scripts (not caused by this diff, same
    behavior recorded in the prior round's verification doc); those were
    reverted with `git checkout --` before staging, so this PR's diff is
    scoped to the Wiki withdrawal-action write path only.

All provider/model calls anywhere in this diff's tests are scripted
fixtures, real-database calls, or absent; this round made zero paid calls.
Auth in both the native-PostgreSQL test and the browser fixture is the
repository's existing SQL-claims actor injection, not real GoTrue/JWT.

## Reproduction

```sh
LC_ALL=C VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@16/bin \
  VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
  node --test tests/integration/knowledge/wiki-draft.test.mjs
node --test tests/contract/ops/wiki-request.test.mjs
node scripts/run-ci-suite.mjs unit
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
# once BROWSER_FIXTURE_READY prints, open http://127.0.0.1:3197/ops/wiki,
# look up pageKey source_summary:proposal_fixture, expand its sources, and
# click through "撤回此来源" / "Withdraw this source"
curl -X POST http://127.0.0.1:3197/fixture/stop
```

`VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE` point at Homebrew's native
`postgresql@16` binaries and a `pg` npm package installed into a scratch
directory in a prior round (this sandbox has neither Docker nor a
pre-installed `@embedded-postgres` package, same environment condition
recorded in every prior round's verification doc).

## Remaining scope

UNRUN, unchanged from before this round: cascading revocation of an
already-created `wiki_page_revisions` row whose cited source is withdrawn
after that revision was created; automated scanning/notification of
newly-withdrawn sources against in-flight or already-generated pages; bulk
withdrawal (one source per action, matching the RPC's own input shape);
real-model verification of injection resistance; true multi-source page
*synthesis* (combining several sources into one narrative, as opposed to
evidence binding, which was already covered); real per-call RMB cost
reconciliation; Docling/parser integration. #359 remains OPEN; this PR
advances it but does not complete it.

Rollback: revert the `POST` branch in `handleWikiRequest`
(`lib/server/knowledge/wiki/http-wiki.ts`) back to the GET-only function,
the `POST` export in `app/api/ops/wiki/route.ts`, the `SourceWithdrawForm`
component and its one render site in `app/ops/wiki/workspace.tsx`, the new
contract tests, and the new integration subtest. No migration, RPC, or
existing field is touched by this round, so rollback has no data-shape
implications for anything else — `ops_source_revision_withdraw_v1` and
`ops_wiki_read_v1` are exactly as the prior two rounds left them.
