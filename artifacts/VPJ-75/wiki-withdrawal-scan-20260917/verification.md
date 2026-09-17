# #359 automated scan for pages/jobs citing a withdrawn source (round 20)

Baseline: merged main `7758d01` (PR #437, round 19's revision-level withdrawn-source
flag). Isolated git worktree `vp-v4-work-round20`, branch
`feat/vpj-75-359-withdrawal-scan-20260917`.

## Result and scope

`docs/contracts/wiki-source-withdrawal.md`'s "What this does not do" and
`artifacts/VPJ-75/unrun.md` both named the same remaining gap: **"No
automated scan. Nothing periodically checks in-flight `running` jobs against
newly-withdrawn sources; the barrier only fires when a `claim` or `complete`
call actually happens for that job."** The round-19 per-page flag
(`citedWithdrawnSources`) only ever surfaces when an operator opens that
specific page — there was no way to see the full picture across every page
and every in-flight job at once.

This round builds that global, read-only scan:

- **Migration** `supabase/migrations/20260917110000_vpj_75_359_wiki_withdrawal_scan.sql`:
  - `alter table knowledge_review_private.wiki_generation_jobs add column source_revision_ids uuid[];`
    (nullable, additive).
  - `create or replace function public.ops_wiki_generation_v1` — **every
    existing check, branch, exception and statement is byte-for-byte
    identical** to the live function from `20260916120000_vpj_75_359_wiki_source_withdrawal.sql`.
    The only diff is two new assignments (each marked `-- NEW` in the
    migration file) that additionally record the already-validated
    `sourceRevisionIds` onto the job row at `claim()` time — once in the
    fresh-job-insert branch, once in the terminal-job-reclaim/retry branch.
    Barrier 1 / barrier 2, `claimToken` fencing, idempotent receipts and
    every validation rule are untouched.
  - New read-only RPC `public.ops_wiki_withdrawal_scan_v1` — same
    `current_actor()`-only authentication idiom as `ops_wiki_read_v1`'s
    no-`pageKey` branch. Scans **every** page's current/previous revision
    (same two-revision scope the existing read RPC already exposes) and
    **every** `queued`/`running` job for one whose `source_revision_ids`
    intersects a withdrawn source. Nothing is written, hidden, cancelled or
    retried.
- `lib/server/knowledge/wiki/http-wiki.ts`: `GET /api/ops/wiki?scan=withdrawn`
  calls the new RPC. Mutually exclusive with `pageKey`; the pre-existing GET
  (`pageKey`/list) and POST (`withdraw_source`) behavior is unchanged.
- `lib/server/knowledge/wiki/read-model.ts`: new `WikiWithdrawalScan` type
  (TypeScript-only, no runtime validator, matching `WikiRead`'s own
  precedent).
- `app/ops/wiki/workspace.tsx`: the landing view (shown before any page is
  selected) now fetches the scan on its own poll cycle (same 25s interval
  the existing page list already uses), independent of page
  selection/lookup — a scan failure never blocks or blanks the page
  list/detail. When non-empty it renders a bilingual `role="alert"` panel
  listing every affected page version (clickable, loads that page) and every
  affected running job (clickable via its page key).

Because this round modifies `ops_wiki_generation_v1` — a function real
in-flight dispatch traffic depends on — the migration file itself documents
exactly which two lines are new, and this document plus the PR description
name the same diff for line-by-line review against the `20260916120000`
baseline.

## What this does not do

- No automatic action — advisory only, same as every prior withdrawal
  slice.
- No periodic/background execution or outbound notification (email/webhook)
  — this is a pull-based RPC the UI polls on its existing cadence.
- No reconstruction of pre-migration job state — a job claimed before this
  migration has `source_revision_ids = null` and is excluded, not guessed.
- No full revision history — same current/previous scope as
  `ops_wiki_read_v1`.
- No real model call, RMB reconciliation, or Docling integration.

## Actual verification

### Real native PostgreSQL 16 integration test

