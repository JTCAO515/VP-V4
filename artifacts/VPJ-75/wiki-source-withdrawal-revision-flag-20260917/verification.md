# #359 revision-level "cites a withdrawn source" flag — 2026-09-17 (round 19)

Baseline: merged main `48bd734` (PR #436, round 18's `/ops/wiki` withdraw-source
write action). Isolated git worktree `vp-v4-work-round19`, branch
`feat/vpj-75-359-cascade-revision-flag-20260917`.

## Result and scope

`docs/contracts/wiki-source-withdrawal.md`'s "What this does not do" and
`artifacts/VPJ-75/unrun.md`'s own recorded next step both named the same gap:
**"No cascading revocation. A `wiki_page_revisions` row that already cites a
source *before* that source is later withdrawn is left exactly as-is ...
Surfacing 'one of this page's cited sources has since been withdrawn' to an
Ops reviewer is not built."** This round builds the "surfacing" half only, as
a **marking-only** flag — it never hides, merges, blocks any existing action,
or retroactively invalidates a revision, matching every prior withdrawal
slice's boundary.

- New pure function `citedWithdrawnSources(sources)` in
  `lib/server/knowledge/wiki/read-model.ts`. It adds **zero new migration,
  zero new RPC, zero new fetch** — `ops_wiki_read_v1` has returned
  `withdrawnAt`/`withdrawnBy`/`withdrawalReason` on every source since round
  17's migration `20260917100000`; this only filters an already-fetched
  revision's `sources[]` down to the withdrawn ones, in the same idiom this
  codebase already uses for `detectProposalConflicts`/`conflictsByProposal`.
- `app/ops/wiki/workspace.tsx`: each rendered revision (current and previous
  — the two revisions the existing read RPC already returns) now shows a
  bilingual `role="alert"` line directly under its header, before any
  collapsed section, naming how many of its cited sources have since been
  withdrawn. The prior round's per-source note inside the collapsed "Sources
  and original location" `<details>` block is unchanged and still renders.
- No change to `ops_wiki_generation_v1`, `ops_source_revision_withdraw_v1`,
  or any migration. `supabase/migrations/**` is untouched this round.

This does not add an automated scan/notification for newly-withdrawn sources
against pages not currently being viewed, does not extend beyond the two
revisions the existing read RPC returns (no full history), does not touch
the separate `publications`/Fact-publication pipeline, and does not claim
real-model verification, multi-source synthesis, RMB reconciliation, or
Docling integration — none of those were in scope and none are claimed done.

## Actual verification

### Pure-function unit tests (no database)

`tests/contract/knowledge/wiki-read-model.test.mjs` (new file), run directly:

```
node --test tests/contract/knowledge/wiki-read-model.test.mjs
```

3/3 pass — empty/order-preserving on no withdrawal, exact single-entry
surfacing with id/who/when/reason, multiple-withdrawn-sources-in-order.

### Real native PostgreSQL 16 integration test

Same harness every prior VPJ-75 slice has used (this sandbox has neither
Docker nor a pre-installed `@embedded-postgres` package; Homebrew
`postgres`/`pg_ctl`/`initdb` directly as `VP_WIKI_PG_BIN`, `LC_ALL=C` required
to start at all):

```
LC_ALL=C VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@16/bin \
  VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
  node --test tests/integration/knowledge/wiki-draft.test.mjs
```

Full file: **30/30 pass / 0 fail / 0 skip** (29 baseline + 1 new). The new
subtest, `citedWithdrawnSources correctly flags a real, already-persisted
two-source revision once only ONE of its cited sources is withdrawn`:

- Inserts two real `source_revisions` rows, then persists one real revision
  citing **both** via the actual `ops_wiki_generation_v1` `claim`/`complete`
  dispatcher (`runWikiGenerationJob` + `completeWikiGenerationJob`) — not a
  synthetic fixture.
- Reads it via the real `ops_wiki_read_v1` RPC before either source is
  withdrawn: `citedWithdrawnSources` returns `[]`.
- Withdraws **only source A** via the real `ops_source_revision_withdraw_v1`
  RPC (the `withdraw` helper already used by every prior withdrawal test in
  this file).
- Re-reads via the real RPC: `citedWithdrawnSources` returns exactly one
  entry, with source A's real id, real `withdrawnBy` (the real actor id) and
  the real withdrawal reason — proving the correlation is genuine, not
  hard-coded.
- Asserts the revision's own `validationStatus` and `draftContent` are
  byte-identical before and after — no cascading revocation of the revision
  itself.
- Asserts source B (never withdrawn) is absent from the flagged list —
  proving this is a real per-source correlation, not a page-wide or
  always-on flag.

