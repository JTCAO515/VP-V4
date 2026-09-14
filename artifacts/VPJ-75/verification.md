# #359 slice 3 — complete draft storage and Ops inspection

Baseline: `origin/main@3631e7e005c5db27637ae7eb7c773eaf7e160fc8`, refreshed
2026-09-14. No open PR at kickoff. Dedicated branch `codex/wiki-draft-persistence`.
The original local development-plan file is retained, untracked and excluded.
One outcome: store the complete generated draft and inspect its body, differences,
source declarations and job state in the existing Ops workspace. Parent #359 stays open.

## Implemented

- Append-only nullable `draft_content` migration; historical rows stay NULL, old
  exact receipts replay, new success requires the full closed `{summary,gaps}`.
- Completion adapter forwards the full output, separately from the short change
  note, through the existing Ops RPC. No provider retry, scheduler or new budget
  implementation. Body/version/job/receipt remain atomic; page-before-job locking
  keeps claim and completion consistent.
- Ops reader uses existing live session/member/switch guard and private schema
  protections. Current/previous versions and source data share one SQL snapshot.
- `/ops/wiki` and `/api/ops/wiki`, linked from the existing review workspace:
  zh/en, summary and gaps, explicit additions/removals, source snippets/locators,
  historical-body absence and job state. No publication or Trip writes.
- Adjacent paths `app/ops`, `app/api/ops`, iOS README and generated handoff are the
  actual accepted entry points. No second `apps/ops` application was introduced.

## Actual local validation

| Check | Result | Scope |
| --- | --- | --- |
| Native PostgreSQL 17.6 | PASS, 8/8, zero skips | Full application migration history on existing SQL Auth fixture; upgrade transaction rollback, legacy data/receipt preservation, exact 600-character body and gaps, adapter→SQL→reader, real database process restart, injected receipt failure with full rollback, concurrent version conflict, outsider/revocation/ACL denial |
| Contract suite | PASS, 368/368 | Includes 10 new complete-consumer and HTTP guard tests; worker transport is mocked |
| Security suite | INCOMPLETE: 146 pass, 1 existing environment skip | No failure; not full live security acceptance |
| Generic integration suite | INCOMPLETE: 23 pass, 76 environment skips | The separate native PostgreSQL test above was explicitly enabled and passed |
| Lint / typecheck / build | PASS | Next.js webpack production build; new route compiles |
| Docs / diff check | PASS | Handoff regenerated from JSON; user plan excluded |
| `db:verify` | PASS only as baseline check | Reports all three standard connection paths `not-configured`; not evidence of live Supabase |
| Browser | PASS within fixture scope | Actual compiled UI, zh/en at desktop1280 and mobile390×844; body/diff/source expansion, legacy NULL warning, missing-page/retry and escaped HTML; no horizontal overflow at390. Unconfigured actual API503 correctly hides data |
| Independent review | PASS, no remaining must-fix finding | `wiki_review` reviewed migration/ACL/receipt/version/reader/consumer and final text rendering; no self-approval claim |

The database runs an actual native PostgreSQL17.6 process, using
`@embedded-postgres/darwin-arm64@17.6.0-beta.15` and `pg@8.16.3` installed only under
`/tmp/vpwiki-pg-runtime` (not project dependencies). It listens only on its owned
0700 Unix socket; the test stops it and removes its disposable directory.
[Binary package source](https://github.com/leinelissen/embedded-postgres).
Auth tables and SQL claims come from the repository's existing
`tests/integration/turn/fixtures/durable-work-schema.sql`. **This is not GoTrue/JWT
acceptance.** The model response is injected synthetic content, with zero paid calls.

Browser fixtures are the SQL reader output saved by the same test through
`VP_WIKI_FIXTURE_DIR=/tmp/vpwiki-browser-fixture`. A temporary loopback proxy on3198
supplies only `/api/ops/wiki` fixture responses and forwards the real built app on3199.
It is not an authentication or Staging proof. No product fixture flag was added.
The literal `<script>alert(1)</script>` is displayed as text without a dialog.

## Reproduction and retained failures

Use repository pnpm9.15.9 and a compatible Node runtime. This device has Node24.19.0;
CI uses Node22. The default bundled pnpm11 first failed frozen installation because
it interprets overrides differently; `pnpm dlx pnpm@9.15.9 install --frozen-lockfile`
succeeded without changing the lockfile. `npm`/`gh` were not in PATH.

```sh
VP_WIKI_PG_BIN=/tmp/vpwiki-pg-runtime/node_modules/@embedded-postgres/darwin-arm64/native/bin \
VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
node --test tests/integration/knowledge/wiki-draft.test.mjs
node scripts/run-ci-suite.mjs contract
node scripts/run-ci-suite.mjs security
node scripts/run-ci-suite.mjs integration
node scripts/lint.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
node scripts/db-verify.mjs
node scripts/docs-check.mjs
git diff --check
```

Local logs: `/tmp/vpv4-wiki-db.log`, `/tmp/vpv4-contract.log`,
`/tmp/vpv4-security.log`, `/tmp/vpv4-integration.log`, `/tmp/vpv4-build.log`.
The native binary package postinstall was initially blocked by pnpm's script policy;
its inspected symlink-only hydration script was then run in that package directory.
Independent review found SQL `btrim/length` did not match JS trim/UTF16; fixed by an
explicit whitespace/code-unit validator and verified with newline/tab/NBSP/emoji
counterexamples. The original test goals were preserved. The temporary dev proxy
initially did not hydrate; the compiled production app fixture path passed instead.

## Current environment and remaining acceptance

- GitHub connector can read/write this repository. Local HTTPS Git push has no
  username credential; delivery uses the connector, then fetches and verifies the
  identical Git tree locally. No credential is requested or stored in chat.
- Supabase connector lists only `VP-Final-V2`; the designated Staging project
  `dzqdzetcctkhbrhlxxgn` explicitly returns permission denied. The other project
  was not changed. Target migration version, worker status and production guard
  could not be verified through this access; no remote migration/deployment occurred.
- Docker/Supabase CLI and previous local model/map env files were not found.
  Xcode26.6 is available with explicit `DEVELOPER_DIR`; no iOS code or runtime
  acceptance was part of this slice.
- UNRUN: actual GoTrue Cookie→worker→paid provider→Staging complete→process restart
  →Ops readback, full Supabase/advisors and target restore. No fresh paid-call
  budget has been established; historical probe budget is not reused.
- UNRUN: statement/span extraction and validation, source/procedure/topic publication,
  separate reviewer→ordinary reader chain, revoked-source dispatch protection,
  running-job recovery/cancel/unknown-fee reconciliation and fixed bilingual adversarial
  material acceptance. These remain #359 work, not waived by this PR.
- Issue unblock authority is confirmed by JT in this task; stale blocked label on
  #359 removed. This does not close the parent or authorize merge/production release.

PR CI remains separately visible on the PR. Do not equate green default CI skips
with complete target-environment acceptance. Roll back by disabling this consumer;
retain stored body data, all historical records and receipts. Applied migrations
receive compatible forward repairs only.