Same harness every prior VPJ-75 slice has used (this sandbox has neither
Docker nor a pre-installed `@embedded-postgres` package; Homebrew
`postgres`/`pg_ctl`/`initdb` directly as `VP_WIKI_PG_BIN`, `LC_ALL=C`
required to start at all — a real local environment condition, not a code
defect):

```
LC_ALL=C VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@16/bin \
  VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
  node --test tests/integration/knowledge/wiki-draft.test.mjs
```

Full file: **35/35 pass / 0 fail / 0 skip** (30 baseline + 5 new):

1. **`withdrawal-scan migration rolls back cleanly and preserves prior
   receipt replay`** — the new column and `to_regprocedure` both
   disappear/reappear across a real rollback+recommit; an already-persisted
   receipt (`completeWikiGenerationJob(rpc,completion,outcome)`) still
   replays byte-identically afterward.
2. **`claim() additively records sourceRevisionIds on the job row; every
   existing claim/complete behavior ... is unchanged`** — a real `claim()`
   persists the exact `sourceRevisionIds` array on the job row; a real
   fail-then-retry (the pre-existing terminal-job-retry branch) still mints
   a fresh `claimToken` (asserted `notEqual` to the original) and keeps the
   recorded set current.
3. **`ops_wiki_withdrawal_scan_v1: real cross-page/cross-job scan finds
   exactly the affected page and the affected in-flight job, and never the
   unaffected control fixtures`** — the core scenario test:
   - A never-withdrawn control page+job pair, real end-to-end
     (`runWikiGenerationJob` → `completeWikiGenerationJob`), is asserted
     absent from both `affectedRevisions` and `affectedJobs` both before
     and after the scan's other assertions.
   - Confirms the scan *already* finds `cascadePageKey` (round 19's fixture,
     whose source A was withdrawn in an earlier subtest in this same file)
     with exactly `[cascadeSourceIdA]` — proving the scan surfaces a page
     the operator is *not currently viewing*, using state that predates
     this round.
   - A fresh page+source, withdrawn only inside this test, confirms the
     scan is live (not a cached snapshot): absent before the withdrawal
     call, present with the exact source id after.
   - A real stuck in-flight job: `claim()` with a real source, then
     withdraw that source before completing (reproducing barrier 2's exact
     race, left `running` instead of being cancelled) — absent from
     `affectedJobs` before the withdrawal, present with `status:'running'`
     and the exact source id after.
   - Final assertions confirm the scan changed nothing: the job's status is
     still `running`, the scanned page's version is unchanged.
4. **`ops_wiki_withdrawal_scan_v1 rejects outsiders and malformed input,
   same as every other Ops RPC`** — a real outsider actor gets
   `OPS_FORBIDDEN`; an extra field gets `INVALID_INPUT`.
5. **`HTTP GET /api/ops/wiki?scan=withdrawn calls the real scan RPC end to
   end; an unknown scan value and pageKey+scan together are rejected before
   any RPC call`** — drives `handleWikiRequest` directly (not the RPC in
   isolation): a real `scan=withdrawn` request returns the same real data
   the direct-RPC test found; `scan=bogus`, `scan=withdrawn&pageKey=...`,
   and an outsider's `scan=withdrawn` are all rejected with the correct
   status.

### Real browser verification

Built the real production bundle (`pnpm build`, `next build --webpack`),
served it on port 3196 (`next start`), then ran the integration test with
`VP_WIKI_BROWSER_FIXTURE=1` (all 35 body/DB assertions above passed before
the fixture opened), and drove a real browser session (Claude Code's
Browser tool, not a synthetic DOM) against `http://localhost:3197/ops/wiki`
(real Next.js SSR/CSR, real request handlers, real native PostgreSQL; auth
is the existing SQL-claims actor injection, not GoTrue).

