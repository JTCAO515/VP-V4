# #359 Wiki statement review — 2026-09-15

Baseline: merged main4dc09d465f03c5a618ac1cbf597b8ff735f5f095. Isolated worktree
`VP-V4-wiki-statements`, branch `codex/wiki-statement-review`. Original user
worktree and its iOS/project/localization changes are preserved. #398 was observed
closed without merge; its duplicate body/backfill implementation is not applied.

## Result and scope

An operator can open one exact Wiki revision, select its real source declarations,
write a bilingual statement with conditions/exceptions and submit a linked candidate
through the existing Ops API. The existing independent reviewer/publication/reader
and withdrawal chain is reused. A private atomic linkage records the exact Wiki
origin and `operator_statement` method. New operation IDs with identical statement
content return the canonical candidate; changed/stale/forged source requests reject.

This is an editorial bridge, not automatic statement extraction or complete #359
acceptance. It does not infer source truth from a Wiki summary or invent a historical
body. The generated revision's statement_refs are not rewritten. No new publisher,
reviewer, budget subsystem, vector store, deployment or paid call is introduced.

## Verification

- Native PostgreSQL17.6:14 tests PASS/0fail/0skip. Full prior migration history,
  exact50→53 Wiki rollback, body/receipt/restart regressions, new migration rollback,
  source/version and changed-replay rejection, sequential/concurrent duplicate
  submissions, injected linkage failure rolling back candidate+statement+audit+
  receipt, author self-review/publication denial, independent publication, ordinary
  zh/en read with exact source/conditions/exclusions, withdrawal and private ACL denial.
- Contracts373/373 PASS, including new payload/query/context/open-redirect cases.
- Security146 PASS/1existing environment skip/0fail: aggregate INCOMPLETE.
- Generic integration23 PASS/76environment skips/0fail: aggregate INCOMPLETE.
  The native PostgreSQL opt-in above was separately enabled.
- Lint, typecheck, webpack production build, docs and diff checks PASS.
  `db:verify` reports baseline present and standard paths not-configured; it is
  not real Supabase/GoTrue evidence.
- Actual built browser UI → actual HTTP handler → actual PostgreSQL: selected Wiki
  link/form/source and candidate origin, authored statement persisted, no self-review
  button, zh/en, stale revision rejection, sign-in return retains exact revision,
  desktop1280/mobile390 and retained Arabic RTL checked. A post-commit503 produced
  unknown-ack UI; retry kept exactly1 candidate with the same ID.
- Independent `wiki_review` review found no must-fix issue in migration, ACL,
  source/version/digest, receipt, UI auth and closed sign-in redirect paths. Review
  reused the local execution evidence rather than repeating tests.

Database is an owned native process using pinned temporary binaries as documented
in the prior slice. Auth tables/claims and the model transport are fixtures, not
real GoTrue, JWT or provider acceptance. Browser fixture starts only with explicit
`VP_WIKI_BROWSER_FIXTURE=1`; it serves the production build at3196 through loopback3197,
uses real handlers/SQL with synthetic actor injection, and exposes bounded test-only
stop/drop-next controls. It adds no product feature flag or bypass.

Commands:

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

Logs: `/tmp/vpv4-wiki-statement-db-final.log`,
`/tmp/vpv4-wiki-statement-contract.log`, `/tmp/vpv4-wiki-statement-security.log`,
`/tmp/vpv4-wiki-statement-integration.log`, `/tmp/vpv4-wiki-statement-build-final.log`.
Browser fixture shutdown and disposable database cleanup were completed before PR.

## Findings and limits

Browser found sign-in would lose pinned Wiki context: added a closed allowlist,
not arbitrary query redirects. New source checkbox initially inherited oversized
input styling; it now uses existing small checkbox style and hides irrelevant mode
switches for a Wiki draft. A restart navigation happened before fixture readiness,
causing connection refusal; a fresh tab after readiness recovered. A TCP-drop probe
showed saved rather than unknown UI; retained that observation and used explicit
post-commit503 for the unknown-ack test. Before/after retry count was1 and candidate
ID was identical. No failure case or original acceptance target was deleted.

UNRUN: real GoTrue/Cookie/paid model/Staging producer-consumer; new and previous Wiki
remote migrations plus fresh encrypted backup/restore; model statement extraction,
precise spans, full source/procedure/topic coverage, adversarial material semantics,
source withdrawal-before-provider dispatch, running-worker recovery/unknown fees,
native/physical/Store and complete parent acceptance. Last verified Staging50 had
Wiki absent/Ops off; browser login was restored but remote schema/Ops authorization
remains distinct from #397's merge/CI-wait waiver. That waiver does not apply to this
new PR. No remote data, permissions or production configuration changed.

Rollback: disable new entry; retain candidate/source/link/receipt history and use
compatible forward migration repair. #359 remains open. CI is recorded on the PR.