### Real browser verification

Via the repo's existing `VP_WIKI_BROWSER_FIXTURE=1` loopback fixture: built
the real production bundle (`next build --webpack`), started it on port
3196, ran the integration test with `VP_WIKI_BROWSER_FIXTURE=1` (29/29 body
assertions pass before the fixture opens), then drove a real browser session
(Claude Code's Browser tool, not a synthetic DOM) against
`http://127.0.0.1:3197/ops/wiki` (real Next.js SSR/CSR, real request
handlers, real native PostgreSQL; auth is SQL-claims actor injection, not
GoTrue):

- Looked up `pageKey=source_summary:cascade-flag-fixture` (the fresh
  two-source fixture created by the new integration subtest): the current
  version's header immediately showed "⚠ 此版本引用的 1 个来源已被撤回，展开下方
  "来源与原文位置"逐条核实其原因；此提醒不会自动撤销或隐藏这份已生成的草稿，是否仍
  可信需人工判断。" — confirmed as an `alert`-role element via the
  accessibility tree (`find`), not just visible text, and confirmed the
  count is exactly **1**, not 2 — without expanding any collapsed section.
- Switched the language selector to English: the same revision showed "⚠ 1 of
  the source(s) cited by this revision have since been withdrawn. Expand
  "Sources and original location" below to review each reason; this notice
  does not automatically retract or hide this already-generated draft --
  whether it remains trustworthy needs manual review." and "Prepare a
  statement from this version" remained a live link.
- Expanded "Sources and original location (2)": source A shows the prior
  round's per-source withdrawal note (with the real timestamp and reason);
  source B still shows its live "Withdraw this source" control, proving the
  new revision-level flag coexists with, and does not replace or hide, the
  existing per-source UI.
- Looked up `pageKey=source_summary:reclaim-fixture` (a page whose only
  cited source has never been withdrawn): no `⚠` badge and no new
  `role="alert"` element rendered under the revision header — proving the
  flag is genuinely conditional, not unconditional.
- Also observed, incidentally, that `pageKey=source_summary:synthetic` (an
  existing multi-revision fixture whose source is withdrawn by an
  *unrelated*, pre-existing test elsewhere in the same file) correctly shows
  the new badge on **both** its current and previous revision — confirming
  the flag applies independently to every rendered revision, not only the
  current one.
- Fixture was cleanly stopped via `POST /fixture/stop`; the `next start`
  process on port 3196 was killed afterward; the browser tab was closed.

## Full check suite on the final diff

- `pnpm lint` — Source policy lint passed (311 files checked).
- `pnpm typecheck` — clean, zero errors.
- `pnpm build` (`next build --webpack`) — succeeds, `/ops/wiki` compiles.
- `pnpm test` — 22/22 pass (no regression).
- `pnpm test:unit` — 106/106 pass (no regression).
- `pnpm test:contract` — 543/543 pass (540 baseline + 3 new
  `wiki-read-model.test.mjs` cases).
- `pnpm test:security` — 149 pass / 0 fail / 1 skip (identical to baseline;
  pre-existing, unrelated skip).
- `pnpm test:integration` (default run, no native-PG env vars) — 23 pass / 0
  fail / 76 skip (identical to baseline; `wiki-draft.test.mjs` itself is
  gated behind `VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE` and is run separately
  above with those set, where it is 30/30).
- `pnpm evals` — 35/35 pass (no regression). This command writes unrelated
  `artifacts/**` side-effect files (as it does every round); reverted with
  `git checkout --` before committing.
- `pnpm docs:check` — passes (VPJ plan: 76 tasks, 20 replacements, acyclic
  dependencies, contracts and archive hashes; AI Core/VPJ documentation
  baseline passed).
- `pnpm check:flags` — passes (2 R1 flags).
- `pnpm check:assets` — passes (49 ledger records; 9 blocked preview files).
- `git diff --check` — clean, no whitespace errors.
- `pnpm db:verify` — reports the same `database-baseline-present` /
  `not-configured` probe state as before this round (zero migrations this
  round; `supabase/migrations/**` untouched — this is not real Supabase
  evidence, matching every prior round's disclosure).

## What remains, per `artifacts/VPJ-75/unrun.md`

No automated scan or notification of newly-withdrawn sources against pages
an operator is not currently viewing or against in-flight jobs; no history
beyond the current+previous revisions the existing read RPC returns; no
propagation to the separate `publications`/Fact-publication pipeline; real
model calls against the safety-materials fixtures; true multi-source page
synthesis; real per-call RMB cost reconciliation; Docling integration. #359
remains OPEN.