- Landing page (no lookup performed) rendered, in Chinese, "全局扫描：引用已撤回来源的页面与任务" with exactly five `role="alert"` affected-revision entries
  (`cascade-flag-fixture`, `read-withdrawal-fixture`, `scan-revision-fixture`,
  and `synthetic` at both v2 and v3 — the last two reflect the run's very
  last subtest, which withdraws `synthetic`'s own cited source) and exactly
  one affected-job entry (`scan-job-fixture · running`), each showing the
  correct "引用了 1 个已撤回来源" count — confirmed via the accessibility
  tree, not just visible text, so the `role="alert"` semantics were verified
  directly.
- `scan-control-fixture` and `scan-record-fixture` (the never-withdrawn
  control fixtures) correctly do **not** appear in either list, confirmed
  by reading the full page text.
- Switched the language selector to English: the same panel re-rendered as
  "Global scan: pages and jobs citing a withdrawn source" with "Cites 1
  withdrawn source(s)" on every entry — exact English copy match.
- Clicked the `scan-revision-fixture · v1` entry in the scan panel: the app
  navigated to that page's own detail view (same `load(pageKey)` path the
  existing page-list buttons already use), which correctly also showed the
  round-19 per-revision flag ("1 of the source(s) cited by this revision
  have since been withdrawn...") — confirming the two mechanisms (global
  scan and per-page flag) compose correctly and the new panel's click
  target is not a dead end.
- Cleanly stopped the fixture via `POST /fixture/stop` (test file reported
  final 35/35 pass/0 fail/0 skip), killed the `next start` process on port
  3196, and closed the browser tab.

### Full check suite (this diff, this sandbox)

- `pnpm lint` — 311 files, pass.
- `pnpm typecheck` — pass, no errors.
- `pnpm build` (`next build --webpack`) — pass.
- `pnpm test:contract` — **543/543** (identical to the round-19 baseline;
  this round adds zero new contract test files).
- `pnpm test:unit` — **106/106**.
- `pnpm test` (static-output + design) — **22/22**.
- `pnpm evals` — **35/35**.
- `pnpm test:security` — **149 pass / 0 fail / 1 skip** (identical to
  baseline; the one skip is pre-existing and unrelated).
- `pnpm test:integration` — **23 pass / 0 fail / 76 skip** (identical to
  baseline; `wiki-draft.test.mjs` is part of the 76 skips here because
  `VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE` are unset in this run — it was run
  separately, directly, with those set, per above).
- `pnpm docs:check` — pass (`docs/handoff.json` updated; `CONTEXT.md`/
  `HANDOFF.md` regenerated via `node scripts/vpj-program.mjs render-handoff`
  as the tool instructs).
- `pnpm db:verify` — reports the same `not-configured` state as before this
  round (no real Supabase/Staging connection attempted; this migration has
  not been applied to any shared project).
- `pnpm check:flags` / `pnpm check:assets` — pass.
- `git diff --check` — pass (no whitespace errors).

`pnpm evals` produced its usual unrelated `artifacts/**` side-effect files
(hashes/timestamps in `VPJ-206`/`VPJ-66`/`VPJ-70`/`VPJ-72`/`VPJ-75`/`VPJ-76`
fixtures) as it does every round; reverted with `git checkout --` before
finalizing this diff, so the PR only contains this round's actual change.

## Files changed

- `supabase/migrations/20260917110000_vpj_75_359_wiki_withdrawal_scan.sql` (new)
- `lib/server/knowledge/wiki/read-model.ts`
- `lib/server/knowledge/wiki/http-wiki.ts`
- `app/ops/wiki/workspace.tsx`
- `tests/integration/knowledge/wiki-draft.test.mjs`
- `docs/contracts/wiki-withdrawal-scan.md` (new)
- `docs/knowledge-upgrade/README.md`
- `artifacts/VPJ-75/unrun.md`
- `docs/handoff.json`, `CONTEXT.md`, `HANDOFF.md` (regenerated)
- `artifacts/VPJ-75/wiki-withdrawal-scan-20260917/verification.md` (this file)

#359 remains open — see `artifacts/VPJ-75/unrun.md` for the remaining
gaps (real model calls, multi-source synthesis, RMB reconciliation, Docling
integration, and a periodic/notification trigger for this scan beyond the
UI's own poll).
